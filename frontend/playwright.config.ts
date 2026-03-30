import { defineConfig, devices } from "@playwright/test";

/**
 * Ambiente injetado no `npm run dev` quando PW_START_SERVER=1.
 * Espelha o Render (portal): API + FIPE. Permite override via E2E_BACKEND_API_URL / BACKEND_API_URL.
 * `Record<string, string>` — exigido pelo tipo de `webServer.env` (Playwright); `ProcessEnv` não serve.
 */
function playwrightDevEnv(): Record<string, string> {
  // Padrão: API local (E2E com Docker + `npm run e2e:prepare`). Override: E2E_BACKEND_API_URL=…
  const base =
    process.env.E2E_BACKEND_API_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    process.env.AUTH_API_BASE_URL?.trim() ||
    "http://127.0.0.1:4000";
  const fipe =
    process.env.FIPE_API_BASE_URL?.trim() ||
    "https://parallelum.com.br/fipe/api/v1";
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3000";

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  Object.assign(merged, {
    NODE_ENV: "development",
    AUTH_API_BASE_URL: base,
    BACKEND_API_URL: base,
    API_URL: base,
    NEXT_PUBLIC_API_URL: base,
    FIPE_API_BASE_URL: fipe,
    NEXT_PUBLIC_SITE_URL: site,
  });
  return merged;
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
  },
  // Suba o Next manualmente: `npm run dev` (porta 3000). Em CI defina PW_START_SERVER=1.
  ...(process.env.PW_START_SERVER === "1"
    ? {
        webServer: {
          command: "npm run dev -- --port 3000",
          url: "http://127.0.0.1:3000",
          // Se true, um Next já na 3000 sem AUTH_API_* / NEXT_PUBLIC_API_URL faz login cair no modo local sem JWT → 401 em /api/painel/anuncios.
          reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
          timeout: 120_000,
          env: playwrightDevEnv(),
        },
      }
    : {}),
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
