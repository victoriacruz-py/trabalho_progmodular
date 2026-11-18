import { describe, expect, it } from "vitest";
import { criarCliente } from "./api";

describe("Interface HTTP da vitrine", () => {
  it("repete uma movimentação incerta com a mesma identidade e conteúdo", async () => {
    const recebidas: Request[] = [];
    const transporte: typeof fetch = async (input, init) => {
      const requisicao = new Request(
        new URL(String(input), "http://loja.test"),
        init,
      );
      recebidas.push(requisicao);
      if (recebidas.length === 1) throw new TypeError("Conexão perdida");
      return Response.json({
        sku: "TEC-01",
        fisico: 8,
        reservado: 0,
        disponivel: 8,
        versao: 2,
      });
    };
    const cliente = criarCliente(transporte);
    cliente.definirToken("token-de-sessao");
    const tentativa = cliente.prepararMovimento({
      sku: "TEC-01",
      tipo: "ENTRADA",
      quantidade: 3,
      justificativa: "Recebimento de mercadoria",
    });
    await expect(tentativa.executar()).rejects.toThrow("conexão");
    await expect(tentativa.executar()).resolves.toMatchObject({
      disponivel: 8,
    });
    expect(recebidas[0]!.headers.get("Idempotency-Key")).toBeTruthy();
    expect(recebidas[1]!.headers.get("Idempotency-Key")).toBe(
      recebidas[0]!.headers.get("Idempotency-Key"),
    );
    expect(recebidas[1]!.headers.get("X-CSRF-Token")).toBe("token-de-sessao");
    expect(recebidas[1]!.credentials).toBe("include");
    expect(await recebidas[0]!.text()).toBe(await recebidas[1]!.text());
  });

  it("usa o token recebido no login e o descarta ao encerrar a sessão", async () => {
    const recebidas: Request[] = [];
    const transporte: typeof fetch = async (input, init) => {
      recebidas.push(
        new Request(new URL(String(input), "http://loja.test"), init),
      );
      if (String(input) === "/api/sessoes" && init?.method === "POST")
        return Response.json({ csrfToken: "token-autenticado" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ versao: 1 });
    };
    const cliente = criarCliente(transporte);
    await cliente.entrar("ana@example.test", "uma-senha-comprida");
    await cliente.configurarRegra({
      tipo: "PRECO",
      sku: "TEC-01",
      precoCentavos: 19990,
    });
    await cliente.sair();
    await cliente.configurarRegra({
      tipo: "PRECO",
      sku: "TEC-01",
      precoCentavos: 29990,
    });
    expect(recebidas[1]!.headers.get("X-CSRF-Token")).toBe("token-autenticado");
    expect(recebidas[2]!.headers.get("X-CSRF-Token")).toBe("token-autenticado");
    expect(recebidas[3]!.headers.has("X-CSRF-Token")).toBe(false);
  });
});
