import { test, expect } from "@playwright/test";
import { ensureDevServerUp, loginAsLocalUser } from "./helpers";
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
  test("faz login e publica o anúncio até o retorno da API", async ({ page, context }) => {
    await loginAsLocalUser(page, context);
    const { brandLabel } = await runPublishWizardFlow(page);
    expect(brandLabel.length).toBeGreaterThan(0);
  });
});
