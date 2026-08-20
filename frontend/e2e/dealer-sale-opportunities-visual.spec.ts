import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/**
 * Prova VISUAL e RESPONSIVA do feed do lojista (Fase 4.3, Subfase A).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO PROVA — E O QUE NÃO PROVA
 * ────────────────────────────────────────────────────────────────────────────
 * PROVA: que a página real, dentro do shell real (`AccountPanelShell`), renderiza
 * o feed sem overflow horizontal em seis larguras, com um card por linha no
 * celular e grade progressiva no desktop, e sem nenhum canal de contato na tela.
 *
 * NÃO PROVA: o backend. A resposta do BFF é interceptada e servida por uma
 * fixture — de propósito. A correção do escopo territorial, do filtro de status
 * e da ausência de PII é provada onde ela mora, em
 * `tests/sale-requests/sale-requests-dealer-feed.test.js`, contra o router real.
 * Duplicar aquelas asserções aqui as tornaria dependentes de um banco e de um
 * seed, sem aumentar a cobertura.
 *
 * A separação importa: um teste visual que também tentasse provar autorização
 * falharia por motivo errado (seed ausente) e seria desligado no primeiro CI
 * vermelho.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A SESSÃO
 * ────────────────────────────────────────────────────────────────────────────
 * `requireLojistaDashboardSession` só lê o cookie `cnc_session` e exige
 * `type === "CNPJ"` — não chama o backend. O cookie é assinado com HMAC pelo
 * segredo de DESENVOLVIMENTO, que é literal no código (`cnc-dev-session-secret`,
 * em `services/sessionService.ts`) quando `AUTH_SESSION_SECRET` não está
 * definido e `NODE_ENV !== "production"`.
 *
 * Gerar o cookie aqui é o equivalente visual do que `scripts/e2e-seed.mjs` faz
 * para os fluxos de dados. Não há credencial real envolvida, e o mesmo cookie é
 * inútil em qualquer ambiente com `AUTH_SESSION_SECRET` configurado.
 */

const DEV_SESSION_SECRET = "cnc-dev-session-secret";
const FEED_URL = "**/api/account/opportunities/sale-requests*";
const DETAIL_URL = "**/api/account/opportunities/sale-requests/*";
const PAGE_PATH = "/dashboard-loja/oportunidades/veiculos";
const DETAIL_PATH = "/dashboard-loja/oportunidades/veiculos/1";

