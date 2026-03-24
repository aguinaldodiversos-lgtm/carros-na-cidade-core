import path from "node:path";
import { test, expect } from "@playwright/test";
import { ensureDevServerUp, expectPublishFeedback, loginAsLocalUser } from "./helpers";

/**
 * Login → wizard (7 etapas) → Publicar anúncio.
 *
 * Login local (sem API remota): cpf@carrosnacidade.com / 123456
 * Variáveis: E2E_EMAIL, E2E_PASSWORD
 * Servidor: npm run dev (ou PLAYWRIGHT_BASE_URL).
 *
 * Rota oficial: /anunciar/novo (legado /painel/anuncios/novo redireciona).
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe.serial("Login → publicar anúncio", () => {
  test("faz login e publica o anúncio até o retorno da API", async ({ page, context }) => {
    await loginAsLocalUser(page, context);

    await page.goto("/anunciar/novo?tipo=particular&step=1", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { level: 1, name: /Dados do veículo/i })).toBeVisible();

    const selects = page.locator("main select");
    await selects.nth(0).waitFor({ state: "visible" });
    await page.waitForResponse((r) => r.url().includes("/api/fipe/brands") && r.ok(), { timeout: 90_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector("main select");
        return el && el.querySelectorAll("option").length > 1;
      },
      { timeout: 90_000 }
    );
    await selects.nth(0).selectOption({ index: 1 });

    await page.waitForResponse((r) => r.url().includes("/api/fipe/models") && r.ok(), { timeout: 90_000 });

    expect(await selects.nth(1).locator("option").count()).toBeGreaterThan(1);
    await selects.nth(1).selectOption({ index: 1 });

    await page.waitForResponse((r) => r.url().includes("/api/fipe/years") && r.ok(), { timeout: 90_000 });

    await page.waitForTimeout(400);

    const allSelects = page.locator("main select");
    expect(await allSelects.count()).toBeGreaterThanOrEqual(6);

    await allSelects.nth(2).selectOption({ index: 1 });
    await allSelects.nth(3).selectOption({ index: 1 });

    await page
      .waitForResponse((r) => r.url().includes("/api/fipe/quote") && r.ok(), { timeout: 90_000 })
      .catch(() => null);

    await allSelects.nth(4).selectOption({ index: 1 });
    await allSelects.nth(5).selectOption({ index: 1 });

    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Informações do anúncio/i })).toBeVisible();
    await page.locator('input[inputmode="numeric"]').first().fill("45000");
    await page.getByPlaceholder("R$ 0,00").fill("8500000");
    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Fotos/i })).toBeVisible();
    const sample = path.join(process.cwd(), "public", "images", "banner_home.png");
    await page.locator('input[type="file"]').setInputFiles(sample);
    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Opcionais/i })).toBeVisible();
    await page.getByRole("button", { name: "Ar-condicionado" }).click();
    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Condições/i })).toBeVisible();
    await page.getByRole("button", { name: "IPVA pago" }).click();
    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Destaque/i })).toBeVisible();
    await page.getByRole("button", { name: /Continuar/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Finalização/i })).toBeVisible();
    await page.getByPlaceholder("São Paulo").fill("São Paulo");
    await page.getByPlaceholder("SP").fill("SP");
    await page.getByPlaceholder("(11) 99999-9999").fill("11999999999");
    await page.locator('input[type="checkbox"]').last().check();

    await page.getByRole("button", { name: /Publicar anúncio/i }).click();

    await page.waitForTimeout(8000);

    const bodyText = (await page.textContent("body")) ?? "";
    expectPublishFeedback(bodyText);
  });
});
