# Consulta de CEP

> Preenche o endereço pelo CEP na BrasilAPI v2 com fallback ViaCEP, retorno normalizado e cache. Checkout e cadastro mais rápidos, com menos erro de entrega.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/consulta-cep

Criado por **FlowCore Soluções LTDA**.

## Arquivos

- [`src/consulta-cep.ts`](src/consulta-cep.ts)
- [`src/consulta-cep.test.ts`](src/consulta-cep.test.ts)

## Como instalar

1. **Funciona onde você já roda** Node 18+, Cloudflare Workers, Deno, Bun, Vercel e Netlify Functions. Zero dependência: só fetch e Web Crypto, que já vêm no runtime.
2. **Crie src/lib/consulta-cep.ts** Copie o conteúdo de `src/consulta-cep.ts` e `src/consulta-cep.test.ts` deste repositório.
3. **Use**

   ```bash
   const cep = criarConsultaCep();
   const endereco = await cep.consultar("01001-000");
   // { logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP", ... }
   ```

4. **Rode o teste junto** O arquivo de teste (`src/consulta-cep.test.ts`) cobre 8 cenários. Copie para src/lib/ ao lado e rode:

   ```bash
   npm install -D vitest
   npx vitest run src/lib
   ```


## Testes

`src/consulta-cep.test.ts` cobre 8 cenários.

```bash
npm install
npm test
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
