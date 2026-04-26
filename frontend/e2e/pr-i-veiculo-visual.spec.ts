import { test } from "@playwright/test";

/**
 * PR I — Visual check de /veiculo/[slug] redesenhada.
 *
 * Captura screenshots full-page e viewport (com sticky CTA) em
 * mobile (375), mobile-small (320) e desktop (1280).
 *
 * Como o slug exato muda por ambiente, usamos um slug que
 * deveria existir em mock; se backend retornar 404/erro, o page.tsx
 * cai em buildFallbackVehicle e renderiza com placeholder
 * — exatamente o cenário "sem imagem" que precisamos validar
 * (regra 13 do PR I).
 */

const VEHICLE_PATH = process.env.VEHICLE_SLUG_FOR_E2E
  ? `/veiculo/${process.env.VEHICLE_SLUG_FOR_E2E}`
  : "/veiculo/honda-civic-2020";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-small", width: 320, height: 568 },
];

test.describe("@pr-i-veiculo PR I — screenshots de /veiculo/[slug]", () => {
  for (const vp of VIEWPORTS) {
    test(`Veículo — ${vp.name} (full page)`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const p = await ctx.newPage();
      try {
        const response = await p.goto(VEHICLE_PATH, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await p.waitForTimeout(2500);
        await p.screenshot({
          path: `test-results/pr-i-veiculo/veiculo__${vp.name}.png`,
          fullPage: true,
        });
        console.log(`[pr-i-veiculo] ${vp.name} status=${response?.status()}`);
      } finally {
        await ctx.close();
      }
    });

    if (vp.width < 768) {
      test(`Veículo — ${vp.name} (viewport, mostra StickyCTA)`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const p = await ctx.newPage();
        try {
          await p.goto(VEHICLE_PATH, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await p.waitForTimeout(2500);
          await p.evaluate(() => window.scrollTo(0, 800));
          await p.waitForTimeout(300);
          await p.screenshot({
            path: `test-results/pr-i-veiculo/veiculo__${vp.name}__sticky.png`,
            fullPage: false,
          });
        } finally {
          await ctx.close();
        }
      });
    }
  }
});
