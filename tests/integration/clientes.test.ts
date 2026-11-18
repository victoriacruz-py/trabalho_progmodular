import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClientes } from "../../apps/api/src/modules/clientes";
import { testDatabase, TestClock } from "../helpers";
import { trustedContext } from "../../packages/kernel";

describe("M05 — identidade por interface pública", () => {
  const db = testDatabase();
  const clock = new TestClock();
  let m: Awaited<ReturnType<typeof createClientes>>;
  beforeAll(async () => {
    m = await createClientes(db, clock);
  });
  afterAll(async () => {
    await db.close();
  });
  test("TU05.01/03 — cadastra sem expor senha e autentica por 30 minutos", async () => {
    const cliente = await m.api.cadastrar({
      nome: "Ana",
      email: " ANA@example.test ",
      senha: "Senha-local-12345",
    });
    expect(cliente).toEqual({
      id: expect.any(String),
      nome: "Ana",
      email: "ana@example.test",
    });
    const session = await m.api.autenticar(
      "ANA@example.test",
      "Senha-local-12345",
    );
    expect(session.expiraEm).toBe("2026-10-23T10:30:00.000Z");
    expect((await m.api.validarSessao(session.token)).actorId).toBe(cliente.id);
  });
  test("TU05.02/04 — email único normalizado e senha mínima", async () => {
    await m.api.cadastrar({
      nome: "Original",
      email: "unico@example.test",
      senha: "Outra-senha-12345",
    });
    await expect(
      m.api.cadastrar({
        nome: "Outra",
        email: "unico@EXAMPLE.test",
        senha: "Outra-senha-12345",
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      m.api.cadastrar({
        nome: "Outra",
        email: "short@example.test",
        senha: "curta",
      }),
    ).rejects.toMatchObject({ code: "INVALIDO" });
  });
  test("TU05.05 — cinco falhas bloqueiam por 15 minutos, sem renovar o bloqueio", async () => {
    await m.api.cadastrar({
      nome: "Bia",
      email: "bia@example.test",
      senha: "Senha-local-12345",
    });
    for (let i = 0; i < 5; i++)
      await expect(
        m.api.autenticar("bia@example.test", "senha-incorreta"),
      ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      m.api.autenticar("bia@example.test", "Senha-local-12345"),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    clock.advance(15 * 60_000);
    await expect(
      m.api.autenticar("bia@example.test", "Senha-local-12345"),
    ).resolves.toHaveProperty("token");
  });
  test("TU05.06/07/08 — limite exato, contato privado e revogação", async () => {
    const pessoa = await m.api.cadastrar({
      nome: "Caio",
      email: "caio@example.test",
      senha: "Senha-local-12345",
    });
    const sessao = await m.api.autenticar(pessoa.email, "Senha-local-12345"),
      ctx = await m.api.validarSessao(sessao.token);
    expect(ctx.roles).toEqual(["CLIENTE"]);
    expect(await m.api.obterContato(ctx, pessoa.id)).toEqual({
      nome: "Caio",
      email: "caio@example.test",
    });
    await expect(
      m.api.obterContato(trustedContext("outro", ["GESTOR"]), pessoa.id),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      m.api.obterContato({ actorId: pessoa.id, roles: ["CLIENTE"] }, pessoa.id),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    expect(
      await m.api.obterContato(
        trustedContext("notificador", [], "M12"),
        pessoa.id,
      ),
    ).toEqual({ nome: "Caio", email: "caio@example.test" });
    clock.advance(30 * 60_000);
    await expect(m.api.validarSessao(sessao.token)).rejects.toMatchObject({
      code: "NAO_AUTORIZADO",
    });
    const nova = await m.api.autenticar(pessoa.email, "Senha-local-12345");
    await m.sessions.revoke(nova.token);
    await expect(m.api.validarSessao(nova.token)).rejects.toMatchObject({
      code: "NAO_AUTORIZADO",
    });
  });
  test("falhas concorrentes são persistidas e o bloqueio sobrevive à reabertura", async () => {
    await m.api.cadastrar({
      nome: "Dani",
      email: "dani@example.test",
      senha: "Senha-local-12345",
    });
    const failures = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        m.api.autenticar("dani@example.test", "senha-errada"),
      ),
    );
    expect(failures.every((result) => result.status === "rejected")).toBe(true);
    const reopened = await createClientes(db, clock);
    await expect(
      reopened.api.autenticar("dani@example.test", "Senha-local-12345"),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    clock.advance(15 * 60_000);
    const session = await reopened.api.autenticar(
      "dani@example.test",
      "Senha-local-12345",
    );
    expect((await m.api.validarSessao(session.token)).roles).toEqual([
      "CLIENTE",
    ]);
  });
  test("falhas fora da janela não contam; conta ausente não é distinguida na resposta", async () => {
    await m.api.cadastrar({
      nome: "Eva",
      email: "eva@example.test",
      senha: "Senha-local-12345",
    });
    for (let n = 0; n < 4; n++)
      await expect(
        m.api.autenticar("eva@example.test", "errada"),
      ).rejects.toMatchObject({
        code: "NAO_AUTORIZADO",
        message: "NAO_AUTORIZADO",
      });
    clock.advance(15 * 60_000);
    await expect(
      m.api.autenticar("eva@example.test", "errada"),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      m.api.autenticar("eva@example.test", "Senha-local-12345"),
    ).resolves.toHaveProperty("token");
    await expect(
      m.api.autenticar("inexistente@example.test", "errada"),
    ).rejects.toMatchObject({
      code: "NAO_AUTORIZADO",
      message: "NAO_AUTORIZADO",
    });
  });
});
