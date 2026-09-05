/**
 * Captura as evidências visuais e geométricas da Fase 5.0B.
 *
 * Roda contra um `next start` já no ar. Não sobe servidor: o alvo (branch ou
 * baseline) é escolhido pela porta, para que as duas capturas usem exatamente o
 * mesmo script e o mesmo navegador.
 *
 *   node scripts/fase-5-0b-capture.mjs <porta> <rótulo> <dir-de-saída>
 *
 * Rótulo "branch" grava o conjunto completo de 10 imagens; "baseline" grava só
 * o que o §22 precisa comparar (mobile e desktop) mais as medidas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const port = process.argv[2] || "3000";
const label = process.argv[3] || "branch";
const outDir = process.argv[4] || "reports/screenshots/fase-5-0b";
const base = `http://127.0.0.1:${port}`;
const CITY = "/carros-em/atibaia-sp";

mkdirSync(outDir, { recursive: true });

/**
 * O wrapper de card do catálogo.
 *
 * NÃO usar `main .grid`: a página tem SEIS elementos `.grid` (chips, barra de
 * ações, rodapé e o layout sidebar+conteúdo). `querySelector("main .grid")`
 * devolvia o grid de LAYOUT — duas colunas em qualquer largura, "card" de
 * 624px. O `[data-variant="grid"]` aparece 27 vezes na página e só como wrapper
 * de card, então o grid do catálogo é, por construção, o pai deles.
 */
const CARD_SELECTOR = '[data-variant="grid"]';

/** Cards do grid do catálogo, medidos no navegador. */
async function measure(page) {
  return page.evaluate(() => {
    const first = document.querySelector('[data-variant="grid"]');
    const grid = first?.parentElement;
    if (!grid) return null;
    const cards = [...grid.children].map((el) => el.getBoundingClientRect());
    if (cards.length === 0) return null;
    const top = Math.min(...cards.map((c) => c.y));
    const nav = document.querySelector('[aria-label^="Paginação"]');
    const footer = document.querySelector("footer");
    const gridBox = grid.getBoundingClientRect();
    const container = grid.closest("div.mx-auto");
    const aside = document.querySelector("main aside");
    const asideBox = aside?.getBoundingClientRect();
    const containerBox = (container ?? document.body).getBoundingClientRect();
    return {
      cards: cards.length,
      perRow: cards.filter((c) => Math.abs(c.y - top) <= 2).length,
      cardWidth: Math.round(cards[0].width),
      cardHeight: Math.round(cards[0].height),
      gridBottom: Math.round(gridBox.bottom + window.scrollY),
      navTop: nav ? Math.round(nav.getBoundingClientRect().top + window.scrollY) : null,
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom + window.scrollY) : null,
      footerTop: footer ? Math.round(footer.getBoundingClientRect().top + window.scrollY) : null,
      docHeight: Math.round(document.documentElement.scrollHeight),
      gridWidth: Math.round(gridBox.width),
      containerWidth: Math.round(containerBox.width),
      // Sidebar só existe a partir de `lg`; no mobile é gaveta e não ocupa área.
      sidebarWidth: asideBox && asideBox.width > 0 ? Math.round(asideBox.width) : null,
      // Margem externa entre a borda da viewport e o começo do conteúdo — é o
      // que diz se a página "usa a largura útil" ou fica presa numa coluna.
      outerMargin: Math.round(containerBox.left),
      // Vão medido entre o fim da sidebar e o começo do grid.
      sidebarGap: asideBox ? Math.round(gridBox.left - asideBox.right) : null,
      cardGap: cards.length > 1 ? Math.round(cards[1].left - cards[0].right) : null,
    };
  });
}

