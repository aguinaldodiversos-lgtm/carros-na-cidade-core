import { test, expect } from "@playwright/test";
import {
  ensureDevServerUp,
  registerMinimalUserViaApi,
  completePendingProfileIfNeeded,
  assertLatestAdPersistedForEmail,
  getBackendApiBaseUrl,
} from "./helpers";
import { runPublishWizardFlow } from "./publish-wizard";

/**
 * Fluxo completo: cadastro só e-mail+senha → painel → Novo anúncio (gate CPF) → wizard → POST publicação.
 *
 * Pré-requisitos: Next (3000) + backend (4000) com **Postgres** (`DATABASE_URL`) + FIPE.
 * Preparar base: `npm run e2e:prepare` (raiz). Ver docs/testing/e2e.md
 */

let backendRegisterProbeOk = false;

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  const apiBase = getBackendApiBaseUrl();
  const probe = await request.post(`${apiBase}/api/auth/register`, {
    data: {
      email: `e2e.probe.${Date.now()}@e2e.carrosnacidade.test`,
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

test.describe.serial("Cadastro mínimo → completar perfil → publicar", () => {
  test("cria conta, completa CPF no primeiro anúncio e publica", async ({ page, context }) => {
    test.skip(
      !backendRegisterProbeOk,
      "Backend POST /api/auth/register falhou (subir Postgres, definir DATABASE_URL no processo da API e rodar npm run e2e:prepare na raiz). Ver docs/testing/e2e.md"
    );
    await context.clearCookies();

    const run = Date.now();
    const email = `e2e.min.${run}@e2e.carrosnacidade.test`;
    const password = `E2Emin_${run}_Aa1!`;

    await registerMinimalUserViaApi(page, { email, password });

    await page.waitForURL(/\/dashboard/, {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Olá,/i })).toBeVisible({ timeout: 90_000 });

    await page.goto("/anunciar/novo?tipo=particular&step=1", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await completePendingProfileIfNeeded(page);

    const { brandLabel } = await runPublishWizardFlow(page, { skipInitialNavigation: true });
    expect(brandLabel.length).toBeGreaterThan(0);

    const brandWord = brandLabel.split(/\s+/)[0]?.trim() || brandLabel;
    await assertLatestAdPersistedForEmail(email, brandWord);
  });
});
