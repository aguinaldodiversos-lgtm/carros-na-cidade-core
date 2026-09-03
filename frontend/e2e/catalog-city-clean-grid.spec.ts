import { expect, test, type Page } from "@playwright/test";

/**
 * Fase 5.0B — geometria REAL do catálogo de `/carros-em/[slug]`.
 *
 * ── Por que medir bounding box e não classe Tailwind ────────────────────────
 * O teste unitário `VehicleGrid.columns.test.tsx` prova que a classe
 * `min-[1600px]:grid-cols-4` está no atributo `class`. Isso NÃO prova que o
 * navegador aplica quatro colunas: a classe pode não existir no CSS gerado
 * (Tailwind só emite o que encontra na varredura de arquivos), o container pode
 * não crescer o suficiente, ou uma regra mais específica pode vencer. Só a
 * caixa medida no browser decide.
 *
 * O critério de "cards na mesma linha" é o TOPO da caixa: cards de uma mesma
 * linha do grid compartilham `y`. Contamos quantas caixas distintas dividem o
 * menor `y` da lista.
 *
 * Para rodar:
 *   PW_START_SERVER=1 npx playwright test e2e/catalog-city-clean-grid.spec.ts
 */

const CITY_PATH = "/carros-em/atibaia-sp";

/**
 * O wrapper de card do catálogo — `<div data-variant="grid">`, montado pelo
 * `CatalogVehicleCard` em volta do `AdCard`. Não é um `<article>`.
 *
 * NÃO usar `main .grid`: a página tem SEIS elementos `.grid` e o primeiro é o
 * layout sidebar+conteúdo. Medi-lo dá "2 cards por linha" em qualquer largura,
 * porque o que se está medindo é a sidebar e a coluna de conteúdo. Ancorar no
 * wrapper do card é o que torna a medida inequívoca.
 */
const CARD_SELECTOR = '[data-variant="grid"]';

/** Caixa de cada card renderizado, medida no navegador. */
async function cardBoxes(page: Page) {
  const cards = page.locator(CARD_SELECTOR);
  const count = await cards.count();
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const box = await cards.nth(i).boundingBox();
    if (box && box.width > 0) boxes.push(box);
  }
  return boxes;
}

/** Quantos cards dividem a PRIMEIRA linha (mesmo topo, tolerância de 2px). */
function cardsInFirstRow(boxes: { y: number }[]): number {
  if (boxes.length === 0) return 0;
  const top = Math.min(...boxes.map((b) => b.y));
  return boxes.filter((b) => Math.abs(b.y - top) <= 2).length;
}

async function openCatalog(page: Page) {
  const response = await page.goto(CITY_PATH, { waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(response?.status(), "a cidade com estoque tem de responder 200").toBe(200);
  // O grid é SSR: esperar o primeiro card existir, não um timeout arbitrário.
  await page.locator(CARD_SELECTOR).first().waitFor({ state: "visible", timeout: 30_000 });
  return response;
}

test.describe("@fase-5-0b grid do catálogo territorial", () => {
  /**
   * A tabela abaixo é o contrato de colunas por largura. As três primeiras
   * linhas são REGRESSÃO (comportamento histórico que a fase proibiu mudar);
   * as três do meio provam que 1280/1366/1440 continuam em 3 colunas — ou
   * seja, que a quarta coluna NÃO desceu de breakpoint; a última é o alvo.
   */
  const CASES: { label: string; width: number; height: number; expected: number }[] = [
    { label: "mobile 390 (INALTERADO)", width: 390, height: 844, expected: 1 },
    { label: "mobile 412 (INALTERADO)", width: 412, height: 915, expected: 1 },
    { label: "tablet 768", width: 768, height: 1024, expected: 2 },
    { label: "desktop 1024", width: 1024, height: 768, expected: 3 },
    { label: "desktop 1280", width: 1280, height: 800, expected: 3 },
    { label: "desktop 1366", width: 1366, height: 768, expected: 3 },
    { label: "desktop 1440", width: 1440, height: 900, expected: 3 },
    { label: "desktop 1536", width: 1536, height: 864, expected: 3 },
    { label: "desktop amplo 1680", width: 1680, height: 1050, expected: 4 },
    { label: "desktop amplo 1920", width: 1920, height: 1080, expected: 4 },
  ];

  for (const c of CASES) {
    test(`${c.label} → ${c.expected} card(s) por linha`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height } });
      const page = await ctx.newPage();
      try {
        await openCatalog(page);
        const boxes = await cardBoxes(page);
        expect(boxes.length, "o catálogo precisa ter cards para a medida valer").toBeGreaterThan(
          c.expected
        );

        const perRow = cardsInFirstRow(boxes);
        const largura = Math.round(boxes[0].width);
        console.log(
          `[fase-5-0b] ${c.width}px → ${perRow} col · card ${largura}px × ${Math.round(boxes[0].height)}px`
        );
        expect(perRow, `${c.width}px deve exibir ${c.expected} card(s) por linha`).toBe(c.expected);
      } finally {
        await ctx.close();
      }
    });
  }

  test("desktop amplo: a quarta coluna NÃO comprime o card", async ({ browser }) => {
    // A regra da fase: 4 colunas não podem custar largura de card. Medimos a
    // MESMA página em 1280 (3 colunas, referência histórica) e em 1920 (4).
    const medir = async (width: number, height: number) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      try {
        await openCatalog(page);
        const boxes = await cardBoxes(page);
        return { width: boxes[0].width, height: boxes[0].height, perRow: cardsInFirstRow(boxes) };
      } finally {
        await ctx.close();
      }
    };

    const tres = await medir(1280, 800);
    const quatro = await medir(1920, 1080);

    console.log(
      `[fase-5-0b] 1280 → ${tres.perRow} col · ${Math.round(tres.width)}px | ` +
        `1920 → ${quatro.perRow} col · ${Math.round(quatro.width)}px`
    );

    expect(tres.perRow).toBe(3);
    expect(quatro.perRow).toBe(4);
    // O card em 4 colunas tem de ser >= ao de 3 colunas. Se um dia alguém baixar
    // o breakpoint para 1440, esta asserção quebra antes de chegar em produção.
    expect(quatro.width).toBeGreaterThanOrEqual(tres.width);
  });
});

