import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { compose, Services } from "../../apps/api/src/composition";
import { buildApplication } from "../../apps/api/src/http";
import { gestor } from "../helpers";

describe("Fronteira HTTP — identidade e validação", () => {
  let services: Services, app: INestApplication;
  beforeAll(async () => {
    services = await compose(process.env.TEST_DATABASE_URL!);
    app = await buildApplication(services, { log: () => {} });
  });
  afterAll(async () => {
    await app?.close();
    await services?.db.close();
  });
  test("cupom expirado informa o motivo pela API pública", async () => {
    await services.precos.api.configurarRegra(gestor, {
      tipo: "CUPOM",
      codigo: "EXPIRED_HTTP",
      percentual: 10,
      inicio: "2020-01-01T00:00:00Z",
      fim: "2020-02-01T00:00:00Z",
    });
    const result = await request(app.getHttpServer())
      .post("/api/precos/cotacoes")
      .send({
        itens: [{ sku: "HTTP-CUPOM", quantidade: 1 }],
        cupom: "EXPIRED_HTTP",
      })
      .expect(422);
    expect(result.body).toMatchObject({
      codigo: "CUPOM_INVALIDO",
      mensagem: "Cupom expirou.",
    });
  });
  test("cadastro não concede papéis; login cria cookie opaco e logout exige CSRF", async () => {
    const server = app.getHttpServer();
    await request(server)
      .post("/api/clientes")
      .send({
        nome: "User HTTP",
        email: "http@example.test",
        senha: "Senha-local-12345",
        roles: ["GESTOR"],
      })
      .expect(400);
    const customer = await request(server)
      .post("/api/clientes")
      .send({
        nome: "User HTTP",
        email: "http@example.test",
        senha: "Senha-local-12345",
      })
      .expect(201);
    expect(customer.body).not.toHaveProperty("senha");
    const logged = await request(server)
      .post("/api/sessoes")
      .send({ email: "http@example.test", senha: "Senha-local-12345" })
      .expect(201);
    expect(logged.body.contexto.roles).toEqual(["CLIENTE"]);
    const cookies = logged.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toMatch(/HttpOnly/);
    expect(cookies[0]).toMatch(/SameSite=Lax/);
    expect(logged.body).not.toHaveProperty("token");
    await request(server)
      .get("/api/sessoes/atual")
      .set("Cookie", cookies)
      .expect(200);
    await request(server)
      .delete("/api/sessoes")
      .set("Cookie", cookies)
      .expect(403);
    await request(server)
      .delete("/api/sessoes")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", logged.body.csrfToken)
      .expect(204);
    await request(server)
      .get("/api/sessoes/atual")
      .set("Cookie", cookies)
      .expect(401);
  });
  test("gestão integrada publica produto, preço e estoque; cliente não escreve e cotação não aceita relógio externo", async () => {
    const server = app.getHttpServer();
    await services.clientes.sessions.provision(
      {
        nome: "Manager HTTP",
        email: "manager-http@example.test",
        senha: "Senha-local-12345",
      },
      ["GESTOR", "LOGISTICA"],
    );
    const login = await request(server)
      .post("/api/sessoes")
      .send({ email: "manager-http@example.test", senha: "Senha-local-12345" })
      .expect(201);
    const cookie = login.headers["set-cookie"] as unknown as string[],
      csrf = login.body.csrfToken as string;
    const produto = {
      sku: "HTTP-TEST",
      nome: "Notebook de teste",
      marca: "Nexo",
      descricao: "Teste de integração HTTP",
      categoria: "Notebooks",
      imagemUrl: "/product-placeholder.svg",
      atributos: { Memória: "16 GB" },
      pesoGramas: 1400,
      dimensoesMm: { largura: 300, altura: 20, profundidade: 200 },
      ativo: true,
    };
    await request(server)
      .put("/api/catalogo/HTTP-TEST")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Origin", "https://externo.invalid")
      .send(produto)
      .expect(403);
    await request(server)
      .put("/api/catalogo/HTTP-TEST")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send(produto)
      .expect(200);
    await request(server)
      .post("/api/precos/regras")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ tipo: "PRECO", sku: "HTTP-TEST", precoCentavos: 999 })
      .expect(201);
    const input = {
      sku: "HTTP-TEST",
      tipo: "ENTRADA",
      quantidade: 10,
      justificativa: "Entrada conferida",
    };
    await request(server)
      .post("/api/estoque/movimentos")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send(input)
      .expect(400);
    for (let n = 0; n < 2; n++)
      await request(server)
        .post("/api/estoque/movimentos")
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrf)
        .set("Idempotency-Key", "http-entry")
        .send(input)
        .expect(201);
    const balance = await request(server)
      .get("/api/estoque/HTTP-TEST")
      .expect(200);
    expect(balance.body.disponivel).toBe(10);
    const quote = await request(server)
      .post("/api/precos/cotacoes")
      .send({ itens: [{ sku: "HTTP-TEST", quantidade: 2 }] })
      .expect(200);
    expect(quote.body.totalCentavos).toBe(1998);
    await request(server)
      .post("/api/precos/cotacoes")
      .send({
        itens: [{ sku: "HTTP-TEST", quantidade: 2 }],
        instante: "2030-01-01T00:00:00Z",
      })
      .expect(400);
    const user = await request(server)
      .post("/api/sessoes")
      .send({ email: "http@example.test", senha: "Senha-local-12345" })
      .expect(201);
    await request(server).get("/api/gestao/catalogo/HTTP-TEST").expect(401);
    await request(server)
      .get("/api/gestao/catalogo/HTTP-TEST")
      .set("Cookie", user.headers["set-cookie"] as unknown as string[])
      .expect(403);
    await request(server)
      .put("/api/catalogo/HTTP-TEST")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ ...produto, ativo: false, versaoEsperada: 1 })
      .expect(200);
    await request(server).get("/api/catalogo/HTTP-TEST").expect(404);
    const inactive = await request(server)
      .get("/api/gestao/catalogo/HTTP-TEST")
      .set("Cookie", cookie)
      .expect(200);
    expect(inactive.body).toMatchObject({ ativo: false, versao: 2 });
    const priceRule = await request(server)
      .get("/api/gestao/precos/HTTP-TEST")
      .set("Cookie", cookie)
      .expect(200);
    expect(priceRule.body).toMatchObject({
      tipo: "PRECO",
      precoCentavos: 999,
      versao: 1,
    });
    const oldCoupon = await request(server)
      .get("/api/gestao/cupons/EXPIRED_HTTP")
      .set("Cookie", cookie)
      .expect(200);
    expect(oldCoupon.body).toMatchObject({
      tipo: "CUPOM",
      percentual: 10,
      versao: 1,
    });
    await request(server)
      .put("/api/catalogo/HTTP-TEST")
      .set("Cookie", user.headers["set-cookie"] as unknown as string[])
      .set("X-CSRF-Token", user.body.csrfToken)
      .send({ ...produto, versaoEsperada: 1 })
      .expect(403);
    await request(server).get("/api/catalogo?tamanho=101").expect(400);
    await request(server).get("/api/health").expect(200);
  });
});
