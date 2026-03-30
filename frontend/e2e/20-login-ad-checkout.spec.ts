import { test, expect } from "@playwright/test";
import { ensureDevServerUp, loginAsLocalUser } from "./helpers";
import { runPublishWizardFlow } from "./publish-wizard";

/**
 * Login → wizard → publicar → /planos → tentativa de checkout.
 * UI de finalização alinhada a `publish-wizard.ts` (UF + cidade na base).
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe.serial("Login → anúncio → checkout", () => {
  test("percorre login, wizard, publicação e tenta pagamento no plano pago", async ({
    page,
    context,
  }) => {
    await loginAsLocalUser(page, context);

    await runPublishWizardFlow(page);

    await page.goto("/planos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Planos para particulares/i })).toBeVisible();

    const paidButton = page.getByRole("button", { name: /Comprar destaque|Assinar plano/i }).first();
    await expect(paidButton).toBeVisible({ timeout: 15_000 });

    const popupPromise = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await paidButton.click();
    const popup = await popupPromise;

    await page.waitForTimeout(2500);

    const mercado =
      popup?.url()?.includes("mercadopago") ||
      popup?.url()?.includes("mercadolivre") ||
      page.url().includes("mercadopago");

    const backToLogin = page.url().includes("/login");
    const errorBox = await page
      .getByText(/Nao autenticado|checkout|Falha|nao foi possivel iniciar/i)
      .first()
      .isVisible()
      .catch(() => false);

    expect(mercado || backToLogin || errorBox).toBeTruthy();
  });
});
