import { test, expect } from "@playwright/test";

import {
  ensureDevServerUp,
  getBackendApiBaseUrl,
  isSlugInRecentSearchSlice,
  waitUntilSearchApiIncludesSlug,
} from "./helpers";
import {
  createPublishPhotoFixtures,
  publishAdWithPhotosAndOpenDetail,
} from "./publish-gallery-helpers";

/**
 * Território fixo do wizard E2E (cidade escolhida em `publish-wizard.ts`).
 * A busca pública e a home filtram por `city_slug` — precisa bater com o anúncio publicado.
 */
const E2E_CITY_SLUG = "atibaia-sp";

let backendRegisterProbeOk = false;

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  const apiBase = getBackendApiBaseUrl();
  const probe = await request.post(`${apiBase}/api/auth/register`, {
    data: {
      email: `e2e.surface.probe.${Date.now()}@e2e.carrosnacidade.test`,
      password: "Probe123456xx",
    },
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });
  backendRegisterProbeOk = probe.ok();
  if (!backendRegisterProbeOk) {
    const body = await probe.text();
    console.warn(
      `[e2e] POST ${apiBase}/api/auth/register (probe) → HTTP ${probe.status()}`,
      body.slice(0, 400)
    );
  }
});

test.describe.serial("Publicação completa → superfícies do portal", () => {
  test("publica anúncio e valida detalhe, API, /comprar, home e painel", async ({
    page,
    context,
    request,
  }) => {
    test.skip(
      !backendRegisterProbeOk,
      "Backend POST /api/auth/register falhou (Postgres + DATABASE_URL + npm run e2e:prepare). Ver docs/testing/e2e.md"
    );

    const fixtures = createPublishPhotoFixtures();
    const { slug, brandWord } = await publishAdWithPhotosAndOpenDetail({
      page,
      context,
      request,
      photos: [fixtures.png],
    });

    const brandToken = brandWord.split(/\s+/)[0]?.trim() || brandWord;
    expect(brandToken.length, "Marca FIPE deve existir para filtrar a listagem").toBeGreaterThan(0);

    await test.step("Página pública do veículo (/veiculo/[slug])", async () => {
      expect(page.url()).toContain(`/veiculo/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    });

    const apiBase = getBackendApiBaseUrl();

    await test.step("API GET /api/ads/search (catálogo indexável)", async () => {
      await waitUntilSearchApiIncludesSlug(request, apiBase, slug, {
        brandHint: brandToken,
        citySlug: E2E_CITY_SLUG,
        timeoutMs: 50_000,
      });
    });

    await test.step("Listagem /comprar (mesmo território + marca)", async () => {
      const comprarUrl = `/comprar?city_slug=${encodeURIComponent(E2E_CITY_SLUG)}&sort=recent&brand=${encodeURIComponent(brandToken)}`;
      let found = false;
      for (let attempt = 0; attempt < 25 && !found; attempt += 1) {
        await page.goto(comprarUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await expect(page.getByText(/resultados em/i).first()).toBeVisible({ timeout: 30_000 });
        const count = await page.locator(`a[href*="/veiculo/${slug}"]`).count();
        if (count > 0) {
          found = true;
          await expect(page.locator(`a[href*="/veiculo/${slug}"]`).first()).toBeVisible();
          break;
        }
        await page.waitForTimeout(2000);
      }
      expect(found, "Card do anúncio deve aparecer em /comprar após indexação (pode levar alguns segundos por cache SSR).").toBe(
        true
      );
    });

    await test.step("Feed ‘recente’ da home (paridade por API — a UI da home tem ISR/caching)", async () => {
      const inTopSlice = await isSlugInRecentSearchSlice(request, apiBase, slug, {
        citySlug: E2E_CITY_SLUG,
        limit: 8,
        brandHint: brandToken,
      });
      if (!inTopSlice) {
        test.info().annotations.push({
          type: "note",
          description:
            "Slug fora dos 8 anúncios mais recentes neste território — o bloco ‘recentes’ da home não incluiria este card.",
        });
      }
    });

    await test.step("Painel — Meus anúncios (sessão do publicador)", async () => {
      await page.goto("/dashboard/meus-anuncios", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await expect(page.getByRole("heading", { name: /meus anúncios/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(new RegExp(brandToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });
});
