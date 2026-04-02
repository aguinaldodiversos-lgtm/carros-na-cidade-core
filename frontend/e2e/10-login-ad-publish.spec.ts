import { test, expect } from "@playwright/test";
import {
  LOCAL_EMAIL,
  assertLatestAdPersistedForEmail,
  assertSearchApiListsVehicle,
  ensureDevServerUp,
  getBackendApiBaseUrl,
  getFirstSearchAdSlug,
  loginAsLocalUser,
} from "./helpers";
import { runPublishWizardFlow } from "./publish-wizard";

/**
 * Login → wizard (7 etapas) → Publicar anúncio.
 *
 * Credenciais padrão: cpf@carrosnacidade.com / 123456 — override com E2E_EMAIL, E2E_PASSWORD.
 *
 * API / FIPE: copie `env.local.example` → `.env.local` para `npm run dev`.
 * Com `PW_START_SERVER=1`, o Playwright injeta URLs de API (ver `playwright.config.ts`).
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe.serial("Login → publicar anúncio", () => {
  test("faz login, publica e valida painel + portal público", async ({ page, context, request }) => {
    await loginAsLocalUser(page, context);

    const { brandLabel, modelLabel } = await runPublishWizardFlow(page);
    const brandWord = brandLabel.split(/\s+/)[0]?.trim() || brandLabel;

    expect(brandWord.length).toBeGreaterThan(0);
    await assertLatestAdPersistedForEmail(LOCAL_EMAIL, brandWord);

    const apiBase = getBackendApiBaseUrl();
    await assertSearchApiListsVehicle(request, apiBase, brandWord);

    await page.goto("/dashboard/meus-anuncios", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const bodyPainel = (await page.textContent("body")) ?? "";
    expect(
      bodyPainel.toLowerCase().includes(brandWord.toLowerCase()) ||
        bodyPainel.toLowerCase().includes(modelLabel.toLowerCase().slice(0, 4)),
      `Painel não exibe marca/modelo esperados (${brandLabel} / ${modelLabel})`
    ).toBeTruthy();

    await page.goto(
      `/comprar?city_slug=atibaia-sp&city_id=2&brand=${encodeURIComponent(brandWord)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      }
    );
    const bodyComprar = (await page.textContent("body")) ?? "";
    expect(
      bodyComprar.toLowerCase().includes(brandWord.toLowerCase()),
      `Página /comprar não contém a marca "${brandWord}"`
    ).toBeTruthy();

    const slug = await getFirstSearchAdSlug(request, apiBase, brandWord);
    expect(slug, "Busca API deve retornar ao menos um anúncio com slug público").toBeTruthy();
    if (!slug) {
      throw new Error("[E2E publish] slug ausente após getFirstSearchAdSlug");
    }

    await page.goto(`/veiculo/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page).toHaveURL(new RegExp(`/veiculo/${escapeRegExp(slug)}`));
    const bodyVeiculo = (await page.textContent("body")) ?? "";
    expect(
      bodyVeiculo.toLowerCase().includes(brandWord.toLowerCase()),
      `Página pública /veiculo deve exibir a marca publicada (${brandWord})`
    ).toBeTruthy();

    await expect(
      page.locator('img[src*="uploads/ads"], img[src*="%2Fuploads%2Fads%2F"]').first()
    ).toBeVisible({ timeout: 30_000 });

    expect(brandLabel.length).toBeGreaterThan(0);
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