function signedDealerSessionCookie(): string {
  const payload = {
    id: 20,
    name: "Loja Teste",
    email: "loja@example.com",
    type: "CNPJ",
    // `requireLojistaDashboardSession` redireciona para /login quando a sessão
    // não tem NENHUM dos dois tokens — a identidade sozinha não basta. O valor é
    // um marcador, não um JWT: nesta suíte o único fetch que sairia da página é
    // o do feed, e ele é interceptado antes de chegar ao BFF.
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

/** Doze veículos com fichas variadas — inclusive uma linha LEGADA (tudo NULL). */
function buildFixture() {
  const brands = [
    ["Volkswagen", "volkswagen", "T-Cross", "T-Cross 200 TSI 1.0 Flex 12V 5p Aut."],
    ["Fiat", "fiat", "Argo", "Argo Drive 1.0 6V Flex"],
    ["Chevrolet", "chevrolet", "Onix", "Onix LT 1.0 12V Flex 5p Mec."],
    ["Hyundai", "hyundai", "HB20", "HB20 Comfort 1.0 Flex 12V Mec."],
  ];

  const items = Array.from({ length: 12 }, (_, index) => {
    const [brand, brandSlug, model, description] = brands[index % brands.length];
    const legacy = index === 3;

    return {
      id: index + 1,
      brand,
      brand_slug: brandSlug,
      model,
      model_slug: model.toLowerCase(),
      fipe_model_description: description,
      year: 2016 + (index % 8),
      mileage: 18000 + index * 9700,
      transmission: index % 2 === 0 ? "automatico" : "manual",
      fuel_type: "flex",
      declared_condition: ["excelente", "bom", "regular", "precisa_reparos"][index % 4],
      evaluation: legacy
        ? {
            // Linha publicada ANTES da migration 054: tudo NULL. O card não pode
            // inventar etiqueta nenhuma para ela.
            tire_condition: null,
            financing_status: null,
            financing_balance: null,
            fines_status: null,
            fines_amount: null,
            ipva_status: null,
            ipva_amount_due: null,
            licensing_status: null,
            caution_report_status: null,
            auction_history: null,
            collision_history: null,
            engine_condition: null,
            engine_notes: null,
            gearbox_condition: null,
            gearbox_notes: null,
            suspension_condition: null,
            suspension_notes: null,
            body_paint_status: null,
            body_paint_issues: null,
            body_paint_notes: null,
          }
        : {
            tire_condition: ["new", "good", "half_life", "replace_now"][index % 4],
            financing_status: index % 3 === 0 ? "yes" : "no",
            financing_balance: index % 3 === 0 ? "18500.00" : null,
            fines_status: "no",
            fines_amount: null,
            ipva_status: "paid",
            ipva_amount_due: null,
            licensing_status: "ok",
            caution_report_status: ["not_available", "approved", "approved_with_notes", "unknown"][
              index % 4
            ],
            auction_history: index % 5 === 0 ? "yes" : "no",
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
          },
      // A linha legada também não tem referência: o snapshot só é gravado com
      // confiança alta, então uma solicitação publicada com o provedor FIPE fora
      // do ar chega ao card com NULL. É o caso que precisa dizer "não
      // disponível" em vez de sumir — e nunca "R$ 0,00".
      fipe_reference_value: legacy ? null : `${72000 + index * 3100}.00`,
      fipe_reference_at: legacy ? null : "2026-08-01T00:00:00.000Z",
      image: null,
      city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
      status: "receiving_offers",
      created_at: new Date(Date.now() - index * 5 * 3600_000).toISOString(),

      // ESTADO DA DISPUTA presente na resposta e AUSENTE da tela.
      //
      // O backend continua mandando os três valores por card — o contrato não
      // mudou. Quem parou de renderizá-los foi o card, e é por isso que a
      // fixture precisa carregá-los: a prova de "nenhum valor monetário no
      // feed" só vale se houver valor para vazar.
      current_highest_offer: index % 2 === 0 ? `${61000 + index * 500}.00` : null,
      my_offer: index % 4 === 0 ? `${58000 + index * 500}.00` : null,
      is_leading: false,
      offers_count: index % 2 === 0 ? 3 : 0,
    };
  });

  return { success: true, items, next_cursor: null, limit: 12, sort: "recent", summary: { total: 12, new_today: 4, with_my_offer: 3, without_my_offer: 9 } };
}

/** O detalhe: o primeiro item do feed, com galeria e uma disputa em andamento. */
function buildDetailFixture() {
  const [first] = buildFixture().items;
  return {
    success: true,
    sale_opportunity: {
      ...first,
      images: [
        // 1×1 transparente em PNG, embutido: a suíte visual não pode depender de
        // rede nem de R2 configurado para provar que a galeria monta.
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=",
      ],
      known_issues: "Ar-condicionado gelando pouco; revisão feita em junho.",
      // Uma disputa em andamento, e o lojista NÃO liderando: é o estado que
      // exercita o badge, a distância para a FIPE e os atalhos de incremento.
      current_highest_offer: "61000.00",
      my_offer: "58000.00",
      is_leading: false,
      offers_count: 3,
    },
  };
}

async function prepare(page: Page) {
  await page.context().addCookies([
    {
      name: "cnc_session",
      value: signedDealerSessionCookie(),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  // A rota do DETALHE vem primeiro: o Playwright casa a última rota registrada
  // que bate, e o padrão do feed (`...sale-requests*`) também casaria
  // `.../sale-requests/1`. Registrada nesta ordem, a mais específica vence.
  await page.route(FEED_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(buildFixture()),
    });
  });

  await page.route(DETAIL_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(buildDetailFixture()),
    });
  });
}

/**
 * A medida que importa: `scrollWidth <= clientWidth + 1`.
 *
 * O `+1` absorve arredondamento subpixel do layout — sem ele o teste ficaria
 * intermitente em larguras ímpares e seria desativado, que é o pior desfecho
 * possível para uma guarda de overflow.
 */
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

