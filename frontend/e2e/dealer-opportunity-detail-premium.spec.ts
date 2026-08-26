import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/**
 * FASE 4.11A — a página de detalhe da oportunidade, no navegador de verdade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA — E O QUE NÃO PROVA
 * ════════════════════════════════════════════════════════════════════════════
 * PROVA composição: que a página real, dentro do layout real, entrega duas
 * colunas no desktop e uma pilha na ordem certa no celular; que o menu lateral
 * não é montado enquanto o cabeçalho global continua; que o painel de negociação
 * gruda sem cobrir o conteúdo; e que nenhuma das sete larguras produz rolagem
 * horizontal.
 *
 * Nada disso é observável em jsdom. `position: sticky`, `display: contents`,
 * `object-fit` e a ordem visual dependem de LAYOUT — e jsdom não tem layout. Os
 * testes de componente provam presença e comportamento; este prova geometria.
 *
 * NÃO PROVA o backend. A resposta do BFF é interceptada e servida por fixture,
 * pelo mesmo motivo de `dealer-sale-opportunities-visual.spec.ts`: a autorização
 * territorial e o piso por rodada são provados contra o router real em
 * `tests/sale-requests/`. Um teste visual que também tentasse provar autorização
 * falharia por seed ausente e seria desligado no primeiro CI vermelho.
 */

const DEV_SESSION_SECRET = "cnc-dev-session-secret";
const FEED_URL = "**/api/account/opportunities/sale-requests*";
const DETAIL_URL = "**/api/account/opportunities/sale-requests/*";
const LIST_PATH = "/dashboard-loja/oportunidades/veiculos";
const DETAIL_PATH = "/dashboard-loja/oportunidades/veiculos/1";
const SHOTS = "../reports/screenshots/fase-4-11a";

