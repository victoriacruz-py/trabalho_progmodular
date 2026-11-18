import { test, expect } from "@playwright/test";

test("oferta vencida sai do cartão e do detalhe antes da nova cotação", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2030-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T12:00:01Z"));
  let renovar = false;
  let liberar!: () => void;
  const resposta = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await page.route("**/api/precos/cotacoes", async (route) => {
    const { itens } = route.request().postDataJSON();
    const renovacao = renovar;
    if (renovacao) await resposta;
    await route.fulfill({
      json: {
        linhas: itens.map(({ sku }: { sku: string }) => ({
          sku,
          quantidade: 1,
          precoUnitario: 10000,
          subtotal: 10000,
          desconto: renovacao ? 0 : 1000,
          total: renovacao ? 10000 : 9000,
          percentual: renovacao ? 0 : 10,
          regraVersao: 1,
        })),
        totalCentavos: renovacao ? 10000 : 9000,
        // The browser clock deliberately differs from the server clock.
        calculadaEm: "2026-10-23T10:59:50Z",
        validaAte: renovacao ? "2026-10-23T11:04:50Z" : "2026-10-23T11:00:00Z",
      },
    });
  });
  await page.goto("/");
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("button", { name: "Aurora Book 14", exact: true }),
    });
  await expect(card.locator(".produto-preco")).toContainText("90,00");
  await page
    .getByRole("button", { name: "Aurora Book 14", exact: true })
    .click();
  const detalhe = page.getByRole("dialog").locator(".detalhe-preco");
  await expect(detalhe).toContainText("90,00");
  renovar = true;
  await page.clock.runFor(10_001);
  await expect(card.locator(".produto-preco")).not.toContainText("90,00");
  await expect(detalhe).not.toContainText("90,00");
  await expect(detalhe).toContainText(/Consultando preço|Preço indisponível/);
  liberar();
  await expect(card.locator(".produto-preco strong")).toContainText("100,00");
  await expect(detalhe.locator("strong")).toContainText("100,00");
});

test("oferta possivelmente vencida é revalidada no retorno à aba", async ({
  page,
}) => {
  let renovar = false;
  await page.route("**/api/precos/cotacoes", async (route) => {
    const { itens } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        linhas: itens.map(({ sku }: { sku: string }) => ({
          sku,
          quantidade: 1,
          precoUnitario: 10000,
          subtotal: 10000,
          desconto: renovar ? 0 : 1000,
          total: renovar ? 10000 : 9000,
          percentual: renovar ? 0 : 10,
          regraVersao: 1,
        })),
        totalCentavos: renovar ? 10000 : 9000,
        calculadaEm: "2026-10-23T10:00:00Z",
        validaAte: "2026-10-23T10:05:00Z",
      },
    });
  });
  await page.goto("/");
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("button", { name: "Aurora Book 14", exact: true }),
    });
  await expect(card.locator(".produto-preco")).toContainText("90,00");
  await page
    .getByRole("button", { name: "Aurora Book 14", exact: true })
    .click();
  const detalhe = page.getByRole("dialog").locator(".detalhe-preco");
  await expect(detalhe).toContainText("90,00");
  renovar = true;
  // Browser lifecycle is the seam: simulate notification that the visible page resumed.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(card.locator(".produto-preco strong")).toContainText("100,00");
  await expect(detalhe.locator("strong")).toContainText("100,00");
});

test("cotação vencida durante o transporte fica indisponível sem repetição imediata", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2030-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T12:00:01Z"));
  let liberar!: () => void;
  const resposta = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let tentativas = 0;
  await page.route("**/api/precos/cotacoes", async (route) => {
    const { itens } = route.request().postDataJSON();
    if (itens[0].sku !== "AUR-NB-14") return route.continue();
    tentativas++;
    await resposta;
    await route.fulfill({
      json: {
        linhas: [
          {
            sku: "AUR-NB-14",
            quantidade: 1,
            precoUnitario: 10000,
            subtotal: 10000,
            desconto: 1000,
            total: 9000,
            percentual: 10,
            regraVersao: 1,
          },
        ],
        totalCentavos: 9000,
        calculadaEm: "2026-10-23T10:00:00Z",
        validaAte: "2026-10-23T10:00:01Z",
      },
    });
  });
  await page.goto("/");
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("button", { name: "Aurora Book 14", exact: true }),
    });
  await expect(card.getByText("Em estoque", { exact: true })).toBeVisible();
  await page.clock.runFor(2_000);
  liberar();
  await expect(card.locator(".produto-preco")).toHaveText("Preço indisponível");
  const recebidas = tentativas;
  await page.clock.runFor(5_000);
  await expect(card.locator(".produto-preco")).toHaveText("Preço indisponível");
  expect(tentativas).toBe(recebidas);
});
