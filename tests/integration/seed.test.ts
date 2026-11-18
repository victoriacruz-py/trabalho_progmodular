import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { compose, Services } from "../../apps/api/src/composition";
import { seedDevelopment } from "../../apps/api/src/seed";
let services: Services;
beforeAll(async () => {
  services = await compose(process.env.TEST_DATABASE_URL!);
});
afterAll(async () => {
  await services?.db.close();
});
test("retomar a demonstração preserva produto desativado, preço e quantidade já alterados", async () => {
  await seedDevelopment(
    services,
    "seed-test@example.test",
    "Senha-local-12345",
  );
  const session = await services.clientes.api.autenticar(
      "seed-test@example.test",
      "Senha-local-12345",
    ),
    ctx = await services.clientes.api.validarSessao(session.token);
  const product = await services.catalogo.admin.obterProduto(ctx, "AUR-NB-14");
  const price = await services.precos.admin.obterRegra(ctx, {
    tipo: "PRECO",
    sku: product.sku,
  });
  await services.precos.api.configurarRegra(ctx, {
    tipo: "PRECO",
    sku: product.sku,
    precoCentavos: 123456,
    versaoEsperada: price.versao,
  });
  await services.catalogo.api.salvarProduto(ctx, {
    ...product,
    ativo: false,
    versaoEsperada: product.versao,
  });
  await services.estoque.api.movimentar(
    ctx,
    {
      sku: product.sku,
      tipo: "SAIDA",
      quantidade: 1,
      justificativa: "Conferência de teste",
    },
    "seed-test-out",
  );
  await seedDevelopment(
    services,
    "seed-test@example.test",
    "Senha-local-12345",
  );
  expect(
    (await services.catalogo.admin.obterProduto(ctx, product.sku)).ativo,
  ).toBe(false);
  expect(
    await services.precos.admin.obterRegra(ctx, {
      tipo: "PRECO",
      sku: product.sku,
    }),
  ).toMatchObject({ precoCentavos: 123456, versao: price.versao + 1 });
  expect((await services.estoque.api.consultar(product.sku)).fisico).toBe(11);
});
