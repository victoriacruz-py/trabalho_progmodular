import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createEstoque } from "../../apps/api/src/modules/estoque";
import { createCatalogo } from "../../apps/api/src/modules/catalogo";
import { Database, lock } from "../../apps/api/src/infrastructure/database";
import { Context, DomainError, trustedContext } from "../../packages/kernel";
import {
  testDatabase,
  TestClock,
  logistica,
  checkout,
  pedidos,
  cliente,
  gestor,
} from "../helpers";

describe("M09 — estoque e inventário através de IEstoque", () => {
  let db: Database;
  const clock = new TestClock();
  const catalogo = {
    async obterProduto(sku: string) {
      if (sku.startsWith("ausente")) throw new DomainError("NAO_ENCONTRADO");
      return { sku };
    },
  };
  beforeAll(() => {
    db = testDatabase();
  });
  afterAll(async () => {
    await db?.close();
  });

  test("entrada inicial cria saldo consultável e seu reenvio não duplica movimento", async () => {
    const { api, journal } = await createEstoque(db, clock, catalogo);
    const movimento = {
      sku: "entrada",
      tipo: "ENTRADA" as const,
      quantidade: 10,
      justificativa: "Recebimento inicial",
    };
    expect(
      await api.movimentar(logistica, movimento, "entrada-inicial"),
    ).toEqual({
      sku: "entrada",
      fisico: 10,
      reservado: 0,
      disponivel: 10,
      versao: 1,
    });
    await api.movimentar(logistica, movimento, "entrada-inicial");
    expect(await api.consultar("entrada")).toEqual({
      sku: "entrada",
      fisico: 10,
      reservado: 0,
      disponivel: 10,
      versao: 1,
    });
    expect(
      (await journal.read()).filter((e) => e.agregado === "entrada"),
    ).toHaveLength(1);
    await expect(api.consultar("ausente")).rejects.toMatchObject({
      code: "NAO_ENCONTRADO",
    });
  });

  test("TU09.01/03 — reserva compromete saldo uma única vez", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "reserva",
        tipo: "ENTRADA",
        quantidade: 10,
        justificativa: "Recebimento",
      },
      "reserva-seed",
    );
    const itens = [{ sku: "reserva", quantidade: 3 }],
      vencimento = "2026-10-23T10:15:00.000Z";
    const reserva = await api.reservar(
      checkout,
      itens,
      vencimento,
      "reserva-1",
    );
    expect(reserva).toMatchObject({ itens, vencimento, estado: "ATIVA" });
    expect(
      await api.reservar(checkout, itens, vencimento, "reserva-1"),
    ).toEqual(reserva);
    expect(await api.consultar("reserva")).toEqual({
      sku: "reserva",
      fisico: 10,
      reservado: 3,
      disponivel: 7,
      versao: 2,
    });
  });

  test("TU09.07 — confirmação baixa físico uma vez e reenvio da reserva acompanha seu estado", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "confirmacao",
        tipo: "ENTRADA",
        quantidade: 10,
        justificativa: "Recebimento",
      },
      "confirmacao-seed",
    );
    const itens = [{ sku: "confirmacao", quantidade: 2 }],
      vencimento = "2026-10-23T10:15:00.000Z";
    const reserva = await api.reservar(
      checkout,
      itens,
      vencimento,
      "confirmacao-reserva",
    );
    expect(
      (
        await api.encerrarReserva(
          pedidos,
          reserva.id,
          "CONFIRMAR",
          "confirmacao",
        )
      ).estado,
    ).toBe("CONFIRMADA");
    await api.encerrarReserva(pedidos, reserva.id, "CONFIRMAR", "confirmacao");
    expect(await api.consultar("confirmacao")).toMatchObject({
      fisico: 8,
      reservado: 0,
      disponivel: 8,
      versao: 3,
    });
    expect(
      (await api.reservar(checkout, itens, vencimento, "confirmacao-reserva"))
        .estado,
    ).toBe("CONFIRMADA");
    await expect(
      api.encerrarReserva(
        pedidos,
        reserva.id,
        "LIBERAR",
        "confirmacao-contraditoria",
      ),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });

  test("TU09.02/08 — no vencimento exato consulta libera disponibilidade, confirmação falha e liberação é segura", async () => {
    const localClock = new TestClock();
    const { api, journal } = await createEstoque(db, localClock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "expiracao",
        tipo: "ENTRADA",
        quantidade: 2,
        justificativa: "Recebimento",
      },
      "expiracao-seed",
    );
    const itens = [{ sku: "expiracao", quantidade: 2 }],
      vencimento = "2026-10-23T10:15:00.000Z";
    const reserva = await api.reservar(
      checkout,
      itens,
      vencimento,
      "expiracao-reserva",
    );
    localClock.advance(15 * 60_000);
    await expect(
      api.encerrarReserva(
        pedidos,
        reserva.id,
        "CONFIRMAR",
        "expirada-confirmacao",
      ),
    ).rejects.toMatchObject({ code: "RESERVA_EXPIRADA" });
    expect(await api.consultar("expiracao")).toMatchObject({
      fisico: 2,
      reservado: 0,
      disponivel: 2,
      versao: 3,
    });
    expect(
      (await api.reservar(checkout, itens, vencimento, "expiracao-reserva"))
        .estado,
    ).toBe("EXPIRADA");
    expect(
      (
        await api.encerrarReserva(
          checkout,
          reserva.id,
          "LIBERAR",
          "expirada-liberacao",
        )
      ).estado,
    ).toBe("EXPIRADA");
    const nova = await api.reservar(
      checkout,
      itens,
      "2026-10-23T10:30:00.000Z",
      "expiracao-nova",
    );
    expect(nova.estado).toBe("ATIVA");
    expect(
      (await journal.read()).filter((e) => e.agregado === "expiracao"),
    ).toHaveLength(4);
  });

  test("TU09.04/EI04 — dois clientes PostgreSQL disputam a última unidade e só uma reserva vence", async () => {
    const secondDb = testDatabase();
    try {
      const { api } = await createEstoque(db, clock, catalogo);
      const second = (await createEstoque(secondDb, clock, catalogo)).api;
      await api.movimentar(
        logistica,
        {
          sku: "ultima",
          tipo: "ENTRADA",
          quantidade: 1,
          justificativa: "Recebimento",
        },
        "ultima-seed",
      );
      const results = await Promise.allSettled([
        api.reservar(
          checkout,
          [{ sku: "ultima", quantidade: 1 }],
          "2026-10-23T10:15:00.000Z",
          "ultima-a",
        ),
        second.reservar(
          checkout,
          [{ sku: "ultima", quantidade: 1 }],
          "2026-10-23T10:15:00.000Z",
          "ultima-b",
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "ESTOQUE_INSUFICIENTE" } });
      expect(await api.consultar("ultima")).toMatchObject({
        fisico: 1,
        reservado: 1,
        disponivel: 0,
      });
    } finally {
      await secondDb.close();
    }
  });

  test("EI05 — falta em um SKU não deixa reserva parcial nem evento nos demais", async () => {
    const { api, journal } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "integral-A",
        tipo: "ENTRADA",
        quantidade: 2,
        justificativa: "Recebimento",
      },
      "integral-A-seed",
    );
    await api.movimentar(
      logistica,
      {
        sku: "integral-B",
        tipo: "ENTRADA",
        quantidade: 1,
        justificativa: "Recebimento",
      },
      "integral-B-seed",
    );
    await api.reservar(
      checkout,
      [{ sku: "integral-B", quantidade: 1 }],
      "2026-10-23T10:15:00.000Z",
      "integral-B-comprometido",
    );
    await expect(
      api.reservar(
        checkout,
        [
          { sku: "integral-A", quantidade: 1 },
          { sku: "integral-B", quantidade: 1 },
        ],
        "2026-10-23T10:15:00.000Z",
        "integral-sem-saldo",
      ),
    ).rejects.toMatchObject({ code: "ESTOQUE_INSUFICIENTE" });
    expect(await api.consultar("integral-A")).toMatchObject({
      fisico: 2,
      reservado: 0,
      disponivel: 2,
      versao: 1,
    });
    expect(
      (await journal.read()).filter((e) => e.agregado === "integral-A"),
    ).toHaveLength(1);
  });

  test("TU09.05/06 — ajuste preserva reservado e reenvio de entrada não duplica saldo", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "ajuste",
        tipo: "ENTRADA",
        quantidade: 10,
        justificativa: "Recebimento",
      },
      "ajuste-seed",
    );
    await api.reservar(
      checkout,
      [{ sku: "ajuste", quantidade: 3 }],
      "2026-10-23T10:15:00.000Z",
      "ajuste-reserva",
    );
    await expect(
      api.movimentar(
        logistica,
        {
          sku: "ajuste",
          tipo: "SAIDA",
          quantidade: 8,
          justificativa: "Avaria",
        },
        "ajuste-invalido",
      ),
    ).rejects.toMatchObject({ code: "ESTOQUE_INSUFICIENTE" });
    const entrada = {
      sku: "ajuste",
      tipo: "ENTRADA" as const,
      quantidade: 2,
      justificativa: "Reposição",
    };
    await api.movimentar(logistica, entrada, "ajuste-entrada");
    await api.movimentar(logistica, entrada, "ajuste-entrada");
    expect(await api.consultar("ajuste")).toMatchObject({
      fisico: 12,
      reservado: 3,
      disponivel: 9,
      versao: 3,
    });
  });

  test("EI08 — chamadas simultâneas e reconstrução do módulo preservam identidade e estado da reserva", async () => {
    const { api, journal } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "reenvio",
        tipo: "ENTRADA",
        quantidade: 3,
        justificativa: "Recebimento",
      },
      "reenvio-seed",
    );
    const itens = [{ sku: "reenvio", quantidade: 2 }],
      prazo = "2026-10-23T10:15:00.000Z";
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api.reservar(checkout, itens, prazo, "reenvio-simultaneo"),
      ),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    const reopenedDb = testDatabase();
    try {
      const reopened = (await createEstoque(reopenedDb, clock, catalogo)).api;
      expect(
        await reopened.reservar(checkout, itens, prazo, "reenvio-simultaneo"),
      ).toEqual(results[0]);
      await reopened.encerrarReserva(
        checkout,
        results[0]!.id,
        "LIBERAR",
        "reenvio-liberar",
      );
      expect(
        (await reopened.reservar(checkout, itens, prazo, "reenvio-simultaneo"))
          .estado,
      ).toBe("LIBERADA");
      await expect(
        reopened.reservar(
          checkout,
          [{ sku: "reenvio", quantidade: 1 }],
          prazo,
          "reenvio-simultaneo",
        ),
      ).rejects.toMatchObject({ code: "CONFLITO" });
    } finally {
      await reopenedDb.close();
    }
    expect(await api.consultar("reenvio")).toMatchObject({
      fisico: 3,
      reservado: 0,
      disponivel: 3,
    });
    expect(
      (await journal.read()).filter((e) => e.agregado === "reenvio"),
    ).toHaveLength(3);
  });

  test("EI20 — cliente comum e contexto forjado não concedem autoridade logística ou de checkout", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    const movimento = {
      sku: "negado",
      tipo: "ENTRADA" as const,
      quantidade: 1,
      justificativa: "Recebimento",
    };
    await expect(
      api.movimentar(cliente, movimento, "negado"),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    const forged = {
      actorId: "intruso",
      roles: ["LOGISTICA"],
      service: "M03",
    } as Context;
    await expect(
      api.movimentar(forged, movimento, "negado-forjado"),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      api.reservar(
        forged,
        [{ sku: "negado", quantidade: 1 }],
        "2026-10-23T10:15:00.000Z",
        "negado-reserva",
      ),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      api.reservar(
        trustedContext("logistica-servico", [], "M11"),
        [{ sku: "negado", quantidade: 1 }],
        "2026-10-23T10:15:00.000Z",
        "negado-modulo",
      ),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(api.consultar("negado")).rejects.toMatchObject({
      code: "NAO_ENCONTRADO",
    });
  });

  test("cadastro inicial simultâneo não esgota conexões ao consultar o módulo de Catálogo", async () => {
    // Contract simulator performs real database IO, as the real catalog adapter does.
    const catalogoPersistido = {
      async obterProduto(sku: string) {
        await db.query("SELECT 1");
        return { sku };
      },
    };
    const { api } = await createEstoque(db, clock, catalogoPersistido);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        api.movimentar(
          logistica,
          {
            sku: `pool-${index}`,
            tipo: "ENTRADA",
            quantidade: 1,
            justificativa: "Recebimento simultâneo",
          },
          `pool-${index}`,
        ),
      ),
    );
    expect(results.filter((result) => result.status === "rejected")).toEqual(
      [],
    );
    expect(await api.consultar("pool-0")).toMatchObject({
      fisico: 1,
      disponivel: 1,
    });
  }, 20_000);

  test("Catálogo real valida entrada inicial e desativação posterior preserva o inventário conhecido", async () => {
    const catalogoReal = (await createCatalogo(db, clock)).api;
    const { api } = await createEstoque(db, clock, catalogoReal);
    const produto = {
      sku: "INTEGRACAO-ESTOQUE",
      nome: "Teclado",
      marca: "Exemplo",
      categoria: "Periféricos",
      descricao: "Teclado de teste",
      imagemUrl: "https://example.com/teclado.png",
      atributos: { cor: "preto" },
      pesoGramas: 500,
      dimensoesMm: { largura: 300, altura: 30, profundidade: 120 },
      ativo: true,
    };
    await catalogoReal.salvarProduto(gestor, produto);
    await api.movimentar(
      logistica,
      {
        sku: produto.sku,
        tipo: "ENTRADA",
        quantidade: 2,
        justificativa: "Recebimento",
      },
      "integracao-seed",
    );
    await catalogoReal.salvarProduto(gestor, {
      ...produto,
      ativo: false,
      versaoEsperada: 1,
    });
    await expect(catalogoReal.obterProduto(produto.sku)).rejects.toMatchObject({
      code: "NAO_ENCONTRADO",
    });
    await api.movimentar(
      logistica,
      {
        sku: produto.sku,
        tipo: "SAIDA",
        quantidade: 1,
        justificativa: "Avaria após desativação",
      },
      "integracao-saida",
    );
    expect(await api.consultar(produto.sku)).toMatchObject({
      fisico: 1,
      reservado: 0,
      disponivel: 1,
    });
    await expect(
      api.movimentar(
        logistica,
        {
          sku: "INEXISTENTE-INTEGRACAO",
          tipo: "ENTRADA",
          quantidade: 1,
          justificativa: "Recebimento",
        },
        "integracao-inexistente",
      ),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
  });

  test("reserva rejeita lista vazia, SKUs repetidos, quantidade inválida e prazo além de quinze minutos", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    for (const itens of [
      [],
      [{ sku: "entrada", quantidade: 0 }],
      [{ sku: "entrada", quantidade: 1.2 }],
      [
        { sku: "entrada", quantidade: 1 },
        { sku: "entrada", quantidade: 1 },
      ],
    ]) {
      await expect(
        api.reservar(checkout, itens, "2026-10-23T10:15:00.000Z", "parametros"),
      ).rejects.toMatchObject({ code: "INVALIDO" });
    }
    await expect(
      api.reservar(
        checkout,
        [{ sku: "entrada", quantidade: 1 }],
        "2026-10-23T10:15:00.001Z",
        "prazo-longo",
      ),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      api.encerrarReserva(
        checkout,
        "------------------------------------",
        "CONFIRMAR",
        "id-invalido",
      ),
    ).rejects.toMatchObject({ code: "INVALIDO" });
  });

  test("confirmação e liberação concorrentes têm um único estado final sem baixa duplicada", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "corrida-final",
        tipo: "ENTRADA",
        quantidade: 1,
        justificativa: "Recebimento",
      },
      "corrida-final-seed",
    );
    const reserva = await api.reservar(
      checkout,
      [{ sku: "corrida-final", quantidade: 1 }],
      "2026-10-23T10:15:00.000Z",
      "corrida-final-reserva",
    );
    const results = await Promise.allSettled([
      api.encerrarReserva(
        pedidos,
        reserva.id,
        "CONFIRMAR",
        "corrida-final-confirmar",
      ),
      api.encerrarReserva(
        checkout,
        reserva.id,
        "LIBERAR",
        "corrida-final-liberar",
      ),
    ]);
    const winner = results.find((result) => result.status === "fulfilled");
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "CONFLITO" } });
    expect(await api.consultar("corrida-final")).toMatchObject(
      winner?.status === "fulfilled" && winner.value.estado === "CONFIRMADA"
        ? { fisico: 0, reservado: 0, disponivel: 0 }
        : { fisico: 1, reservado: 0, disponivel: 1 },
    );
  });

  test("encerramento publica saldo que já desconsidera outras reservas vencidas do mesmo SKU", async () => {
    const localClock = new TestClock();
    const { api, journal } = await createEstoque(db, localClock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "evento-expiracao",
        tipo: "ENTRADA",
        quantidade: 10,
        justificativa: "Recebimento",
      },
      "evento-expiracao-seed",
    );
    await api.reservar(
      checkout,
      [{ sku: "evento-expiracao", quantidade: 2 }],
      "2026-10-23T10:01:00.000Z",
      "evento-expiracao-antiga",
    );
    const vigente = await api.reservar(
      checkout,
      [{ sku: "evento-expiracao", quantidade: 3 }],
      "2026-10-23T10:15:00.000Z",
      "evento-expiracao-vigente",
    );
    localClock.advance(60_000);
    await api.encerrarReserva(
      pedidos,
      vigente.id,
      "CONFIRMAR",
      "evento-expiracao-confirmar",
    );
    const latest = (await journal.read())
      .filter((event) => event.agregado === "evento-expiracao")
      .sort((a, b) => b.versaoAgregado - a.versaoAgregado)[0];
    expect(latest?.dados).toMatchObject({
      fisico: 7,
      reservado: 0,
      disponivel: 7,
    });
  });

  test("EI06 — confirmação que aguarda contenção consulta novamente o relógio após obter o lock", async () => {
    const localClock = new TestClock();
    const { api } = await createEstoque(db, localClock, catalogo);
    await api.movimentar(
      logistica,
      {
        sku: "prazo-em-espera",
        tipo: "ENTRADA",
        quantidade: 1,
        justificativa: "Recebimento",
      },
      "prazo-em-espera-seed",
    );
    const reserva = await api.reservar(
      checkout,
      [{ sku: "prazo-em-espera", quantidade: 1 }],
      "2026-10-23T10:15:00.000Z",
      "prazo-em-espera-reserva",
    );
    // Infrastructure fault fixture: hold the documented SKU mutex; observe only IEstoque results.
    const blocker = await db.pool.connect();
    let blocking = true;
    try {
      await blocker.query("BEGIN");
      await lock(blocker, "estoque:sku:prazo-em-espera");
      const attempt = api
        .encerrarReserva(
          pedidos,
          reserva.id,
          "CONFIRMAR",
          "prazo-em-espera-confirmar",
        )
        .then(
          (value) => ({ value, error: undefined }),
          (error) => ({ value: undefined, error }),
        );
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (Date.now() < deadline) {
        const rows = await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
        );
        if (rows.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(waiting).toBe(true);
      localClock.advance(15 * 60_000);
      await blocker.query("COMMIT");
      blocking = false;
      expect((await attempt).error).toMatchObject({ code: "RESERVA_EXPIRADA" });
      expect(await api.consultar("prazo-em-espera")).toMatchObject({
        fisico: 1,
        reservado: 0,
        disponivel: 1,
      });
    } finally {
      if (blocking) await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  test("reservas de vários SKUs usam a mesma ordem de locks mesmo com listas invertidas", async () => {
    const { api } = await createEstoque(db, clock, catalogo);
    for (const sku of ["ordem-A", "ordem-B"])
      await api.movimentar(
        logistica,
        { sku, tipo: "ENTRADA", quantidade: 2, justificativa: "Recebimento" },
        `${sku}-seed`,
      );
    const itens = [
      { sku: "ordem-A", quantidade: 1 },
      { sku: "ordem-B", quantidade: 1 },
    ];
    const results = await Promise.all([
      api.reservar(checkout, itens, "2026-10-23T10:15:00.000Z", "ordem-1"),
      api.reservar(
        checkout,
        [...itens].reverse(),
        "2026-10-23T10:15:00.000Z",
        "ordem-2",
      ),
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(2);
    expect(await api.consultar("ordem-A")).toMatchObject({
      fisico: 2,
      reservado: 2,
      disponivel: 0,
    });
    expect(await api.consultar("ordem-B")).toMatchObject({
      fisico: 2,
      reservado: 2,
      disponivel: 0,
    });
  });
});