test.describe("@fase-5-0b fim da página: cards → paginação → rodapé", () => {
  test("depois do grid vem o paginador e então o rodapé — nada entre eles", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await openCatalog(page);

      // O paginador existe MESMO com uma página só (27 anúncios ≤ limit 50).
      const pagination = page.getByRole("navigation", { name: /paginação/i });
      await expect(pagination).toBeVisible();

      // Referência de topo do grid: o PRIMEIRO card, não `.grid` (ver nota do
      // seletor acima — o primeiro `.grid` da página é o layout).
      const grid = page.locator(CARD_SELECTOR).first();
      const footer = page.locator("footer").last();

      const gridBox = await grid.boundingBox();
      const pagBox = await pagination.boundingBox();
      const footerBox = await footer.boundingBox();
      expect(gridBox && pagBox && footerBox).toBeTruthy();

      // Ordem vertical: grid → paginação → rodapé.
      expect(pagBox!.y).toBeGreaterThan(gridBox!.y);
      expect(footerBox!.y).toBeGreaterThan(pagBox!.y);

      // A distância entre o fim do paginador e o topo do rodapé é o "nada entre
      // eles". Antes da fase havia 1704px de blocos SEO nesse intervalo.
      const vao = footerBox!.y - (pagBox!.y + pagBox!.height);
      console.log(`[fase-5-0b] vão paginação→rodapé: ${Math.round(vao)}px`);
      expect(vao, "não pode haver bloco de conteúdo entre paginação e rodapé").toBeLessThan(200);
    } finally {
      await ctx.close();
    }
  });

  test("paginação de página única é inerte: sem link, sem ?page=1", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await openCatalog(page);
      const pagination = page.getByRole("navigation", { name: /paginação/i });
      await expect(pagination).toBeVisible();

      // Nenhum <a> dentro do paginador quando só existe uma página: a UI marca
      // o fim da lista sem inventar uma URL paginada que o SEO teria de tratar.
      await expect(pagination.locator("a")).toHaveCount(0);
      expect(await pagination.innerHTML()).not.toContain("page=1");

      // A página atual é anunciada para leitor de tela.
      await expect(pagination.locator('[aria-current="page"]')).toHaveText("1");
    } finally {
      await ctx.close();
    }
  });
});

test.describe("@fase-5-0b conteúdo removido do render", () => {
  test("os blocos pós-catálogo não são mais montados", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await openCatalog(page);
      const html = await page.content();

      // Títulos exclusivos de cada bloco removido (auditoria Fase 5.0, §§8-12).
      // Usamos texto que NÃO aparece em nenhum outro lugar da página para que a
      // ausência signifique "o bloco não foi montado", e não "mudou a copy".
      const ausentes = [
        "Também na região de", // NearbyRadiusSection
        "Perguntas frequentes", // FaqBlock
        "Quantos carros usados estão à venda", // pergunta da FAQ
        "Panorama do mercado", // CityAuthoritySection / MarketOverview
        "Lojas e vendedores em", // DealerDiscovery
      ];
      for (const texto of ausentes) {
        expect(html, `"${texto}" deveria ter saído do render`).not.toContain(texto);
      }

      // FAQPage sai junto com a FAQ visível; os outros três schemas ficam.
      expect(html).not.toContain('"@type":"FAQPage"');
      expect(html).toContain('"@type":"CollectionPage"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('"@type":"ItemList"');
    } finally {
      await ctx.close();
    }
  });

  test("o slider de distância não fica visível sem o bloco que ele alimentava", async ({
    browser,
  }) => {
    // `NearbyRadiusSection` era o ÚNICO consumidor de `?raio=`. Mantê-lo no
    // sidebar deixaria um controle que muda a URL e não muda nada na tela.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await openCatalog(page);
      await expect(page.getByText(/Distância \(km\)/i)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