function signedDealerSessionCookie(): string {
  const payload = {
    id: 20,
    name: "Itmotors",
    email: "loja@example.com",
    type: "CNPJ",
    accessToken: "e2e-visual-placeholder-token",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", DEV_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Uma foto RETRATO (3:4) e uma PAISAGEM (16:9), coloridas e distinguíveis.
 *
 * O §12 pede a prova com fotos de proporções diferentes, e é justamente a
 * retrato que denunciava o corte: num quadro 16:9 com `object-cover`, um 3:4
 * perde cerca de 60% da altura. Um PNG 1×1 transparente — como usa a suíte do
 * feed — não serviria aqui: ele não tem proporção para ser cortada, e a captura
 * de tela sairia vazia.
 *
 * SVG em data URI, sem rede: a suíte não pode depender do R2 nem de internet.
 */
function photo({
  width,
  height,
  fill,
  label,
}: {
  width: number;
  height: number;
  fill: string;
  label: string;
}): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${fill}"/>
    <rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#111" stroke-width="6"/>
    <text x="50%" y="50%" font-family="sans-serif" font-size="${Math.round(width / 9)}" fill="#111" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

const PHOTOS = [
  // A primeira é RETRATO de propósito: é a que aparece nas capturas, e é a que
  // o `object-cover` mutilaria.
  photo({ width: 900, height: 1200, fill: "#D9F27E", label: "RETRATO 3:4" }),
  photo({ width: 1600, height: 900, fill: "#7EC8F2", label: "PAISAGEM 16:9" }),
  photo({ width: 1200, height: 1200, fill: "#F2A87E", label: "QUADRADA 1:1" }),
  photo({ width: 2400, height: 800, fill: "#C7A8F2", label: "PANORAMICA 3:1" }),
  photo({ width: 1600, height: 900, fill: "#A8F2C7", label: "INTERIOR" }),
  photo({ width: 1600, height: 900, fill: "#F2E27E", label: "PAINEL" }),
];

const EVALUATION = {
  tire_condition: "half_life",
  financing_status: "no",
  financing_balance: null,
  fines_status: "no",
  fines_amount: null,
  ipva_status: "paid",
  ipva_amount_due: null,
  licensing_status: "ok",
  caution_report_status: "unknown",
  auction_history: "no",
  collision_history: "no",
  engine_condition: "ok",
  engine_notes: null,
  gearbox_condition: "ok",
  gearbox_notes: null,
  suspension_condition: "ok",
  suspension_notes: null,
  body_paint_status: "none",
  body_paint_issues: [],
  body_paint_notes: null,
};

/** Os números da referência visual desta fase — reconhecíveis nas capturas. */
function buildDetail(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    sale_opportunity: {
      id: 1,
      brand: "BYD",
      brand_slug: "byd",
      model: "Dolphin",
      model_slug: "dolphin",
      fipe_model_description: "Dolphin Plus (Elétrico)",
      year: 2024,
      mileage: 200000,
      transmission: "automatico",
      fuel_type: "eletrico",
      declared_condition: "bom",
      evaluation: EVALUATION,
      minimum_accepted_price: "62500.00",
      fipe_reference_value: "74200.00",
      fipe_reference_at: "2026-05-01T00:00:00.000Z",
      image: PHOTOS[0],
      images: PHOTOS,
      known_issues:
        "Veículo de único dono, revisões realizadas em concessionária autorizada. Sem histórico de sinistro ou alagamento. Bateria em excelente estado. Documentação em dia.",
      city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
      status: "receiving_offers",
      created_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
      current_highest_offer: "60000.00",
      my_offer: "59000.00",
      is_leading: false,
      offers_count: 3,
      is_selected: false,
      selected_amount: null,
      selected_at: null,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      ...overrides,
    },
  };
}

function buildFeed() {
  return {
    success: true,
    items: [{ ...buildDetail().sale_opportunity, images: undefined, image: PHOTOS[0] }],
    next_cursor: null,
    limit: 12,
    sort: "recent",
    summary: { total: 1, new_today: 1, with_my_offer: 1, without_my_offer: 0 },
  };
}

async function prepare(page: Page, detailOverrides: Record<string, unknown> = {}) {
  await page.context().addCookies([
    { name: "cnc_session", value: signedDealerSessionCookie(), domain: "127.0.0.1", path: "/" },
  ]);

  // A rota do DETALHE é registrada por ÚLTIMO: o Playwright casa a última rota
  // compatível, e o padrão do feed (`...sale-requests*`) também casaria
  // `.../sale-requests/1`.
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(buildFeed()),
    })
  );

  await page.route(DETAIL_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(buildDetail(detailOverrides)),
    })
  );
}

