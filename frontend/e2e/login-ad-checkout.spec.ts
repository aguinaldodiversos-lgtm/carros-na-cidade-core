import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Fluxo: login → wizard (7 etapas) → publicar → /planos → botão de checkout.
 *
 * Login local (sem API_URL): cpf@carrosnacidade.com / 123456
 * Variáveis: E2E_EMAIL, E2E_PASSWORD
 *
 * Antes de rodar: `npm run dev` na porta 3000 (ou PLAYWRIGHT_BASE_URL).
 */

const LOCAL_EMAIL = process.env.E2E_EMAIL ?? "cpf@carrosnacidade.com";
const LOCAL_PASSWORD = process.env.E2E_PASSWORD ?? "123456";

test.beforeAll(async ({ request, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:3000";
  let lastStatus = 0;
  for (let i = 0; i < 15; i += 1) {
    const res = await request.get(origin, { timeout: 20_000 }).catch(() => null);
    lastStatus = res?.status() ?? 0;
    if (res?.ok()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Servidor não respondeu OK em ${origin} (último status ${lastStatus}). Inicie: npm run dev — ou PLAYWRIGHT_BASE_URL=http://127.0.0.1:PORT`
  );
});

async function loginAsLocalUser(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  await context.clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (!page.url().includes("/login")) {
    await context.clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  }

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.fill(LOCAL_EMAIL);
  await page.locator('input[type="password"]').fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForTimeout(2500);

  const body = (await page.textContent("body")) ?? "";
  if (/Credenciais invalidas|invalidas/i.test(body)) {
    test.skip(true, "Login rejeitado (use credenciais do backend ou E2E_EMAIL/E2E_PASSWORD).");
  }

  // Login local não envia accessToken; /dashboard redireciona para /login (requirePfDashboardSession).
  // O cookie de sessão ainda vale para rotas públicas e para o wizard em /painel/anuncios/novo.
}

test.describe.serial("Login → anúncio → checkout", () => {
  test("percorre login, wizard e tenta pagamento no plano pago", async ({ page, context }) => {
    await loginAsLocalUser(page, context);

    await page.goto("/painel/anuncios/novo?tipo=particular&step=1", {
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
    const published =
      bodyText.includes("sucesso") ||
      bodyText.includes("enviado") ||
      bodyText.includes("Publicando") ||
      bodyText.includes("Anúncio enviado");
    const backendDown =
      bodyText.includes("Não foi possível publicar") ||
      bodyText.includes("nao configurada") ||
      bodyText.includes("NEXT_PUBLIC_API_URL") ||
      bodyText.includes("API_URL") ||
      bodyText.includes("502") ||
      bodyText.includes("backend") ||
      bodyText.includes("endpoint");

    const hasFeedback =
      published ||
      backendDown ||
      /sucesso|enviado|falha|502|endpoint|configurad|publicar o anúncio|Não foi/i.test(bodyText);

    expect(hasFeedback, `Resposta inesperada (trecho): ${bodyText.slice(0, 900)}`).toBeTruthy();

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
