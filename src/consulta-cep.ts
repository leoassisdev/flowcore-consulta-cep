// consulta-cep.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Busca endereço por CEP na BrasilAPI v2 com fallback pro ViaCEP, normaliza o
// retorno (mesmo formato seja qual for a fonte), aplica timeout por
// AbortController e guarda em cache com TTL (inclusive "CEP inexistente").
// Roda em Node 18+, Cloudflare Workers, Deno e Bun.
// Zero dependências.
//
// Referências: BrasilAPI (brasilapi.com.br/docs#tag/CEP-V2) e ViaCEP (viacep.com.br).

export const CRIADO_POR = "Criado por FlowCore Soluções LTDA";
export const USER_AGENT_PADRAO = "FlowCore-Codigos/1.0 (Criado por FlowCore Soluções LTDA)";

export type RespostaHttp = { ok: boolean; status: number; json(): Promise<unknown> };
export type FetchLike = (url: string, init?: RequestInit) => Promise<RespostaHttp>;

export type Endereco = {
  /** 8 dígitos, sem máscara. */
  cep: string;
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  /** Código IBGE do município (só ViaCEP informa). */
  ibge: string | null;
  ddd: string | null;
  latitude: number | null;
  longitude: number | null;
  fonte: "brasilapi" | "viacep";
};

export type OpcoesConsultaCep = {
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Validade do cache em ms. Padrão 7 dias (CEP muda pouco). 0 desliga. */
  cacheTtlMs?: number;
  now?: () => number;
  /** User-Agent enviado (server-side). false não envia (use no navegador). */
  userAgent?: string | false;
  urlBrasilApi?: (cep: string) => string;
  urlViaCep?: ((cep: string) => string) | null;
};

export class ErroConsultaCep extends Error {
  constructor(
    message: string,
    readonly codigo: "CEP_INVALIDO" | "INDISPONIVEL" | "TIMEOUT",
  ) {
    super(message);
    this.name = "ErroConsultaCep";
  }
}

/** Limpa e valida o formato do CEP (8 dígitos, não pode ser 00000000). */
export function normalizarCep(valor: string): string | null {
  const d = valor.replace(/\D/g, "");
  return /^\d{8}$/.test(d) && d !== "00000000" ? d : null;
}

export const formatarCep = (cep: string) => {
  const d = normalizarCep(cep);
  if (!d) throw new ErroConsultaCep("CEP inválido", "CEP_INVALIDO");
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

type Bruto = Record<string, unknown>;
const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const coord = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : texto(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function normalizarBrasilApi(d: Bruto): Endereco {
  const loc = (d.location as { coordinates?: Bruto } | undefined)?.coordinates ?? {};
  return {
    cep: String(d.cep ?? "").replace(/\D/g, ""),
    logradouro: texto(d.street),
    complemento: null,
    bairro: texto(d.neighborhood),
    cidade: texto(d.city) ?? "",
    uf: (texto(d.state) ?? "").toUpperCase(),
    ibge: null,
    ddd: null,
    latitude: coord(loc.latitude),
    longitude: coord(loc.longitude),
    fonte: "brasilapi",
  };
}

export function normalizarViaCep(d: Bruto): Endereco {
  return {
    cep: String(d.cep ?? "").replace(/\D/g, ""),
    logradouro: texto(d.logradouro),
    complemento: texto(d.complemento),
    bairro: texto(d.bairro),
    cidade: texto(d.localidade) ?? "",
    uf: (texto(d.uf) ?? "").toUpperCase(),
    ibge: texto(d.ibge),
    ddd: texto(d.ddd),
    latitude: null,
    longitude: null,
    fonte: "viacep",
  };
}

class NaoEncontrado extends Error {}

export function criarConsultaCep(opcoes: OpcoesConsultaCep = {}) {
  const f: FetchLike = opcoes.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = opcoes.timeoutMs ?? 5000;
  const ttl = opcoes.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = opcoes.now ?? Date.now;
  const ua = opcoes.userAgent === undefined ? USER_AGENT_PADRAO : opcoes.userAgent;
  const urlBrasilApi = opcoes.urlBrasilApi ?? ((c: string) => `https://brasilapi.com.br/api/cep/v2/${c}`);
  const urlViaCep = opcoes.urlViaCep === undefined ? (c: string) => `https://viacep.com.br/ws/${c}/json/` : opcoes.urlViaCep;
  const cache = new Map<string, { valor: Endereco | null; expira: number }>();

  async function obter(url: string): Promise<Bruto> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (ua) headers["User-Agent"] = ua;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp: RespostaHttp;
    try {
      resp = await f(url, { headers, signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted) throw new ErroConsultaCep(`Tempo esgotado (${timeoutMs} ms) em ${url}`, "TIMEOUT");
      throw new ErroConsultaCep(`Falha de rede em ${url}: ${(e as Error).message}`, "INDISPONIVEL");
    } finally {
      clearTimeout(timer);
    }
    if (resp.status === 404) throw new NaoEncontrado();
    if (!resp.ok) throw new ErroConsultaCep(`HTTP ${resp.status} em ${url}`, "INDISPONIVEL");
    return (await resp.json()) as Bruto;
  }

  async function buscar(cep: string): Promise<Endereco | null> {
    let erroPrincipal: unknown;
    try {
      return normalizarBrasilApi(await obter(urlBrasilApi(cep)));
    } catch (e) {
      erroPrincipal = e;
    }
    // A BrasilAPI responde 404 quando nenhum provedor dela acha o CEP; mesmo assim
    // o ViaCEP às vezes tem CEPs novos, então ele é consultado nos dois casos.
    if (!urlViaCep) {
      if (erroPrincipal instanceof NaoEncontrado) return null;
      throw erroPrincipal;
    }
    try {
      const d = await obter(urlViaCep(cep));
      if (d.erro === true || d.erro === "true") return null;
      return normalizarViaCep(d);
    } catch (e) {
      if (e instanceof NaoEncontrado || erroPrincipal instanceof NaoEncontrado) return null;
      const timeout = [erroPrincipal, e].every((x) => x instanceof ErroConsultaCep && x.codigo === "TIMEOUT");
      throw new ErroConsultaCep(
        `Nenhuma fonte de CEP respondeu. BrasilAPI: ${(erroPrincipal as Error).message}. ViaCEP: ${(e as Error).message}`,
        timeout ? "TIMEOUT" : "INDISPONIVEL",
      );
    }
  }

  return {
    /** Retorna o endereço normalizado ou null se o CEP não existe. */
    async consultar(cepEntrada: string): Promise<Endereco | null> {
      const cep = normalizarCep(cepEntrada);
      if (!cep) throw new ErroConsultaCep("CEP inválido: informe 8 dígitos", "CEP_INVALIDO");
      const hit = cache.get(cep);
      if (hit && hit.expira > now()) return hit.valor;
      const valor = await buscar(cep);
      if (ttl > 0) cache.set(cep, { valor, expira: now() + ttl });
      return valor;
    },
    limparCache() {
      cache.clear();
    },
  };
}
