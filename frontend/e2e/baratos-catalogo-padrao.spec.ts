import { expect, test } from "@playwright/test";
import { Client } from "pg";

const ROUTE = "/carros-baratos-em/atibaia-sp";
const LOCAL_AD = "honda-hr-v-ex-2020-atibaia-sp-e2e-1";
const NEARBY_AD = "honda-hr-v-ex-2020-braganca-sp-e2e-4";

test.describe("@seo carros baratos no layout do catálogo da cidade", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const saved: Array<{
    slug: string;
    below_fipe: boolean | null;
    fipe_reference_value: string | null;
  }> = [];

  test.beforeAll(async () => {
    // Somente banco isolado do CI: não altera produção nem inventário de usuário.
    const connectionString = process.env.E2E_DATABASE_URL;
    if (!connectionString) throw new Error("Este teste exige E2E_DATABASE_URL isolada.");
    const db = new Client({ connectionString });
    await db.connect();
    try {
      const { rows } = await db.query<{
        slug: string;
        below_fipe: boolean | null;
        fipe_reference_value: string | null;
      }>(
        "SELECT slug, below_fipe, fipe_reference_value::text FROM ads WHERE slug = ANY($1::text[])",
        [[LOCAL_AD, NEARBY_AD]]
      );
      if (rows.length !== 2) throw new Error("Fixtures territoriais de Atibaia/Bragança ausentes.");
      saved.push(...rows);

      // Uma oferta local e outra fora da cidade, ambas abaixo da FIPE.
      // Se o recorte local falhar, a oferta de Bragança aparecerá indevidamente.
      await db.query(
        "UPDATE ads SET below_fipe = true, fipe_reference_value = 125000 WHERE slug = ANY($1::text[])",
        [[LOCAL_AD, NEARBY_AD]]
      );
    } finally {
      await db.end();
    }
  });

  test.afterAll(async () => {
    if (!saved.length) return;
    const db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
    await db.connect();
    try {
      for (const item of saved) {
        await db.query(
          "UPDATE ads SET below_fipe = $2, fipe_reference_value = $3 WHERE slug = $1",
          [item.slug, item.below_fipe, item.fipe_reference_value]
        );
      }
    } finally {
      await db.end();
    }
  });

  for (const viewport of [
    { label: "desktop-1440", width: 1440, height: 900 },
    { label: "mobile-390", width: 390, height: 844 },
  ]) {
    test(`${viewport.label}: H1, sidebar/filtragem e AdCard canônico`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 60_000 });
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Carros baratos em Atibaia - SP"
      );
      const cards = page.locator('[data-variant="grid"]');
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      expect(await cards.count()).toBeGreaterThanOrEqual(1);
      await expect(cards.filter({ hasText: /honda hr-v/i }).first()).toBeVisible();
      // A cidade vizinha, embora também marcada abaixo da FIPE, fica fora.
      const nearby = cards.locator('a[href*="braganca-sp-e2e-4"]');
      await expect(nearby).toHaveCount(0);

      if (viewport.width >= 1024) {
        const sidebar = page.locator("main aside");
        await expect(sidebar).toBeVisible();
        const locked = sidebar.getByRole("button", { name: /Abaixo da FIPE/i });
        await expect(locked).toBeDisabled();
        await expect(locked).toHaveAttribute("aria-pressed", "true");
      } else {
        await page
          .getByRole("button", { name: /Filtrar/i })
          .first()
          .click();
        const modal = page.getByRole("dialog", { name: "Filtros" });
        const locked = modal.getByRole("button", { name: /Abaixo da FIPE/i });
        await expect(locked).toBeDisabled();
        await expect(locked).toHaveAttribute("aria-pressed", "true");
        await modal.getByRole("button", { name: "Fechar" }).click();
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
      await page.screenshot({
        path: `../reports/screenshots/pr82/baratos-${viewport.label}.png`,
        fullPage: true,
      });
    });
  }

  test("URL manipulada não remove abaixo-da-FIPE nem amplia além de Atibaia", async ({ page }) => {
    const response = await page.goto(`${ROUTE}?below_fipe=false&raio=50`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    const sidebar = page.locator("main aside");
    const locked = sidebar.getByRole("button", { name: /Abaixo da FIPE/i });
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-variant="grid"]').first()).toBeVisible();
    await expect(page.locator('[data-variant="grid"] a[href*="braganca-sp-e2e-4"]')).toHaveCount(0);
  });
});