/**
 * As colunas esperadas por largura.
 *
 * Mudaram na Fase 4.3.1: 1024 passou de 2 para 3 e 1440 de 3 para 4. O card
 * antigo tinha ~360px em 1440 — foto enorme e texto perdido no meio dela. Em
 * quatro colunas ele fica em ~270px, que é a densidade da referência.
 */
const VIEWPORTS = [
  { name: "360", width: 360, height: 800, columns: 1 },
  { name: "390", width: 390, height: 844, columns: 1 },
  { name: "412", width: 412, height: 915, columns: 1 },
  { name: "768", width: 768, height: 1024, columns: 2 },
  { name: "1024", width: 1024, height: 800, columns: 3 },
  { name: "1440", width: 1440, height: 900, columns: 4 },
];

test.describe("@dealer-sale-feed feed do lojista — visual e responsivo", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}px: renderiza sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);

      await page.goto(PAGE_PATH);
      await expect(page.getByTestId("dealer-sale-opportunities-list")).toBeVisible();
      await expect(page.getByTestId("dealer-sale-opportunity-card").first()).toBeVisible();

      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: `test-results/dealer-sale-feed-${viewport.name}.png`,
        fullPage: false,
      });
    });

    test(`${viewport.name}px: ${viewport.columns} card(s) por linha`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);
      await page.goto(PAGE_PATH);
      await expect(page.getByTestId("dealer-sale-opportunity-card").first()).toBeVisible();

      // Conta quantos cards compartilham o MESMO topo — é a definição observável
      // de "cards na mesma linha", e não depende de ler classes do Tailwind.
      const perRow = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-testid="dealer-sale-opportunity-card"]')];
        if (cards.length === 0) return 0;
        const firstTop = Math.round(cards[0].getBoundingClientRect().top);
        return cards.filter((card) => Math.round(card.getBoundingClientRect().top) === firstTop)
          .length;
      });

      expect(perRow).toBe(viewport.columns);
    });
  }

  /*
    ──────────────────────────────────────────────────────────────────────────
    O CARD É TRIAGEM — NENHUM VALOR MONETÁRIO NELE
    ──────────────────────────────────────────────────────────────────────────
    Referência FIPE, maior proposta e a proposta desta loja saíram do card e
    vivem no DETALHE, ao lado do formulário que os usa. A fixture do feed TEM os
    três valores; se algum voltasse a ser renderizado, apareceria aqui.

    A prova é na página real (e não só no DOM de teste) porque a regressão que
    se quer impedir é visual: alguém reintroduzir um bloco de dinheiro "só para
    dar contexto" e a grade voltar a competir consigo mesma.
  */
  test("nenhum valor monetário no feed — dinheiro só no detalhe", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("dealer-sale-opportunity-card").first()).toBeVisible();

    const cards = page.getByTestId("dealer-sale-opportunity-card");
    const texto = (await cards.allTextContents()).join(" | ");

    for (const proibido of ["R$", "Referência FIPE", "Maior proposta", "Sua proposta"]) {
      expect(texto, `card não pode carregar "${proibido}"`).not.toContain(proibido);
    }
  });

  /*
    ──────────────────────────────────────────────────────────────────────────
    NO CELULAR É UMA LISTA, NÃO UM CARTÃO ESPREMIDO
    ──────────────────────────────────────────────────────────────────────────
    A medida observável de "item de lista horizontal" é geométrica: a foto fica
    À ESQUERDA do texto (mesma faixa vertical, não empilhada) e o item é mais
    LARGO do que alto. Um cartão vertical reprova nas duas.

    O teto de altura não é estética. O item mede ~198px em 390px de largura, e o
    limite de 200 é o valor MEDIDO com folga de dois pixels para arredondamento
    de fonte. Vale contra o que ele impede: o cartão vertical anterior (foto 4:3
    + sete linhas) passava de 380px, e o feed do celular mostrava dois veículos
    por tela em vez de quatro.

    Não foi espremido além disso porque o que sobrou é o que decide abrir: a
    versão FIPE separa um EX de um LX, e a linha de km/combustível/câmbio é a
    comparação entre cards. Ganhar mais 20px apagando uma das duas trocaria
    altura por cegueira.
  */
  for (const width of [360, 390, 412]) {
    test(`${width}px: o item é horizontal e compacto, com a foto à esquerda`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await prepare(page);
      await page.goto(PAGE_PATH);

      const card = page.getByTestId("dealer-sale-opportunity-card").first();
      await expect(card).toBeVisible();

      const box = await card.boundingBox();
      const photo = await card.locator("img, [data-testid='dealer-sale-opportunity-no-photo']")
        .first()
        .boundingBox();
      const titulo = await card.getByRole("heading").first().boundingBox();

      expect(box!.width).toBeGreaterThan(box!.height);
      expect(box!.height).toBeLessThanOrEqual(200);

      // Foto à ESQUERDA do título, e não acima dele.
      expect(photo!.x + photo!.width).toBeLessThanOrEqual(titulo!.x + 1);

      // O CTA principal cabe inteiro dentro do card — nada de botão escapando.
      const cta = await card.getByTestId("dealer-sale-opportunity-evaluate").boundingBox();
      expect(cta!.x).toBeGreaterThanOrEqual(box!.x - 1);
      expect(cta!.x + cta!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);

      await page.screenshot({
        path: `test-results/dealer-sale-feed-lista-${width}.png`,
        fullPage: false,
      });
    });
  }

  test("desktop: o cartão é vertical, com a foto no topo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);

    const card = page.getByTestId("dealer-sale-opportunity-card").first();
    await expect(card).toBeVisible();

    const photo = await card.locator("img, [data-testid='dealer-sale-opportunity-no-photo']")
      .first()
      .boundingBox();
    const titulo = await card.getByRole("heading").first().boundingBox();

    // A partir de `sm` o layout inverte: a foto passa a ficar ACIMA do título.
    expect(photo!.y + photo!.height).toBeLessThanOrEqual(titulo!.y + 1);

    // Altura consistente entre os cards da mesma linha: a grade não pode ficar
    // serrilhada por causa de uma etiqueta a mais num veículo.
    const alturas = await page
      .getByTestId("dealer-sale-opportunity-card")
      .evaluateAll((nodes) =>
        nodes.slice(0, 4).map((node) => Math.round(node.getBoundingClientRect().height))
      );
    expect(Math.max(...alturas) - Math.min(...alturas)).toBeLessThanOrEqual(2);
  });

  test("os dois CTAs do card: 'Avaliar agora' abre o detalhe no formulário", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);

    const card = page.getByTestId("dealer-sale-opportunity-card").first();
    await expect(card.getByTestId("dealer-sale-opportunity-evaluate")).toHaveAttribute(
      "href",
      /\/oportunidades\/veiculos\/1(\?[^#]*)?#proposta$/
    );

    // O clique precisa chegar ao CTA: a camada que torna o cartão inteiro
    // clicável (`after:inset-0` do "Ver detalhes") cobre o botão inteiro, e sem
    // o `z-10` o lojista cairia no topo da página em vez do formulário.
    await card.getByTestId("dealer-sale-opportunity-evaluate").click();
    await expect(page).toHaveURL(/\/oportunidades\/veiculos\/1.*#proposta$/);
    await expect(page.locator("#proposta")).toBeVisible();
  });

  test("mobile: os filtros ficam atrás de um botão, não empilhados no topo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(PAGE_PATH);

    const toggle = page.getByTestId("dealer-sale-opportunity-filters-toggle");
    await expect(toggle).toBeVisible();

    const panel = page.locator("#dealer-sale-filters-panel");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.screenshot({ path: "test-results/dealer-sale-feed-390-filtros.png" });
  });

  test("desktop: os filtros PRIMÁRIOS ficam visíveis sem clique", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);

    // Os cinco que respondem "que carro eu quero olhar" estão inline.
    for (const label of ["Marca", "Ano de", "Ano até", "Km até", "Estado geral"]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }

    // Os de RISCO ficam atrás de "Mais filtros" — o botão existe no desktop
    // também, e o painel começa fechado.
    await expect(page.getByTestId("dealer-sale-opportunity-filters-toggle")).toBeVisible();
    await expect(page.locator("#dealer-sale-filters-panel")).toBeHidden();
    await expect(page.getByLabel("Passagem por leilão")).toBeHidden();

    await page.getByTestId("dealer-sale-opportunity-filters-toggle").click();
    await expect(page.getByLabel("Passagem por leilão")).toBeVisible();
  });

  test("o shell atual é preservado: o menu não foi pintado nem duplicado", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("dealer-sale-opportunities-list")).toBeVisible();

    // Um só cabeçalho e uma só navegação principal — nada de shell paralelo.
    expect(await page.locator("aside").count()).toBeLessThanOrEqual(1);

    // A sidebar continua clara. Um fundo azul/escuro (o que os mockups sugeriam)
    // apareceria como um valor de luminância baixo aqui.
    const sidebarIsLight = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      if (!aside) return true;
      const background = getComputedStyle(aside).backgroundColor;
      const match = background.match(/\d+/g);
      if (!match) return true;
      const [r, g, b] = match.map(Number);
      // Luminância relativa aproximada; > 200 é seguramente um fundo claro.
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200;
    });
    expect(sidebarIsLight).toBe(true);
  });

  // ==========================================================================
  // DETALHE
  // ==========================================================================
  for (const viewport of VIEWPORTS) {
    test(`detalhe ${viewport.name}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);

      await page.goto(DETAIL_PATH);
      await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();
      await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();

      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: `test-results/dealer-sale-detail-${viewport.name}.png`,
        fullPage: false,
      });
    });
  }

  test("mobile: o painel de proposta fica ABAIXO da galeria, e o CTA é alcançável", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(DETAIL_PATH);

    await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible();

    const galleryTop = await page
      .getByTestId("dealer-detail-gallery")
      .evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    const panelTop = await page
      .getByTestId("dealer-offer-panel")
      .evaluate((node) => node.getBoundingClientRect().top + window.scrollY);

    // Ordem natural no celular: olhar o carro, ler a ficha, propor.
    expect(panelTop).toBeGreaterThan(galleryTop);

    // O CTA precisa ser alcançável — e o painel NÃO é sticky, então não pode
    // estar cobrindo a ficha.
    const cta = page.getByTestId("dealer-offer-submit");
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.screenshot({ path: "test-results/dealer-sale-detail-390-proposta.png" });
  });

  test("o detalhe mostra o VALOR líder e nunca a identidade de quem o fez", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(DETAIL_PATH);

    const panel = page.getByTestId("dealer-offer-panel");
    await expect(panel).toContainText("61.000,00");
    // `toContainText` e não `toHaveText`: o badge passou a carregar um glifo de
    // estado (✓/⚠) ao lado da frase, justamente para a posição não depender só
    // de cor. A asserção é sobre a MENSAGEM.
    await expect(page.getByTestId("dealer-offer-standing")).toContainText(
      "Existe uma proposta maior"
    );

    const detail = page.getByTestId("dealer-sale-opportunity-detail");
    const text = ((await detail.textContent()) ?? "").toLowerCase();

    for (const term of [
      "confidencial",
      "whatsapp",
      "telefone",
      "falar com",
      "margem",
      "lucro",
      "expira",
      "faltam",
      "avaliação presencial",
    ]) {
      expect(text, `termo proibido na tela de detalhe: ${term}`).not.toContain(term);
    }

    // A distância para a FIPE existe, e é rotulada como distância.
    await expect(page.getByTestId("dealer-offer-fipe-distance")).toContainText(
      "Distância para a referência FIPE"
    );
  });

  test("nenhum canal de contato direto na tela", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("dealer-sale-opportunity-card").first()).toBeVisible();

    const main = page.locator('[data-testid="dealer-sale-opportunities-list"]');
    const text = ((await main.textContent()) ?? "").toLowerCase();

    for (const term of ["whatsapp", "telefone", "falar com", "entrar em contato", "chat"]) {
      expect(text, `termo proibido na tela: ${term}`).not.toContain(term);
    }

    expect(await page.locator('a[href^="https://wa.me"]').count()).toBe(0);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });
});
