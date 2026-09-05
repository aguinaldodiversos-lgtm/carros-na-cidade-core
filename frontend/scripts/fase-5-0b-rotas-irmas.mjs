/**
 * Não-regressão das quatro rotas que compartilham o `BuyMarketplacePageClient`.
 *
 * O shell largo é da variante `cidade` e de mais ninguém. Este script mede a
 * geometria das cinco rotas lado a lado, nas larguras em que a diferença
 * apareceria, e imprime a tabela que prova o isolamento.
 *
 *   node scripts/fase-5-0b-rotas-irmas.mjs [porta]
 *
 * Referência (shell histórico): container 1280, sidebar 320, 3 colunas,
 * card 275px — em QUALQUER largura de desktop, porque `max-w-7xl` não cresce.
 */
import { chromium } from "@playwright/test";

const port = process.argv[2] || "3000";
const base = `http://127.0.0.1:${port}`;

const ROTAS = [
  ["/carros-em/atibaia-sp", "cidade (ALVO)"],
  ["/comprar", "nacional"],
  ["/carros-usados/sp", "estadual"],
  ["/comprar/estado/sp", "estadual"],
  ["/carros-usados/regiao/atibaia-sp", "regional"],
];

const LARGURAS = [1280, 1440, 1920];

const browser = await chromium.launch();
const linhas = [];

for (const [rota, variante] of ROTAS) {
  for (const w of LARGURAS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
    const page = await ctx.newPage();
    let out = {};
    try {
      const res = await page.goto(base + rota, { waitUntil: "domcontentloaded", timeout: 60_000 });
      out.status = res?.status() ?? 0;
      if (out.status === 200) {
        await page
          .locator('[data-variant="grid"]')
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
        Object.assign(
          out,
          await page.evaluate(() => {
            const grid = document.querySelector('[data-variant="grid"]').parentElement;
            const cards = [...grid.children].map((c) => c.getBoundingClientRect());
            const top = Math.min(...cards.map((c) => c.y));
            const aside = document.querySelector("main aside");
            const limpar = [...document.querySelectorAll("button")].find((b) =>
              /limpar filtros/i.test(b.textContent || "")
            );
            return {
              container: Math.round(grid.closest("div.mx-auto").getBoundingClientRect().width),
              sidebar: aside ? Math.round(aside.getBoundingClientRect().width) : null,
              col: cards.filter((c) => Math.abs(c.y - top) <= 2).length,
              card: Math.round(cards[0].width),
              // Altura do rótulo "Limpar filtros": 37px = uma linha, 62px = duas.
              limparAltura: limpar ? Math.round(limpar.getBoundingClientRect().height) : null,
            };
          })
        );
      }
    } catch (err) {
      out.erro = String(err).slice(0, 60);
    } finally {
      await ctx.close();
    }
    linhas.push({ rota, variante, w, ...out });
  }
}

console.log(
  "largura | variante      | rota                              | status | container | sidebar | col | card | limpar"
);
console.log("-".repeat(118));
for (const l of linhas) {
  console.log(
    `${String(l.w).padStart(7)} | ${l.variante.padEnd(13)} | ${l.rota.padEnd(33)} | ` +
      `${String(l.status).padStart(6)} | ${String(l.container ?? "-").padStart(9)} | ` +
      `${String(l.sidebar ?? "-").padStart(7)} | ${String(l.col ?? "-").padStart(3)} | ` +
      `${String(l.card ?? "-").padStart(4)} | ${String(l.limparAltura ?? "-").padStart(6)}`
  );
}

await browser.close();
