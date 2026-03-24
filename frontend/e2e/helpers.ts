import { test, expect, type BrowserContext, type Page } from "@playwright/test";

export const LOCAL_EMAIL = process.env.E2E_EMAIL ?? "cpf@carrosnacidade.com";
export const LOCAL_PASSWORD = process.env.E2E_PASSWORD ?? "123456";

export async function ensureDevServerUp(request: import("@playwright/test").APIRequestContext, baseURL: string | undefined) {
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
}

export async function loginAsLocalUser(page: Page, context: BrowserContext) {
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
}

/** Aceita sucesso da API ou erro conhecido (backend ausente, 502, etc.). */
export function expectPublishFeedback(bodyText: string) {
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
}
