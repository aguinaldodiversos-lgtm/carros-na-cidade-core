import { expect, test, type Page } from "@playwright/test";

/**
 * Landing SEO cidade + marca + modelo — `/cidade/[slug]/marca/[brand]/modelo/[model]`.
 *
 * Contra servidor real com estoque (mesmo modelo de `catalog-city-clean-grid`):
 * nenhuma rota é interceptada, porque o que se quer provar é justamente a
 * cadeia verdadeira — página → `/api/ads/search` → Search Policy Engine → card.
 *
 * Os caminhos são parâmetros, não constantes do produto: o template é UM para
 * qualquer combinação válida. Defaults = snapshot de produção (Onix em Atibaia,
 * todo local; HB20 em Bragança Paulista, com estoque de cidade vizinha).
 *
 * Para rodar:
 *   PW_START_SERVER=1 npx playwright test e2e/model-landing.spec.ts
 *   (ou com um Next já de pé: PLAYWRIGHT_BASE_URL=http://localhost:3000 …)
 */

const LOCAL_PATH =
  process.env.E2E_MODEL_LANDING_PATH || "/cidade/atibaia-sp/marca/chevrolet/modelo/onix";
const REGIONAL_PATH =
  process.env.E2E_MODEL_LANDING_REGIONAL_PATH ||
  "/cidade/braganca-paulista-sp/marca/hyundai/modelo/hb20";

/** Wrapper de card do catálogo (`CatalogVehicleCard` → `<div data-variant="grid">`). */
const CARD = '[data-variant="grid"]';

async function openLanding(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  expect(response?.status(), `${path} tem de responder 200`).toBe(200);
  await page.locator(CARD).first().waitFor({ state: "visible", timeout: 60_000 });
  return response;
}

test.describe("@model-landing HTML inicial (sem JavaScript)", () => {
  for (const path of [LOCAL_PATH, REGIONAL_PATH]) {
    test(`conteúdo essencial está no SSR — ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const html = await res.text();

      const h1s = html.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? [];
      expect(h1s, "exatamente um h1").toHaveLength(1);
      const h1 = h1s[0].replace(/<[^>]+>/g, "").trim();
      expect(h1).toMatch(/^.+ em .+ - [A-Z]{2}$/);

      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      expect(title).toBe(`Comprar ${h1} | Carros na Cidade`);

      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
      expect(new URL(canonical).pathname).toBe(path);
      expect(new URL(canonical).search).toBe("");

      expect(html).toContain('"@type":"CollectionPage"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('href="/carros-em/');
      expect(html).toMatch(/href="\/veiculo\/[^"]+"/);
      expect(html).toContain('data-testid="model-landing-stats"');
      expect(html).toContain('data-testid="model-landing-explore"');
    });
  }
});

test.describe("@model-landing mobile — o primeiro anúncio na primeira tela", () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await openLanding(page, LOCAL_PATH);

      await expect(page.locator("h1")).toBeInViewport();
      await expect(page.getByTestId("model-landing-stats")).toBeInViewport();
      const toolbar = page.getByTestId("model-landing-toolbar");
      await expect(toolbar.getByRole("button", { name: /Filtros/ })).toBeInViewport();
      await expect(toolbar.getByLabel("Ordenar resultados")).toBeInViewport();

      const geometry = await page.evaluate((cardSelector) => {
        const card = document.querySelector(cardSelector)!.getBoundingClientRect();
        const bottomNav = [...document.querySelectorAll("nav")].find(
          (el) => getComputedStyle(el).position === "fixed"
        );
        return {
          cardTop: card.top,
          visibleBottom: bottomNav ? bottomNav.getBoundingClientRect().top : innerHeight,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      }, CARD);
      expect(geometry.cardTop, "o primeiro card começa acima da barra inferior").toBeLessThan(
        geometry.visibleBottom
      );
      expect(geometry.overflow).toBe(false);

      // Nada de refinamento permanente antes dos anúncios: está tudo na gaveta.
      await expect(page.getByLabel("Preço", { exact: true })).toHaveCount(1);
      await expect(page.getByLabel("Preço", { exact: true })).toBeHidden();
      await context.close();
    });
  }

  test("gaveta de filtros: modal acessível, Esc fecha e devolve o foco", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await openLanding(page, LOCAL_PATH);

    const trigger = page
      .getByTestId("model-landing-toolbar")
      .getByRole("button", { name: /Filtros/ });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Filtros" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByRole("button", { name: "Fechar" })).toBeFocused();
    await expect(dialog.getByRole("searchbox", { name: "Buscar nos resultados" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await context.close();
  });
});

test.describe("@model-landing desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar do catálogo, grid de 3 por linha, sem barra mobile", async ({ page }) => {
    await openLanding(page, LOCAL_PATH);
    const aside = page.getByRole("complementary", { name: "Filtros e navegação" });
    await expect(aside).toBeVisible();
    await expect(aside.getByTestId("model-landing-explore")).toBeVisible();
    await expect(page.getByTestId("model-landing-toolbar")).toBeHidden();

    const tops = await page
      .locator(CARD)
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    const perRow = tops.filter((top) => Math.abs(top - Math.min(...tops)) <= 2).length;
    expect(perRow).toBe(Math.min(3, tops.length));
  });

  test("ordenar é UX: URL com sort vira noindex e canonical continua limpa", async ({ page }) => {
    await openLanding(page, LOCAL_PATH);
    await page.getByRole("combobox", { name: "Ordenar por" }).selectOption("price_asc");
    await page.waitForURL(/[?&]sort=price_asc/);
    await page.locator(CARD).first().waitFor();

    const url = new URL(page.url());
    expect(url.pathname).toBe(LOCAL_PATH);
    // Cidade, marca e modelo pertencem ao path — nunca à query.
    for (const key of ["city_slug", "brand", "model", "commercial_model"]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical!).pathname + new URL(canonical!).search).toBe(LOCAL_PATH);
  });

  test("landing regional: declara cidades próximas sem termo técnico", async ({ page }) => {
    await openLanding(page, REGIONAL_PATH);
    const notice = page.getByTestId("model-landing-regional-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(/cidades próximas dentro da região\.$/);
    await expect(notice).not.toHaveText(/km|raio/i);
  });
});
