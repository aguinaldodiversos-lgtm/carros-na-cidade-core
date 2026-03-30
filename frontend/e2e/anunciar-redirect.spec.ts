import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test(
  "legado /painel/anuncios/novo redireciona para /anunciar/novo",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/painel/anuncios/novo?tipo=lojista&step=3", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/\/anunciar\/novo/);
    expect(page.url()).toContain("tipo=lojista");
    expect(page.url()).toContain("step=3");
  }
);