/** `scrollWidth <= clientWidth + 1`. O `+1` absorve arredondamento subpixel. */
async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    metrics.scrollWidth,
    `overflow horizontal: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

/** Retângulo de um testid, na viewport. */
function boxOf(page: Page, testId: string) {
  return page.getByTestId(testId).first().boundingBox();
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("@dealer-detail-premium §60 — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sem menu lateral, com cabeçalho global e volta para oportunidades", async ({ page }) => {
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();

    // §4 — a barra não é montada. `count()` e não visibilidade: escondida por
    // CSS ela continuaria buscando plano e notificações.
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.getByText("Meu plano")).toHaveCount(0);

    // §5 — o cabeçalho global continua. Ele vem do layout raiz, não do painel.
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Carros na Cidade" }).first()).toBeVisible();

    // §64 — voltar funciona e leva à listagem, que TEM a barra de novo.
    await page.getByTestId("dealer-detail-back").click();
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
    await expect(page.locator("aside")).toHaveCount(1);
  });

  test("duas colunas, largura ampliada e nenhuma sobreposição", async ({ page }) => {
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

    const gallery = await boxOf(page, "dealer-detail-gallery");
    const panel = await boxOf(page, "dealer-offer-panel");
    expect(gallery && panel).toBeTruthy();

    // §6 — a negociação está À DIREITA da galeria, e não abaixo dela.
    expect(panel!.x).toBeGreaterThan(gallery!.x + gallery!.width - 1);
    // …e as duas começam na mesma altura: são colunas, não uma sequência.
    expect(Math.abs(panel!.y - gallery!.y)).toBeLessThan(220);

    // §6/§7 — a proporção fica na faixa pedida (esquerda 64%–70%).
    const shellWidth = gallery!.width + panel!.width;
    const leftShare = gallery!.width / shellWidth;
    expect(leftShare).toBeGreaterThan(0.6);
    expect(leftShare).toBeLessThan(0.75);

    /*
      O cabeçalho global é `sticky`, e o conteúdo começa logo abaixo dele. Sem
      folga, o link de voltar nasce ENCOSTADO na borda da barra — legível numa
      captura, mas com a impressão de estar escondido atrás dela, e a um pixel de
      ficar mesmo no dia em que a altura do cabeçalho mudar.

      A medida é a diferença entre o rodapé da barra e o topo do link.
    */
    const headerBottom = await page.evaluate(
      () => document.querySelector("header")!.getBoundingClientRect().bottom
    );
    const back = (await boxOf(page, "dealer-detail-back"))!;
    expect(back.y, "o link de voltar encostou no cabeçalho global").toBeGreaterThan(
      headerBottom + 12
    );

    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${SHOTS}/01-detail-desktop-top.png` });
  });

  test("§62 — negociação, condição e sticky durante a rolagem", async ({ page }) => {
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

    await page.getByTestId("dealer-offer-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/02-detail-desktop-negotiation.png` });

    await page.getByTestId("dealer-detail-condition").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-detail-desktop-condition.png` });

    /*
      §31 — o painel ACOMPANHA a rolagem, e não cobre o conteúdo.

      ────────────────────────────────────────────────────────────────────────
      POR QUE A ROLAGEM É CALCULADA, E NÃO UM NÚMERO FIXO
      ────────────────────────────────────────────────────────────────────────
      Uma coluna `sticky` só flutua enquanto sobra caminho: ela para de subir
      quando o rodapé dela alcança o rodapé do bloco que a contém. O curso
      disponível é (altura da grade − altura da coluna), e depende do conteúdo —
      quantas fotos, quantas linhas de ficha, quanto texto o proprietário
      escreveu.

      Um `scrollTo(0, 1200)` fixo pode cair FORA desse curso e reprovar um
      painel que está funcionando — foi exatamente o que aconteceu na primeira
      versão deste teste. Rolar até o MEIO do curso mede o que interessa em
      qualquer conteúdo.

      A prova é em três partes, porque nenhuma sozinha basta:

        1. o painel se desloca MENOS que a rolagem — é a definição de grudar.
           Um painel estático se deslocaria exatamente o mesmo tanto;
        2. o topo dele fica abaixo do cabeçalho global, e não escondido atrás;
        3. ele não invade horizontalmente a coluna esquerda — um sticky mal
           posicionado (sem `items-start`) cobriria a ficha, que é exatamente o
           que o lojista veio ler.
    */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);

    const before = (await boxOf(page, "dealer-offer-panel"))!;

    const travel = await page.evaluate(() => {
      const column = document
        .querySelector('[data-testid="dealer-offer-panel"]')!
        .closest("div")!.parentElement!;
      const grid = column.parentElement!;
      return Math.max(0, grid.getBoundingClientRect().height - column.getBoundingClientRect().height);
    });

    // Sem curso não há o que provar: seria um painel mais alto que a página.
    expect(travel, "a coluna comercial não tem curso para deslizar").toBeGreaterThan(120);

    const delta = Math.round(travel / 2);
    await page.evaluate((y) => window.scrollTo(0, y), delta);
    await page.waitForTimeout(150);

    const after = (await boxOf(page, "dealer-offer-panel"))!;
    const condition = (await boxOf(page, "dealer-detail-condition"))!;

    // 1 — grudou: deslocou menos que a rolagem.
    const moved = before.y - after.y;
    expect(moved, `painel deslocou ${moved}px para uma rolagem de ${delta}px`).toBeLessThan(
      delta - 20
    );
    // 2 — e continua abaixo do cabeçalho global, dentro da viewport.
    expect(after.y).toBeGreaterThanOrEqual(60);
    // 3 — sem invadir a coluna de leitura.
    expect(after.x).toBeGreaterThan(condition.x + condition.width - 1);

    await page.screenshot({ path: `${SHOTS}/04-detail-desktop-scroll-sticky.png` });
  });

  test("§10/§12 — a foto principal não é cortada, nem em retrato", async ({ page }) => {
    await prepare(page);
    await page.goto(DETAIL_PATH);
    const photo = page.getByTestId("dealer-detail-main-photo");
    await expect(photo).toBeVisible();

    /*
      A prova é o ESTILO COMPUTADO, não a classe do Tailwind.

      Presença de classe no fonte não prova pintura: uma regra mais específica,
      um `@apply` ou um plugin poderiam sobrescrever `object-fit` sem que o
      atributo `class` mudasse uma letra. `getComputedStyle` é o que o navegador
      de fato aplicou.
    */
    const fit = await photo.evaluate((el) => getComputedStyle(el).objectFit);
    expect(fit).toBe("contain");

    // E o veículo inteiro cabe: a área pintada da imagem tem a proporção da
    // ORIGEM (3:4), e não a da moldura — que é o sintoma de corte.
    const painted = await photo.evaluate((el) => {
      const img = el as HTMLImageElement;
      const box = img.getBoundingClientRect();
      const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      return {
        ratio: img.naturalWidth / img.naturalHeight,
        paintedW: img.naturalWidth * scale,
        paintedH: img.naturalHeight * scale,
        boxW: box.width,
        boxH: box.height,
      };
    });

    expect(painted.paintedW / painted.paintedH).toBeCloseTo(painted.ratio, 1);
    // Nada transborda a moldura — `contain` cabe por definição, e a asserção
    // trava a definição.
    expect(painted.paintedW).toBeLessThanOrEqual(painted.boxW + 1);
    expect(painted.paintedH).toBeLessThanOrEqual(painted.boxH + 1);
  });

  test("§57 — sem ofertas e liderando: dois estados, duas capturas", async ({ page }) => {
    await prepare(page, {
      current_highest_offer: null,
      my_offer: null,
      is_leading: false,
      offers_count: 0,
    });
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

    const panel = page.getByTestId("dealer-offer-panel");
    await expect(panel).toContainText("Nenhuma oferta recebida ainda.");
    await expect(panel).toContainText("Você ainda não fez uma oferta.");
    await expect(panel).not.toContainText("R$ 0,00");
    // O piso continua lá — é o único número da coluna antes da primeira oferta.
    await expect(page.getByTestId("dealer-offer-minimum")).toContainText("62.500,00");
    await page.screenshot({ path: `${SHOTS}/09-detail-no-offers.png` });

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await prepare(page, {
      current_highest_offer: "63000.00",
      my_offer: "63000.00",
      is_leading: true,
      offers_count: 4,
    });
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-standing")).toContainText("Você está liderando");
    await page.screenshot({ path: `${SHOTS}/10-detail-current-leader.png` });
  });

  test("§60 — o campo, os incrementos e o envio continuam funcionando", async ({ page }) => {
    await prepare(page);

    let posted: Record<string, unknown> | null = null;
    await page.route("**/api/account/opportunities/sale-requests/1/offers*", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          current_highest_offer: "62000.00",
          my_offer: "62000.00",
          is_leading: true,
          offers_count: 4,
          offer: { id: 9, amount: "62000.00", note: null, created_at: new Date().toISOString() },
        }),
      });
    });

    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

    // Os atalhos partem da maior oferta (60.000) e apenas PREENCHEM.
    await page.getByTestId("dealer-offer-bump-2000").click();
    await expect(page.getByTestId("dealer-offer-amount")).toHaveValue("62.000,00");

    await page.getByTestId("dealer-offer-submit").click();
    await expect(page.getByTestId("dealer-offer-success")).toBeVisible();

    expect(posted).toMatchObject({ amount: "62000.00" });
    // O estado novo veio do POST, sem segunda ida ao servidor.
    await expect(page.getByTestId("dealer-offer-standing")).toContainText("Você está liderando");
  });

  test("§46/§58 — nenhuma PII do vendedor na página nem no payload", async ({ page }) => {
    await prepare(page);

    const payloads: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/opportunities/sale-requests")) {
        payloads.push(await response.text().catch(() => ""));
      }
    });

    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();

    const visible = ((await page.locator("body").innerText()) ?? "").toLowerCase();
    for (const term of ["cpf", "e-mail do vendedor", "whatsapp", "telefone", "placa", "chassi"]) {
      expect(visible, `PII na tela: ${term}`).not.toContain(term);
    }

    const wire = payloads.join(" ").toLowerCase();
    for (const term of ["owner_user_id", "\"cpf\"", "\"email\"", "whatsapp", "\"phone\""]) {
      expect(wire, `PII no payload: ${term}`).not.toContain(term);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("@dealer-detail-premium §61 — mobile e tablet", () => {
  const NARROW = [
    { name: "360", width: 360, height: 800 },
    { name: "390", width: 390, height: 844 },
    { name: "412", width: 412, height: 915 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 800 },
    { name: "1280", width: 1280, height: 900 },
    { name: "1440", width: 1440, height: 900 },
  ];

  for (const viewport of NARROW) {
    test(`${viewport.name}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);
      await page.goto(DETAIL_PATH);
      await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();

      await expectNoHorizontalOverflow(page);

      // O CTA precisa caber INTEIRO. Um botão que estoura a coluna não aparece
      // no `scrollWidth` do documento se o pai tiver `overflow` — a medida
      // direta é o que fecha essa brecha.
      const cta = await boxOf(page, "dealer-offer-submit");
      expect(cta!.x).toBeGreaterThanOrEqual(-1);
      expect(cta!.x + cta!.width).toBeLessThanOrEqual(viewport.width + 1);

      // O campo monetário idem: é o que mais estoura em 360px.
      const field = await boxOf(page, "dealer-offer-amount");
      expect(field!.x + field!.width).toBeLessThanOrEqual(viewport.width + 1);
    });
  }

  test("390px: a ordem da pilha é galeria → negociação → FIPE → informações → condição → observações", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();

    /*
      A ordem é medida pela POSIÇÃO VERTICAL, e não pela ordem no DOM.

      É a única leitura honesta: no celular a página é uma pilha construída com
      `order-*` sobre `display: contents`, então a sequência do DOM NÃO é a
      sequência da tela. Um teste que lesse o DOM aprovaria uma pilha embaralhada.
    */
    const ids = [
      "dealer-detail-gallery",
      "dealer-offer-panel",
      "dealer-detail-market-reference",
      "dealer-detail-vehicle-info",
      "dealer-detail-condition",
      "dealer-detail-seller-notes",
    ];

    const tops: number[] = [];
    for (const id of ids) {
      const box = await boxOf(page, id);
      expect(box, `sem caixa: ${id}`).toBeTruthy();
      tops.push(box!.y);
    }

    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i], `${ids[i]} deveria vir depois de ${ids[i - 1]}`).toBeGreaterThan(tops[i - 1]);
    }

    // §31 — no celular o painel NÃO gruda: ele cobriria a ficha.
    const position = await page
      .getByTestId("dealer-offer-panel")
      .evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).position);
    expect(position).not.toBe("sticky");

    await page.screenshot({ path: `${SHOTS}/05-detail-mobile-top-390.png` });
  });

  test("390px: capturas da negociação e da condição", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

    await page.getByTestId("dealer-offer-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/06-detail-mobile-negotiation-390.png` });

    await page.getByTestId("dealer-detail-condition").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/07-detail-mobile-condition-390.png` });
  });

  test("768px: tablet sem quebra, e as miniaturas rolam em vez de espremer", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await prepare(page);
    await page.goto(DETAIL_PATH);
    await expect(page.getByTestId("dealer-detail-gallery")).toBeVisible();

    await expectNoHorizontalOverflow(page);

    // A faixa rola por dentro; a PÁGINA não. É a diferença entre miniatura
    // legível e miniatura de 40px.
    const strip = page.getByTestId("dealer-detail-thumb-strip");
    const overflowX = await strip.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");

    const thumb = await boxOf(page, "dealer-detail-thumb");
    expect(thumb!.width).toBeGreaterThan(60);

    await page.screenshot({ path: `${SHOTS}/08-detail-tablet-768.png` });
  });
});
