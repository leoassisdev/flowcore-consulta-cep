// consulta-cep.test.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
import { describe, expect, it, vi } from "vitest";
import { criarConsultaCep, formatarCep, normalizarCep, type FetchLike } from "./consulta-cep";

const resposta = (corpo: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

const brasilApi = {
  cep: "01001000",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Sé",
  street: "Praça da Sé",
  service: "open-cep",
  location: { type: "Point", coordinates: { longitude: "-46.6339", latitude: "-23.5503" } },
};
const viaCep = {
  cep: "01001-000",
  logradouro: "Praça da Sé",
  complemento: "lado ímpar",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
  ibge: "3550308",
  ddd: "11",
};

describe("consulta-cep", () => {
  it("normaliza e formata CEP", () => {
    expect(normalizarCep("01001-000")).toBe("01001000");
    expect(normalizarCep("1234")).toBeNull();
    expect(normalizarCep("00000-000")).toBeNull();
    expect(formatarCep("01001000")).toBe("01001-000");
    expect(() => formatarCep("abc")).toThrow("CEP inválido");
  });

  it("rejeita CEP inválido sem chamar a rede", async () => {
    const f = vi.fn<FetchLike>();
    await expect(criarConsultaCep({ fetch: f }).consultar("123")).rejects.toMatchObject({ codigo: "CEP_INVALIDO" });
    expect(f).not.toHaveBeenCalled();
  });

  it("usa a BrasilAPI v2 e converte coordenadas pra número", async () => {
    const f = vi.fn<FetchLike>(async () => resposta(brasilApi));
    const end = await criarConsultaCep({ fetch: f }).consultar("01001-000");
    expect(f.mock.calls[0][0]).toBe("https://brasilapi.com.br/api/cep/v2/01001000");
    expect(end).toEqual({
      cep: "01001000",
      logradouro: "Praça da Sé",
      complemento: null,
      bairro: "Sé",
      cidade: "São Paulo",
      uf: "SP",
      ibge: null,
      ddd: null,
      latitude: -23.5503,
      longitude: -46.6339,
      fonte: "brasilapi",
    });
  });

  it("cai pro ViaCEP quando a BrasilAPI falha", async () => {
    const f = vi.fn<FetchLike>(async (url) => (url.includes("brasilapi") ? resposta({}, 502) : resposta(viaCep)));
    const end = await criarConsultaCep({ fetch: f }).consultar("01001000");
    expect(f.mock.calls[1][0]).toBe("https://viacep.com.br/ws/01001000/json/");
    expect(end).toMatchObject({ fonte: "viacep", ibge: "3550308", ddd: "11", complemento: "lado ímpar", cidade: "São Paulo" });
  });

  it("retorna null quando o CEP não existe em nenhuma fonte", async () => {
    const f = vi.fn<FetchLike>(async (url) => (url.includes("brasilapi") ? resposta({}, 404) : resposta({ erro: true })));
    expect(await criarConsultaCep({ fetch: f }).consultar("99999999")).toBeNull();
  });

  it("guarda em cache, inclusive o resultado negativo, respeitando o TTL", async () => {
    let agora = 0;
    const f = vi.fn<FetchLike>(async (url) => (url.includes("brasilapi") ? resposta({}, 404) : resposta({ erro: true })));
    const api = criarConsultaCep({ fetch: f, now: () => agora, cacheTtlMs: 1000 });
    await api.consultar("99999999");
    await api.consultar("99999-999");
    expect(f).toHaveBeenCalledTimes(2);
    agora = 1001;
    await api.consultar("99999999");
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("lança TIMEOUT quando as duas fontes travam", async () => {
    const travado: FetchLike = (_u, init) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("abort"))));
    await expect(criarConsultaCep({ fetch: travado, timeoutMs: 5 }).consultar("01001000")).rejects.toMatchObject({
      codigo: "TIMEOUT",
    });
  });

  it("lança INDISPONIVEL quando BrasilAPI dá erro e o fallback está desligado", async () => {
    const f = vi.fn<FetchLike>(async () => resposta({}, 500));
    await expect(criarConsultaCep({ fetch: f, urlViaCep: null }).consultar("01001000")).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
