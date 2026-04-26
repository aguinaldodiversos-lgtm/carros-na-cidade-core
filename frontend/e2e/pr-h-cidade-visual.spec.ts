import { test } from "@playwright/test";

/**
 * PR H — Visual check de /comprar/cidade/[slug] redesenhada.
 *
 * Captura screenshots full-page e viewport (com BottomNav fixo) em
 * mobile (375), mobile-small (320) e desktop (1280).
 *
 * Para rodar (com Next dev up):
 *   npx playwright test e2e/pr-h-cidade-visual.spec.ts --reporter=list
 *
 * Output: test-results/pr-h-cidade/<viewport>.png
 */

const URL_PATH = "/comprar/cidade/atibaia-sp";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-small", width: 320, height: 568 },
];

test.describe("@pr-h-cidade PR H — screenshots de /comprar/cidade/[slug]", () => {
  for (const vp of VIEWPORTS) {
    test(`Comprar cidade — ${vp.name} (full page)`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const p = await ctx.newPage();
      try {
        const response = await p.goto(URL_PATH, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await p.waitForTimeout(2500);
        await p.screenshot({
          path: `test-results/pr-h-cidade/cidade__${vp.name}.png`,
          fullPage: true,
        });
        console.log(`[pr-h-cidade] ${vp.name} status=${response?.status()}`);
      } finally {
        await ctx.close();
      }
    });

    if (vp.width < 768) {
      test(`Comprar cidade — ${vp.name} (viewport, mostra BottomNav + filtros flutuante)`, async ({
        browser,
      }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const p = await ctx.newPage();
        try {
          await p.goto(URL_PATH, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await p.waitForTimeout(2500);
          await p.evaluate(() => window.scrollTo(0, 400));
          await p.waitForTimeout(300);
          await p.screenshot({
            path: `test-results/pr-h-cidade/cidade__${vp.name}__bottomnav.png`,
            fullPage: false,
          });
        } finally {
          await ctx.close();
        }
      });
    }
  }
});
