import { test } from "@playwright/test";

/**
 * PR F — Visual check pós-merge.
 *
 * Captura screenshots das 6 páginas que dependem dos adapters refatorados
 * para revisão manual. Sem assertions de pixel — apenas evidência visual
 * para o reviewer comparar antes/depois.
 *
 * Para rodar (com Next dev up):
 *   npx playwright test e2e/pr-f-visual-check.spec.ts --reporter=list
 *
 * Output: test-results/pr-f-visual/<page>.png (mobile + desktop)
 */

const PAGES = [
  { name: "01-home", path: "/" },
  { name: "02-comprar-cidade", path: "/comprar/cidade/atibaia-sp" },
  { name: "03-cidade-territorial", path: "/cidade/atibaia-sp" },
  { name: "04-fipe-root", path: "/tabela-fipe" },
  { name: "05-fipe-cidade", path: "/tabela-fipe/atibaia-sp" },
  { name: "06-simulador-cidade", path: "/simulador-financiamento/atibaia-sp" },
  { name: "07-blog-cidade", path: "/blog/atibaia-sp" },
];

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

test.describe("@pr-f-visual PR F — screenshots de páginas com adapters refatorados", () => {
  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${page.name} — ${vp.name}`, async ({ page: pw, browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const p = await ctx.newPage();
        try {
          const response = await p.goto(page.path, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          // Aceita 200 e também 404/500 (queremos ver como a página renderiza
          // mesmo se o backend não estiver disponível — o objetivo é detectar
          // regressão visual nos componentes refatorados, não na infra).
          await p.waitForTimeout(2000); // settle layout
          await p.screenshot({
            path: `test-results/pr-f-visual/${page.name}__${vp.name}.png`,
            fullPage: true,
          });
          // Log para o operador
          console.log(
            `[pr-f-visual] ${page.name} ${vp.name} status=${response?.status()}`
          );
        } finally {
          await ctx.close();
        }
      });
    }
  }
});
