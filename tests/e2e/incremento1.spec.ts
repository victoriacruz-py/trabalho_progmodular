import { test, expect, Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.getByRole("button", { name: "Entrar ou cadastrar" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar na conta", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("vitrine, filtro, detalhe e layout responsivo", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Boas ideias. Melhores ferramentas." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aurora Book 14", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Em estoque", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("vitrine.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("radio", { name: "Áudio", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Fone Nexo Studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aurora Book 14", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fone Nexo Studio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "9 unidades disponíveis",
  );
  await page.getByRole("button", { name: "Fechar janela" }).click();
  expect(errors).toEqual([]);
});
test("cadastro, login, sessão após recarregar e logout", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar ou cadastrar" }).click();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const email = `cliente-${info.project.name}@example.test`,
    password = "Minha-senha-local-123";
  await page.getByLabel("Nome completo").fill("Cliente Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByRole("dialog")).toContainText("Conta criada.");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar na conta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cliente", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Cliente", exact: true }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar ou cadastrar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gestão da loja" }),
  ).toHaveCount(0);
});
test("gestor cadastra produto, preço e entrada de estoque pela interface", async ({
  page,
}, info) => {
  await page.goto("/");
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
  await page
    .getByRole("button", { name: "Gestão da loja", exact: true })
    .click();
  const sku = `E2E-${info.project.name}`,
    name = `Notebook ${info.project.name}`;
  await page.getByLabel("Referência (SKU)", { exact: true }).fill(sku);
  await page.getByLabel("Nome do produto", { exact: true }).fill(name);
  await page.getByLabel("Marca", { exact: true }).fill("Nexo");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Produto cadastrado no teste de navegador.");
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Produto salvo.");
  await page
    .getByRole("button", { name: "Preços e promoções", exact: true })
    .click();
  await page.getByLabel("Referência do produto (SKU)").fill(sku);
  await page.getByLabel("Preço-base (R$)").fill("199.90");
  await page.getByRole("button", { name: "Salvar preço", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvo sem promoção");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await page.getByLabel("Referência de estoque (SKU)").fill(sku);
  await page.getByLabel("Quantidade de unidades").fill("5");
  await page
    .getByLabel("Justificativa")
    .fill("Recebimento conferido no teste de navegador");
  await page.getByRole("button", { name: "Registrar movimentação" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Movimentação registrada.",
  );
  await expect(page.locator(".saldo-painel")).toContainText("Disponível5");
  await page.getByRole("button", { name: "Catálogo", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("199,90");
  await expect(page.getByRole("dialog")).toContainText(
    "5 unidades disponíveis",
  );
});

test("gestor retoma produto inativo, promoção e cupom depois de sair da tela", async ({
  page,
}, info) => {
  await page.goto("/");
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
  await page
    .getByRole("button", { name: "Gestão da loja", exact: true })
    .click();
  await page.getByLabel("Referência (SKU)", { exact: true }).fill("AUR-NB-14");
  await page
    .getByRole("button", { name: "Carregar produto", exact: true })
    .click();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue(
    "Aurora Book 14",
  );
  await page.getByLabel("Exibir produto na vitrine").uncheck();
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Produto salvo.");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await page.getByRole("button", { name: "Produtos", exact: true }).click();
  await page.getByLabel("Referência (SKU)", { exact: true }).fill("AUR-NB-14");
  await page
    .getByRole("button", { name: "Carregar produto", exact: true })
    .click();
  await expect(page.getByLabel("Exibir produto na vitrine")).not.toBeChecked();
  await page.getByLabel("Exibir produto na vitrine").check();
  await page
    .getByRole("button", { name: "Salvar produto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Produto salvo.");
  await page
    .getByRole("button", { name: "Preços e promoções", exact: true })
    .click();
  await page.getByLabel("Referência do produto (SKU)").fill("AUR-NB-14");
  await page
    .getByRole("button", { name: "Carregar preço", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Preço e promoção carregados",
  );
  await page.getByLabel("Preço-base (R$)").fill("70368744177664.01");
  await page.getByLabel("Aplicar uma promoção").check();
  await page.getByLabel("Início da promoção").fill("2020-01-01T00:00");
  await page.getByLabel("Fim da promoção").fill("2099-01-01T00:00");
  await page.getByRole("button", { name: "Salvar preço", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "com a promoção informada",
  );
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await page
    .getByRole("button", { name: "Preços e promoções", exact: true })
    .click();
  await page.getByLabel("Referência do produto (SKU)").fill("AUR-NB-14");
  await page
    .getByRole("button", { name: "Carregar preço", exact: true })
    .click();
  await expect(page.getByLabel("Preço-base (R$)")).toHaveValue(
    "70368744177664.01",
  );
  await expect(page.getByLabel("Aplicar uma promoção")).toBeChecked();
  await expect(page.getByLabel("Fim da promoção")).toHaveValue(
    "2099-01-01T00:00",
  );
  await page.getByLabel("Preço-base (R$)").fill("4299.00");
  await page.getByLabel("Aplicar uma promoção").uncheck();
  await page.getByRole("button", { name: "Salvar preço", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvo sem promoção");
  await page.getByRole("button", { name: "Cupons", exact: true }).click();
  const code = `PERSIST-${info.project.name}`;
  await page.getByLabel("Código do cupom").fill(code);
  await page.getByLabel("Início do cupom").fill("2020-01-01T00:00");
  await page.getByLabel("Fim do cupom").fill("2099-01-01T00:00");
  await page.getByRole("button", { name: "Salvar cupom", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cupom salvo.");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await page.getByRole("button", { name: "Cupons", exact: true }).click();
  await page.getByLabel("Código do cupom").fill(code);
  await page
    .getByRole("button", { name: "Carregar cupom", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cupom carregado.");
  await page.getByLabel("Desconto do cupom (%)").fill("15");
  await page.getByRole("button", { name: "Salvar cupom", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cupom salvo.");
});
