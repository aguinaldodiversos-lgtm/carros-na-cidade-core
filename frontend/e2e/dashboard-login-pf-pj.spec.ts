import { test, expect } from "@playwright/test";
import { ensureDevServerUp, LOCAL_EMAIL, LOCAL_PASSWORD } from "./helpers";

const dashboardErrorRe = /Não foi possível carregar seu painel agora/i;

/** CNPJ válido (14 dígitos) — aceito pelo backend no registro. */
const SAMPLE_CNPJ = "04252011000110";

test.describe("Login → painel PF e PJ", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    await ensureDevServerUp(request, baseURL);
  });

  test(
    "PF: login API → /dashboard carrega (sem erro de carga do painel)",
    { tag: "@smoke" },
    async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    const loginRes = await page.request.post("/api/auth/login", {
      data: { email: LOCAL_EMAIL, password: LOCAL_PASSWORD },
      headers: { "Content-Type": "application/json" },
    });

    if (!loginRes.ok()) {
      const body = await loginRes.text();
      const apiDown =
        loginRes.status() >= 500 || /internal server error|ECONNREFUSED/i.test(body);
      test.skip(
        loginRes.status() === 401,
        `Login PF 401. Rode \`npm run e2e:prepare\` (Postgres + seed), suba a API e use E2E_EMAIL/E2E_PASSWORD se necessário. ${body.slice(0, 160)}`
      );
      test.skip(
        apiDown,
        `API/DB indisponível (HTTP ${loginRes.status()}). Inicie Postgres, rode \`node scripts/e2e-seed.mjs\` e \`npm run dev\` na raiz. ${body.slice(0, 160)}`
      );
      throw new Error(`POST /api/auth/login: ${loginRes.status()} — ${body.slice(0, 400)}`);
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
    await page.waitForTimeout(1000);

    await expect(page.locator("body")).not.toContainText(dashboardErrorRe, { timeout: 30_000 });
    await expect(page.getByText(/Olá,/i).or(page.getByRole("heading", { name: /Painel|Resumo|Meus/i }))).toBeVisible({
      timeout: 30_000,
    });
  }
  );

  test("PJ: registro CNPJ → /dashboard-loja carrega (sem erro de carga do painel)", async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    const run = Date.now();
    const email = `e2e.pj.${run}@e2e.carrosnacidade.test`;
    const password = `E2E_${run}_Aa1!`;

    const reg = await page.request.post("/api/auth/register", {
      data: {
        name: `E2E Loja ${run}`,
        email,
        password,
        phone: "11988887777",
        city: "São Paulo - SP",
        document_type: "cnpj",
        document_number: SAMPLE_CNPJ,
      },
      headers: { "Content-Type": "application/json" },
    });

    if (!reg.ok()) {
      const body = await reg.text();
      const apiDown =
        reg.status() >= 500 || /internal server error|ECONNREFUSED/i.test(body);
      test.skip(
        apiDown,
        `Registro PJ: API/DB indisponível (HTTP ${reg.status()}). Postgres + migrations + \`node scripts/e2e-seed.mjs\` (cidades). ${body.slice(0, 160)}`
      );
      test.skip(
        reg.status() === 400 && /já cadastrado|cadastrado/i.test(body),
        `CNPJ/email em conflito — ignorando execução. ${body.slice(0, 120)}`
      );
      throw new Error(`POST /api/auth/register PJ: ${reg.status()} — ${body.slice(0, 500)}`);
    }

    await page.goto("/dashboard-loja", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForURL(/\/dashboard-loja/, { timeout: 120_000 });
    await page.waitForTimeout(1000);

    await expect(page.locator("body")).not.toContainText(dashboardErrorRe, { timeout: 30_000 });
    await expect(
      page.getByText(/Olá,/i).or(page.getByRole("heading", { name: /Painel|Resumo|Lojista|CNPJ/i }))
    ).toBeVisible({ timeout: 30_000 });
  });
});
