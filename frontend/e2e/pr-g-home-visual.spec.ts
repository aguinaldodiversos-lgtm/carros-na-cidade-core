import { test } from "@playwright/test";

/**
 * PR G — Visual check da nova Home.
 *
 * Captura screenshots full-page da home redesenhada em mobile e desktop
 * para revisão manual.
 *
 * Para rodar (com Next dev up):
 *   npx playwright test e2e/pr-g-home-visual.spec.ts --reporter=list
 *
 * Output: test-results/pr-g-home/<viewport>.png
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-small", width: 320, height: 568 },
];

test.describe("@pr-g-home PR G — screenshots da nova Home", () => {
  for (const vp of VIEWPORTS) {
    test(`Home — ${vp.name} (full page)`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const p = await ctx.newPage();
      try {
        const response = await p.goto("/", {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await p.waitForTimeout(2500);
        await p.screenshot({
          path: `test-results/pr-g-home/home__${vp.name}.png`,
          fullPage: true,
        });
        console.log(`[pr-g-home] ${vp.name} status=${response?.status()}`);
      } finally {
        await ctx.close();
      }
    });

    // Viewport-only para capturar BottomNav fixed em mobile
    if (vp.width < 768) {
      test(`Home — ${vp.name} (viewport, mostra BottomNav)`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const p = await ctx.newPage();
        try {
          await p.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
          await p.waitForTimeout(2500);
          // Scroll para baixo um pouco para mostrar BottomNav fixo
          await p.evaluate(() => window.scrollTo(0, 200));
          await p.waitForTimeout(300);
          await p.screenshot({
            path: `test-results/pr-g-home/home__${vp.name}__bottomnav.png`,
            fullPage: false,
          });
        } finally {
          await ctx.close();
        }
      });
    }
  }
});
