import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * Smoke de layout + interação do Simulador de Financiamento.
 * Pré-requisito: Next em PLAYWRIGHT_BASE_URL (default http://127.0.0.1:3000)
 */

test.describe("Simulador de financiamento — layout e funcionalidades", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    await ensureDevServerUp(request, baseURL);
  });

  test("desktop: página carrega, formulário e tabela reagem aos valores", async ({ page }) => {
    await page.goto("/simulador-financiamento/atibaia-sp", {
      waitUntil: "load",
      timeout: 90_000,
    });

    await expect(page.getByRole("heading", { name: /simulador de financiamento/i })).toBeVisible();
    await expect(
      page.getByText(/simule parcelas e encontre carros dentro do seu orçamento/i)
    ).toBeVisible();

    const valorInput = page.getByRole("textbox", { name: /valor do veículo/i });
    await expect(valorInput).toBeVisible();
    await valorInput.fill("200000,00");
    await valorInput.blur();

    const entradaInput = page.getByRole("textbox", { name: /entrada/i });
    await entradaInput.fill("40000,00");
    await entradaInput.blur();

    const taxaInput = page.getByRole("textbox", { name: /taxa de juros mensal/i });
    await taxaInput.fill("1,50");
    await taxaInput.blur();

    await page.getByRole("button", { name: /simular parcelas/i }).click();

    // Tabela deve listar todos os prazos
    await expect(page.getByRole("cell", { name: /^12x$/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /^60x$/ })).toBeVisible();

    // Linha 12x deve conter valores monetários (parcela e total)
    const row12 = page.locator("tbody tr").filter({ hasText: "12x" }).first();
    await expect(row12).toBeVisible();
    await expect(row12).toContainText("R$");

    // Alterar select de prazo marca a linha correspondente (radios sincronizados)
    await page.getByRole("combobox", { name: /prazo do financiamento/i }).selectOption("12");
    const btn12 = page.getByRole("button", { name: /selecionar 12 parcelas/i });
    await expect(btn12).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("combobox", { name: /prazo do financiamento/i }).selectOption("48");
    const btn48 = page.getByRole("button", { name: /selecionar 48 parcelas/i });
    await expect(btn48).toHaveAttribute("aria-pressed", "true");

    // Seção de carros compatíveis + link Ver todos (catálogo da cidade)
    await expect(
      page.getByRole("heading", { name: /carros compatíveis com sua parcela/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^ver todos$/i })).toBeVisible();

    // Sem overflow horizontal óbvio na viewport desktop
    const overflowDesktop = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 16;
    });
    expect(overflowDesktop, "overflow horizontal desktop").toBe(false);
  });

  test("mobile: header do simulador, dock inferior e conteúdo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/simulador-financiamento/atibaia-sp", {
      waitUntil: "load",
      timeout: 90_000,
    });

    await expect(page.getByAltText(/carros na cidade/i).first()).toBeVisible();

    await expect(page.getByText(/ofertas locais e confiança perto de você/i)).toBeVisible();

    const dock = page.getByRole("navigation", { name: /atalhos principais/i });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole("link", { name: /início/i })).toBeVisible();
    await expect(dock.getByRole("link", { name: /buscar/i })).toBeVisible();
    await expect(dock.getByRole("link", { name: /anunciar/i })).toBeVisible();

    const overflowMobile = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 8;
    });
    expect(overflowMobile, "overflow horizontal mobile").toBe(false);
  });
});
