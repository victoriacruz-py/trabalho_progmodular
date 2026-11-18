import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import {
  createCatalogo,
  ICatalogo,
  ProdutoEntrada,
} from "../../apps/api/src/modules/catalogo";
import { testDatabase, TestClock, gestor, cliente } from "../helpers";
import { Journal } from "../../apps/api/src/infrastructure/events";
import { createPrecos, IPrecos } from "../../apps/api/src/modules/precos";

const product = (
  sku: string,
  changes: Partial<ProdutoEntrada> = {},
): ProdutoEntrada => ({
  sku,
  nome: "Teclado",
  marca: "Marca",
  descricao: "Teclado mecânico",
  categoria: "Periféricos",
  imagemUrl: "/product-placeholder.svg",
  atributos: { cor: "preto" },
  pesoGramas: 800,
  dimensoesMm: { largura: 400, altura: 40, profundidade: 150 },
  ativo: true,
  ...changes,
});

describe("Consultas administrativas de oferta", () => {
  const db = testDatabase();
  const clock = new TestClock();
  let catalogo: Awaited<ReturnType<typeof createCatalogo>>;
  let precos: Awaited<ReturnType<typeof createPrecos>>;
  beforeAll(async () => {
    catalogo = await createCatalogo(db, clock);
    precos = await createPrecos(db, clock, catalogo.api);
  });
  afterAll(async () => {
    await db.close();
  });

  test("gestor recupera produto inativo para reativar sem expô-lo na consulta pública", async () => {
    await catalogo.api.salvarProduto(
      gestor,
      product("ADMIN-INATIVO", { ativo: false }),
    );
    await expect(
      catalogo.api.obterProduto("ADMIN-INATIVO"),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    const reconnected = testDatabase();
    try {
      const reopened = await createCatalogo(reconnected, clock);
      const stored = await reopened.admin.obterProduto(gestor, "ADMIN-INATIVO");
      expect(stored).toMatchObject({
        sku: "ADMIN-INATIVO",
        ativo: false,
        versao: 1,
        atributos: { cor: "preto" },
      });
      expect(
        (await reopened.journal.read()).filter(
          (e) => e.agregado === "ADMIN-INATIVO",
        ),
      ).toHaveLength(1);
      await reopened.api.salvarProduto(gestor, {
        ...stored,
        ativo: true,
        versaoEsperada: stored.versao,
      });
      expect(await reopened.api.obterProduto("ADMIN-INATIVO")).toMatchObject({
        ativo: true,
        versao: 2,
      });
    } finally {
      await reconnected.close();
    }
  });

  test("gestor recupera promoção futura e cupom expirado com escopo e versão após nova factory", async () => {
    await catalogo.api.salvarProduto(gestor, product("ADMIN-REGRAS"));
    await precos.api.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "ADMIN-REGRAS",
      precoCentavos: 1000,
      promocao: {
        percentual: 10,
        inicio: "2026-10-23T10:30:00Z",
        fim: "2026-10-23T11:00:00Z",
      },
    });
    await precos.api.configurarRegra(gestor, {
      tipo: "CUPOM",
      codigo: "Admin-vencido",
      percentual: 20,
      inicio: "2026-10-22T10:00:00Z",
      fim: "2026-10-22T11:00:00Z",
      skus: ["ADMIN-REGRAS"],
    });
    const reconnected = testDatabase();
    try {
      const reopened = await createPrecos(reconnected, clock, catalogo.api);
      expect(
        await reopened.admin.obterRegra(gestor, {
          tipo: "PRECO",
          sku: "ADMIN-REGRAS",
        }),
      ).toEqual({
        tipo: "PRECO",
        sku: "ADMIN-REGRAS",
        precoCentavos: 1000,
        promocao: {
          percentual: 10,
          inicio: "2026-10-23T10:30:00.000Z",
          fim: "2026-10-23T11:00:00.000Z",
        },
        versao: 1,
      });
      const coupon = await reopened.admin.obterRegra(gestor, {
        tipo: "CUPOM",
        codigo: " admin-vencido ",
      });
      expect(coupon).toEqual({
        tipo: "CUPOM",
        codigo: "ADMIN-VENCIDO",
        percentual: 20,
        inicio: "2026-10-22T10:00:00.000Z",
        fim: "2026-10-22T11:00:00.000Z",
        skus: ["ADMIN-REGRAS"],
        versao: 1,
      });
      expect(
        (await reopened.journal.read()).filter(
          (e) => e.dados.codigo === "ADMIN-VENCIDO",
        ),
      ).toHaveLength(1);
      await reopened.api.configurarRegra(gestor, {
        ...coupon,
        versaoEsperada: coupon.versao,
      });
      expect(
        await reopened.admin.obterRegra(gestor, {
          tipo: "CUPOM",
          codigo: "ADMIN-VENCIDO",
        }),
      ).toMatchObject({ versao: 2 });
    } finally {
      await reconnected.close();
    }
  });

  test("leitura administrativa recusa cliente e gestor forjado, e reporta identidade ausente", async () => {
    for (const ctx of [
      cliente,
      { actorId: "forjado", roles: ["GESTOR" as const] },
    ]) {
      await expect(
        catalogo.admin.obterProduto(ctx, "ADMIN-AUSENTE"),
      ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
      await expect(
        precos.admin.obterRegra(ctx, { tipo: "PRECO", sku: "ADMIN-AUSENTE" }),
      ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
      await expect(
        precos.admin.obterRegra(ctx, {
          tipo: "CUPOM",
          codigo: "ADMIN-AUSENTE",
        }),
      ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    }
    await expect(
      catalogo.admin.obterProduto(gestor, "ADMIN-AUSENTE"),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    await expect(
      precos.admin.obterRegra(gestor, { tipo: "PRECO", sku: "ADMIN-AUSENTE" }),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    await expect(
      precos.admin.obterRegra(gestor, {
        tipo: "CUPOM",
        codigo: "ADMIN-AUSENTE",
      }),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
  });
});

describe("M01 Catálogo — contratos públicos", () => {
  const db = testDatabase();
  const clock = new TestClock();
  let catalogo: ICatalogo;
  let journal: Journal;
  beforeAll(async () => {
    ({ api: catalogo, journal } = await createCatalogo(db, clock));
  });
  afterAll(async () => {
    await db.close();
  });

  test("TU01.01: gestor cadastra SKU e a consulta pública recupera os dados físicos", async () => {
    const input: ProdutoEntrada = {
      sku: "OFERTA-CADASTRO",
      nome: "Teclado",
      marca: "Marca",
      descricao: "Teclado mecânico",
      categoria: "Periféricos",
      imagemUrl: "https://example.com/teclado.png",
      atributos: { cor: "preto" },
      pesoGramas: 800,
      dimensoesMm: { largura: 400, altura: 40, profundidade: 150 },
      ativo: true,
    };
    const saved = await catalogo.salvarProduto(gestor, input);
    expect(saved.versao).toBe(1);
    expect(await catalogo.obterProduto("OFERTA-CADASTRO")).toEqual({
      ...input,
      versao: 1,
    });
    expect(
      (await journal.read()).filter((e) => e.agregado === input.sku),
    ).toMatchObject([
      { tipo: "ProdutoAlterado", versaoAgregado: 1, dados: { sku: input.sku } },
    ]);
  });

  test("TU01.02: peso inválido e cliente sem autorização não criam produto nem evento", async () => {
    await expect(
      catalogo.salvarProduto(
        gestor,
        product("OFERTA-PESO", { pesoGramas: -1 }),
      ),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      catalogo.salvarProduto(cliente, product("OFERTA-CLIENTE")),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      catalogo.salvarProduto(
        { actorId: "forjado", roles: ["GESTOR"] },
        product("OFERTA-FORJADO"),
      ),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(catalogo.obterProduto("OFERTA-PESO")).rejects.toMatchObject({
      code: "NAO_ENCONTRADO",
    });
    await expect(catalogo.obterProduto("OFERTA-CLIENTE")).rejects.toMatchObject(
      { code: "NAO_ENCONTRADO" },
    );
    expect(
      (await journal.read()).filter((e) =>
        ["OFERTA-PESO", "OFERTA-CLIENTE", "OFERTA-FORJADO"].includes(
          e.agregado,
        ),
      ),
    ).toEqual([]);
  });

  test("atualizações concorrentes exigem versão e preservam apenas um vencedor", async () => {
    const input = product("OFERTA-VERSAO");
    await catalogo.salvarProduto(gestor, input);
    await expect(catalogo.salvarProduto(gestor, input)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    const outcomes = await Promise.allSettled([
      catalogo.salvarProduto(gestor, {
        ...input,
        nome: "Versão A",
        versaoEsperada: 1,
      }),
      catalogo.salvarProduto(gestor, {
        ...input,
        nome: "Versão B",
        versaoEsperada: 1,
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((o) => o.status === "rejected")).toMatchObject({
      reason: { code: "CONFLITO" },
    });
    expect((await catalogo.obterProduto(input.sku)).versao).toBe(2);
    expect(
      (await journal.read()).filter((e) => e.agregado === input.sku),
    ).toHaveLength(2);
  });

  test("TU01.04–06: inativos não são públicos; listagem filtra, ordena e valida paginação", async () => {
    await catalogo.salvarProduto(
      gestor,
      product("OFERTA-LISTA-B", { categoria: "teste-lista" }),
    );
    const a = await catalogo.salvarProduto(
      gestor,
      product("OFERTA-LISTA-A", { categoria: "teste-lista" }),
    );
    await catalogo.salvarProduto(
      gestor,
      product("OFERTA-LISTA-C", { categoria: "outra-lista" }),
    );
    const first = await catalogo.listarProdutos(
      { categoria: "teste-lista", marca: "Marca" },
      { numero: 1, tamanho: 1 },
    );
    expect(first.total).toBe(2);
    expect(first.itens.map((p) => p.sku)).toEqual(["OFERTA-LISTA-A"]);
    await catalogo.salvarProduto(gestor, {
      ...a,
      ativo: false,
      versaoEsperada: a.versao,
    });
    await expect(catalogo.obterProduto(a.sku)).rejects.toMatchObject({
      code: "NAO_ENCONTRADO",
    });
    await expect(
      catalogo.obterProduto("SKU-INEXISTENTE"),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    expect(
      await catalogo.listarProdutos(
        { categoria: "sem-produtos" },
        { numero: 1, tamanho: 20 },
      ),
    ).toEqual({ itens: [], total: 0, pagina: { numero: 1, tamanho: 20 } });
    await expect(
      catalogo.listarProdutos({}, { numero: 1, tamanho: 101 }),
    ).rejects.toMatchObject({ code: "INVALIDO" });
  });

  test("URLs executáveis e traversal são recusados; textos continuam dados públicos", async () => {
    for (const imagemUrl of [
      "javascript:alert(1)",
      "//evil.example/a.png",
      "/../secrets",
      "/%2e%2e/secrets",
      "/%252e%252e/secrets",
      "data:text/html,x",
    ]) {
      await expect(
        catalogo.salvarProduto(gestor, product("OFERTA-URL", { imagemUrl })),
      ).rejects.toMatchObject({ code: "INVALIDO" });
    }
    const saved = await catalogo.salvarProduto(
      gestor,
      product("OFERTA-TEXTO", {
        descricao: "<script>texto não executável</script>",
      }),
    );
    expect(saved.descricao).toBe("<script>texto não executável</script>");
  });

  test("falha ao construir o evento desfaz o produto; cadastro confirmado sobrevive nova conexão", async () => {
    const failed = await createCatalogo(db, {
      now: () => new Date("inválida"),
    });
    await expect(
      failed.api.salvarProduto(gestor, product("OFERTA-ROLLBACK")),
    ).rejects.toThrow();
    await expect(
      catalogo.obterProduto("OFERTA-ROLLBACK"),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    expect(
      (await journal.read()).filter((e) => e.agregado === "OFERTA-ROLLBACK"),
    ).toEqual([]);
    await catalogo.salvarProduto(gestor, product("OFERTA-DURAVEL"));
    const reconnected = testDatabase();
    try {
      const reopened = await createCatalogo(reconnected, clock);
      expect((await reopened.api.obterProduto("OFERTA-DURAVEL")).versao).toBe(
        1,
      );
      expect(
        (await reopened.journal.read()).filter(
          (e) => e.agregado === "OFERTA-DURAVEL",
        ),
      ).toHaveLength(1);
    } finally {
      await reconnected.close();
    }
  });
});

describe("M08 Precificação — contratos públicos", () => {
  const db = testDatabase();
  const clock = new TestClock();
  let catalogo: ICatalogo;
  let precos: IPrecos;
  let journal: Journal;
  beforeAll(async () => {
    catalogo = (await createCatalogo(db, clock)).api;
    ({ api: precos, journal } = await createPrecos(db, clock, catalogo));
  });
  afterAll(async () => {
    await db.close();
  });

  test("TU08.01: preço-base configurado gera cotação e evento público", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-BASE"));
    const saved = await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-BASE",
      precoCentavos: 10000,
    });
    expect(saved.versao).toBe(1);
    expect(
      await precos.calcular([{ sku: "PRECO-BASE", quantidade: 2 }]),
    ).toMatchObject({
      linhas: [
        {
          sku: "PRECO-BASE",
          precoUnitario: 10000,
          subtotal: 20000,
          desconto: 0,
          total: 20000,
        },
      ],
      totalCentavos: 20000,
      calculadaEm: "2026-10-23T10:00:00.000Z",
      validaAte: "2026-10-23T10:05:00.000Z",
    });
    expect(
      (await journal.read()).filter((e) => e.dados.sku === "PRECO-BASE"),
    ).toMatchObject([{ tipo: "PrecoAlterado", versaoAgregado: 1 }]);
  });

  test("TU08.03: promoção de 10% e cupom de 15% não se acumulam; duas unidades custam 17000", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-DESCONTO"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-DESCONTO",
      precoCentavos: 10000,
      promocao: {
        percentual: 10,
        inicio: "2026-10-23T10:00:00Z",
        fim: "2026-10-23T11:00:00Z",
      },
    });
    await precos.configurarRegra(gestor, {
      tipo: "CUPOM",
      codigo: "QUINZE",
      percentual: 15,
      inicio: "2026-10-23T10:00:00Z",
      fim: "2026-10-23T11:00:00Z",
      skus: ["PRECO-DESCONTO"],
    });
    expect(
      await precos.calcular(
        [{ sku: "PRECO-DESCONTO", quantidade: 2 }],
        "QUINZE",
      ),
    ).toMatchObject({
      linhas: [
        {
          subtotal: 20000,
          desconto: 3000,
          total: 17000,
          percentual: 15,
          regraAplicada: { tipo: "CUPOM", codigo: "QUINZE", versao: 1 },
        },
      ],
      totalCentavos: 17000,
      cupom: { codigo: "QUINZE", versao: 1 },
    });
    expect(
      (await precos.calcular([{ sku: "PRECO-DESCONTO", quantidade: 1 }]))
        .totalCentavos,
    ).toBe(9000);
  });

  test("TU08.02: regra inválida ou não autorizada não substitui preço e não publica evento", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-VALIDACAO"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-VALIDACAO",
      precoCentavos: 1000,
    });
    for (const changes of [
      { precoCentavos: 0 },
      {
        promocao: {
          percentual: 101,
          inicio: "2026-10-23T10:00:00Z",
          fim: "2026-10-23T11:00:00Z",
        },
      },
      {
        promocao: {
          percentual: 10,
          inicio: "2026-10-23T11:00:00Z",
          fim: "2026-10-23T10:00:00Z",
        },
      },
      {
        promocao: {
          percentual: 10,
          inicio: "2026-02-30T10:00:00Z",
          fim: "2026-10-23T10:00:00Z",
        },
      },
      {
        promocao: {
          percentual: 10,
          inicio: "2026-10-23T10:00:00",
          fim: "2026-10-23T11:00:00",
        },
      },
    ])
      await expect(
        precos.configurarRegra(gestor, {
          tipo: "PRECO",
          sku: "PRECO-VALIDACAO",
          precoCentavos: 1000,
          versaoEsperada: 1,
          ...changes,
        }),
      ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      precos.configurarRegra(cliente, {
        tipo: "PRECO",
        sku: "PRECO-VALIDACAO",
        precoCentavos: 1000,
      }),
    ).rejects.toMatchObject({ code: "NAO_AUTORIZADO" });
    await expect(
      precos.configurarRegra(gestor, {
        tipo: "PRECO",
        sku: "PRECO-AUSENTE",
        precoCentavos: 1000,
      }),
    ).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    expect(
      (await precos.calcular([{ sku: "PRECO-VALIDACAO", quantidade: 1 }]))
        .totalCentavos,
    ).toBe(1000);
    expect(
      (await journal.read()).filter((e) => e.dados.sku === "PRECO-VALIDACAO"),
    ).toHaveLength(1);
  });

  test("regras de preço e cupom exigem versão corrente e concorrência tem um vencedor", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-VERSAO"));
    const base = {
      tipo: "PRECO" as const,
      sku: "PRECO-VERSAO",
      precoCentavos: 1000,
    };
    await precos.configurarRegra(gestor, base);
    await expect(precos.configurarRegra(gestor, base)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    const outcomes = await Promise.allSettled([
      precos.configurarRegra(gestor, {
        ...base,
        precoCentavos: 1100,
        versaoEsperada: 1,
      }),
      precos.configurarRegra(gestor, {
        ...base,
        precoCentavos: 1200,
        versaoEsperada: 1,
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((o) => o.status === "rejected")).toMatchObject({
      reason: { code: "CONFLITO" },
    });
    expect(
      (await precos.calcular([{ sku: "PRECO-VERSAO", quantidade: 1 }]))
        .linhas[0]!.regraVersao,
    ).toBe(2);
    expect(
      (await journal.read()).filter((e) => e.dados.sku === "PRECO-VERSAO"),
    ).toHaveLength(2);

    const coupon = {
      tipo: "CUPOM" as const,
      codigo: "EDITAVEL",
      percentual: 10,
      inicio: "2026-10-23T09:00:00Z",
      fim: "2026-10-23T11:00:00Z",
    };
    await precos.configurarRegra(gestor, coupon);
    await expect(precos.configurarRegra(gestor, coupon)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    expect(
      await precos.configurarRegra(gestor, {
        ...coupon,
        percentual: 20,
        versaoEsperada: 1,
      }),
    ).toMatchObject({ percentual: 20, versao: 2 });
    expect(
      (
        await precos.calcular(
          [{ sku: "PRECO-VERSAO", quantidade: 1 }],
          "EDITAVEL",
        )
      ).cupom,
    ).toEqual({ codigo: "EDITAVEL", versao: 2 });
  });

  test("cotação vence antes da próxima promoção e respeita início inclusivo e fim exclusivo", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-TEMPO"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-TEMPO",
      precoCentavos: 1000,
      promocao: {
        percentual: 10,
        inicio: "2026-10-23T10:02:00Z",
        fim: "2026-10-23T10:03:00Z",
      },
    });
    const itens = [{ sku: "PRECO-TEMPO", quantidade: 1 }];
    expect(await precos.calcular(itens)).toMatchObject({
      totalCentavos: 1000,
      validaAte: "2026-10-23T10:02:00.000Z",
    });
    expect(
      await precos.calcular(itens, undefined, new Date("2026-10-23T10:02:00Z")),
    ).toMatchObject({
      totalCentavos: 900,
      validaAte: "2026-10-23T10:03:00.000Z",
    });
    expect(
      (
        await precos.calcular(
          itens,
          undefined,
          new Date("2026-10-23T10:03:00Z"),
        )
      ).totalCentavos,
    ).toBe(1000);
  });

  test("TU08.04: arredondamento uma vez por linha usa centavos e empate para cima", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-999"));
    await catalogo.salvarProduto(gestor, product("PRECO-50"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-999",
      precoCentavos: 999,
      promocao: {
        percentual: 10,
        inicio: "2026-10-23T09:00:00Z",
        fim: "2026-10-23T11:00:00Z",
      },
    });
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-50",
      precoCentavos: 50,
      promocao: {
        percentual: 1,
        inicio: "2026-10-23T09:00:00Z",
        fim: "2026-10-23T11:00:00Z",
      },
    });
    expect(
      await precos.calcular([
        { sku: "PRECO-999", quantidade: 1 },
        { sku: "PRECO-50", quantidade: 1 },
      ]),
    ).toMatchObject({
      linhas: [
        { subtotal: 999, desconto: 100, total: 899 },
        { subtotal: 50, desconto: 1, total: 49 },
      ],
      totalCentavos: 948,
    });
    expect(
      (await precos.calcular([{ sku: "PRECO-50", quantidade: 2 }])).linhas[0],
    ).toMatchObject({ subtotal: 100, desconto: 1, total: 99 });
  });

  test("TU08.05: cupom deve existir, estar no período e ser elegível para pelo menos um item", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-ELEGIVEL"));
    await catalogo.salvarProduto(gestor, product("PRECO-NAO-ELEGIVEL"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-ELEGIVEL",
      precoCentavos: 1000,
    });
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-NAO-ELEGIVEL",
      precoCentavos: 1000,
    });
    await precos.configurarRegra(gestor, {
      tipo: "CUPOM",
      codigo: "Restrito",
      percentual: 20,
      inicio: "2026-10-23T10:00:00Z",
      fim: "2026-10-23T10:02:00Z",
      skus: ["PRECO-ELEGIVEL"],
    });
    const eligible = [{ sku: "PRECO-ELEGIVEL", quantidade: 1 }];
    await expect(
      precos.calcular(eligible, "INEXISTENTE"),
    ).rejects.toMatchObject({ code: "CUPOM_INVALIDO" });
    await expect(
      precos.calcular(eligible, "RESTRITO", new Date("2026-10-23T09:59:59Z")),
    ).rejects.toMatchObject({ code: "CUPOM_INVALIDO" });
    await expect(
      precos.calcular(eligible, "RESTRITO", new Date("2026-10-23T10:02:00Z")),
    ).rejects.toMatchObject({
      code: "CUPOM_INVALIDO",
      message: expect.stringMatching(/expir/i),
    });
    await expect(
      precos.calcular(
        [{ sku: "PRECO-NAO-ELEGIVEL", quantidade: 1 }],
        "RESTRITO",
      ),
    ).rejects.toMatchObject({ code: "CUPOM_INVALIDO" });
    expect(
      await precos.calcular(
        [...eligible, { sku: "PRECO-NAO-ELEGIVEL", quantidade: 1 }],
        " restrito ",
      ),
    ).toMatchObject({
      linhas: [
        { desconto: 200, total: 800 },
        { desconto: 0, total: 1000 },
      ],
      totalCentavos: 1800,
      validaAte: "2026-10-23T10:02:00.000Z",
    });
  });

  test("TU08.06: falta de preço não vira zero; linhas inválidas e overflow são recusados", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-LIMITES"));
    await catalogo.salvarProduto(gestor, product("PRECO-LIMITES-SAFE"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-LIMITES",
      precoCentavos: Number.MAX_SAFE_INTEGER,
    });
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-LIMITES-SAFE",
      precoCentavos: 1000,
    });
    await expect(
      precos.calcular([{ sku: "PRECO-SEM-CONFIG", quantidade: 1 }]),
    ).rejects.toMatchObject({ code: "PRECO_INDISPONIVEL" });
    await expect(precos.calcular([])).rejects.toMatchObject({
      code: "INVALIDO",
    });
    await expect(
      precos.calcular([{ sku: "PRECO-LIMITES", quantidade: 0.5 }]),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      precos.calcular([{ sku: "PRECO-LIMITES", quantidade: 2 }]),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      precos.calcular([
        { sku: "PRECO-LIMITES-SAFE", quantidade: 1 },
        { sku: "PRECO-LIMITES-SAFE", quantidade: 1 },
      ]),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      precos.calcular([
        { sku: "PRECO-LIMITES", quantidade: 1 },
        { sku: "PRECO-LIMITES-SAFE", quantidade: 1 },
      ]),
    ).rejects.toMatchObject({ code: "INVALIDO" });
    await expect(
      precos.calcular(
        [{ sku: "PRECO-LIMITES", quantidade: 1 }],
        undefined,
        new Date("inválida"),
      ),
    ).rejects.toMatchObject({ code: "INVALIDO" });
  });

  test("agregados de eventos distinguem SKU de cupom mesmo quando seus identificadores se parecem", async () => {
    await catalogo.salvarProduto(gestor, product("cupom:COLISAO"));
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "cupom:COLISAO",
      precoCentavos: 1000,
    });
    await precos.configurarRegra(gestor, {
      tipo: "CUPOM",
      codigo: "COLISAO",
      percentual: 10,
      inicio: "2026-10-23T09:00:00Z",
      fim: "2026-10-23T11:00:00Z",
    });
    const events = (await journal.read()).filter(
      (e) => e.dados.sku === "cupom:COLISAO" || e.dados.codigo === "COLISAO",
    );
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.agregado)).size).toBe(2);
  });

  test("falha de evento desfaz preço; cotação e revisão confirmadas persistem em nova conexão", async () => {
    await catalogo.salvarProduto(gestor, product("PRECO-ROLLBACK"));
    const failed = await createPrecos(
      db,
      { now: () => new Date("inválida") },
      catalogo,
    );
    await expect(
      failed.api.configurarRegra(gestor, {
        tipo: "PRECO",
        sku: "PRECO-ROLLBACK",
        precoCentavos: 1000,
      }),
    ).rejects.toThrow();
    await expect(
      precos.calcular([{ sku: "PRECO-ROLLBACK", quantidade: 1 }]),
    ).rejects.toMatchObject({ code: "PRECO_INDISPONIVEL" });
    expect(
      (await journal.read()).filter((e) => e.dados.sku === "PRECO-ROLLBACK"),
    ).toEqual([]);
    await precos.configurarRegra(gestor, {
      tipo: "PRECO",
      sku: "PRECO-ROLLBACK",
      precoCentavos: 1000,
    });
    const reconnected = testDatabase();
    try {
      const reopened = await createPrecos(reconnected, clock, catalogo);
      expect(
        await reopened.api.calcular([{ sku: "PRECO-ROLLBACK", quantidade: 2 }]),
      ).toMatchObject({ totalCentavos: 2000, linhas: [{ regraVersao: 1 }] });
      expect(
        (await reopened.journal.read()).filter(
          (e) => e.dados.sku === "PRECO-ROLLBACK",
        ),
      ).toHaveLength(1);
    } finally {
      await reconnected.close();
    }
  });
});
