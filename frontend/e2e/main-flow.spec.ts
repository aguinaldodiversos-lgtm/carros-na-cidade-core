import { test, expect } from "@playwright/test";
import {
  ensureDevServerUp,
  generateValidCpfDigits,
  registerNewUserViaUi,
  getBackendApiBaseUrl,
  assertSearchApiListsVehicle,
  assertLatestAdPersistedForEmail,
  getFirstSearchAdSlug,
} from "./helpers";
import { runPublishWizardFlow } from "./publish-wizard";

/**
 * Fluxo ponta a ponta (usuário real):
 * cadastro → dashboard / meus anúncios → wizard → API de busca → (opcional) Postgres → UI listagem.
 *
 * Pré-requisitos:
 * - Next em `PLAYWRIGHT_BASE_URL` (padrão http://127.0.0.1:3000)
 * - Backend acessível em `E2E_BACKEND_API_URL` / `NEXT_PUBLIC_API_URL` (padrão http://127.0.0.1:4000)
 * - FIPE + cidades (Atibaia) como no `login-ad-publish`
 * - Persistência DB (opcional): `E2E_DATABASE_URL` ou `TEST_DATABASE_URL`
 *
 * Pular: `SKIP_E2E_MAIN=1`
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe.serial("PF — cadastro → publicar → painel → público (veículo)", () => {
  test("cria usuário, publica, valida API, painel, listagem e página /veiculo", async ({
    page,
    context,
    request,
  }, testInfo) => {
    test.skip(
      Boolean(process.env.SKIP_E2E_MAIN && process.env.SKIP_E2E_MAIN !== "0"),
      "SKIP_E2E_MAIN=1"
    );

    const run = testInfo.workerIndex + Date.now();
    const email = `e2e.${run}@e2e.carrosnacidade.test`;
    const password = `E2E_${run}_Aa1!`;
    const cred = {
      email,
      password,
      name: `E2E Usuario ${run}`,
      phone: "11988887777",
      city: "São Paulo - SP",
      cpfDigits: generateValidCpfDigits(),
    };

    await context.clearCookies();

    await registerNewUserViaUi(page, cred);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 120_000 });

    await page.goto("/dashboard/meus-anuncios", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: /Meus anúncios/i })).toBeVisible({
      timeout: 90_000,
    });

    const { brandLabel, modelLabel } = await runPublishWizardFlow(page);
    const brandWord = brandLabel.split(/\s+/)[0]?.trim() || brandLabel;
    expect(brandWord.length).toBeGreaterThan(1);

    const apiBase = getBackendApiBaseUrl();
    await assertSearchApiListsVehicle(request, apiBase, brandWord);

    await assertLatestAdPersistedForEmail(email, brandWord);

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

    const q = encodeURIComponent(`${brandWord} ${modelLabel}`.slice(0, 48));
    await page.goto(`/anuncios?q=${q}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const bodyPublic = (await page.textContent("body")) ?? "";
    expect(
      bodyPublic.toLowerCase().includes(brandWord.toLowerCase()),
      `Listagem /anuncios não contém a marca "${brandWord}"`
    ).toBeTruthy();

    const slug = await getFirstSearchAdSlug(request, apiBase, brandWord);
    expect(
      slug,
      "Busca API deve retornar ao menos um anúncio com slug para abrir /veiculo/[slug]"
    ).toBeTruthy();
    if (!slug) {
      throw new Error("[E2E PF] slug ausente após getFirstSearchAdSlug");
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
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