async function open(ctx, path = CITY) {
  const page = await ctx.newPage();
  const res = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  // networkidle nunca assenta nesta página (trackers + imagens r2.dev). O sinal
  // confiável de "pronto para medir" e o primeiro card do grid estar visivel.
  if (res?.status() === 200) {
    await page.locator(CARD_SELECTOR).first().waitFor({ state: "visible", timeout: 45_000 });
    await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  return { page, status: res?.status() ?? 0 };
}

const VIEWPORTS = [
  { file: "01-city-desktop-1280", w: 1280, h: 900, full: false },
  { file: "02-city-desktop-1366", w: 1366, h: 768, full: false },
  { file: "12-city-desktop-1392", w: 1392, h: 800, full: false },
  { file: "03-city-desktop-1440", w: 1440, h: 900, full: false },
  { file: "04-city-desktop-1536", w: 1536, h: 864, full: false },
  { file: "05-city-desktop-1600", w: 1600, h: 900, full: false },
  { file: "06-city-desktop-1920", w: 1920, h: 1080, full: false },
  { file: "07-city-desktop-1440-fullpage", w: 1440, h: 900, full: true },
  { file: "08-city-desktop-1920-fullpage", w: 1920, h: 1080, full: true },
  { file: "09-city-mobile-390", w: 390, h: 844, full: false },
  { file: "10-city-mobile-390-fullpage", w: 390, h: 844, full: true },
  { file: "11-city-tablet-768", w: 768, h: 1024, full: false },
  { file: "15-city-desktop-1280-fullpage", w: 1280, h: 900, full: true },
];

/** No baseline só precisamos do que o §6 compara: mobile e o desktop de 1280. */
const BASELINE_ONLY = new Set([
  "01-city-desktop-1280",
  "09-city-mobile-390",
  "10-city-mobile-390-fullpage",
  "15-city-desktop-1280-fullpage",
]);

const browser = await chromium.launch();
const medidas = {};

for (const vp of VIEWPORTS) {
  if (label === "baseline" && !BASELINE_ONLY.has(vp.file)) continue;
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    locale: "pt-BR",
  });
  const { page, status } = await open(ctx);
  const m = await measure(page);
  medidas[`${vp.w}x${vp.h}${vp.full ? "-full" : ""}`] = { status, ...m };
  await page.screenshot({ path: join(outDir, `${vp.file}__${label}.png`), fullPage: vp.full });
  console.log(
    `[${label}] ${String(vp.w).padStart(4)}px cont=${String(m?.containerWidth).padStart(4)} ` +
      `side=${String(m?.sidebarWidth).padStart(4)} grid=${String(m?.gridWidth).padStart(4)} ` +
      `col=${m?.perRow} card=${m?.cardWidth}x${m?.cardHeight} ` +
      `margem=${m?.outerMargin} gapSide=${m?.sidebarGap} gapCard=${m?.cardGap}`
  );
  await ctx.close();
}

// Recorte do fim da página: paginação + transição para o rodapé.
if (label === "branch") {
  for (const [file, w, h] of [
    ["13-city-paginacao-desktop", 1440, 900],
    ["14-city-footer-transition", 1440, 900],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "pt-BR" });
    const { page } = await open(ctx);
    const nav = page.locator('[aria-label^="Paginação"]');
    if (file === "13-city-paginacao-desktop") {
      await nav.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await nav.screenshot({ path: join(outDir, `${file}__${label}.png`) });
    } else {
      // Enquadra o intervalo paginação → rodapé, que é o objeto da fase.
      const navBox = await nav.boundingBox();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, `${file}__${label}.png`) });
      console.log(`[${label}] ${file} navBox=${JSON.stringify(navBox)}`);
    }
    await ctx.close();
  }

  // 404 continua 404 e cidade válida continua 200 (Fase 5.0B, §6).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const r404 = await open(ctx, "/carros-em/cidade-fantasma-zz");
  medidas["404-cidade-inexistente"] = { status: r404.status };
  console.log(`[${label}] /carros-em/cidade-fantasma-zz status=${r404.status}`);
  await ctx.close();
}

writeFileSync(join(outDir, `medidas__${label}.json`), JSON.stringify(medidas, null, 2));
await browser.close();
console.log(`[${label}] medidas gravadas em ${join(outDir, `medidas__${label}.json`)}`);
