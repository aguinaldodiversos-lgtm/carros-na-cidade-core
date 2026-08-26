import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/**
 * O HUB de oportunidades do lojista — composição no navegador de verdade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA — E O QUE NÃO PROVA
 * ════════════════════════════════════════════════════════════════════════════
 * PROVA: que a tela real, dentro do shell real, mantém o menu lateral, mostra os
 * quatro números que o resumo devolveu, coloca os dois caminhos lado a lado no
 * desktop e empilhados no celular, e que os dois botões levam às duas listas.
 *
 * PROVA TAMBÉM a regra que nenhum teste de unidade pega: quando o resumo vem
 * SEM base de comparação (`trend: null`), a tela não desenha etiqueta verde
 * nenhuma. É a diferença entre "não sabemos" e "0%".
 *
 * NÃO PROVA o backend: o resumo é interceptado por fixture. As contagens e o
 * escopo por cidade são provados contra o router real em
 * `tests/dealers/dealer-opportunities-summary.test.js`.
 */

const DEV_SESSION_SECRET = "cnc-dev-session-secret";
const SUMMARY_URL = "**/api/account/opportunities/summary*";
const HUB_PATH = "/dashboard-loja/oportunidades";
const SHOTS = "../reports/screenshots/fase-4-11b";

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

/** Os números da referência visual — reconhecíveis nas capturas. */
function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    summary: {
      active_buyers: { total: 128, trend: { percent: 18, direction: "up" } },
      sale_requests: { total: 76, trend: { percent: 12, direction: "up" } },
      new_today: { total: 34, trend: { percent: 9, direction: "up" } },
      deals_in_progress: { total: 22, trend: { percent: 5, direction: "up" } },
      ...overrides,
    },
  };
}

async function prepare(page: Page, summaryOverrides: Record<string, unknown> = {}) {
  await page.context().addCookies([
    { name: "cnc_session", value: signedDealerSessionCookie(), domain: "127.0.0.1", path: "/" },
  ]);

  await page.route(SUMMARY_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(buildSummary(summaryOverrides)),
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

function boxOf(page: Page, testId: string) {
  return page.getByTestId(testId).first().boundingBox();
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("@dealer-hub desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("mantém o painel: menu lateral e cabeçalho global continuam na tela", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-opportunities-hub")).toBeVisible();

    /*
      O CONTRASTE COM A 4.11A É O PONTO.

      O detalhe de um veículo entra em modo foco e não monta o `<aside>`. Este
      hub é tela de NAVEGAÇÃO: tirar o menu daqui deixaria o lojista sem saída.
      A fronteira entre os dois vive em `lib/account/focus-routes.ts`, e esta
      asserção é o lado "continua com barra" dela — no navegador, não em jsdom.
    */
    await expect(page.locator("aside")).toHaveCount(1);
    await expect(page.getByText("Meu plano")).toBeVisible();
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("os quatro números do resumo aparecem com a variação de 7 dias", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);

    const strip = page.getByTestId("dealer-hub-metrics");
    await expect(strip).toBeVisible();

    await expect(page.getByTestId("dealer-hub-metric-buyers")).toContainText("128");
    await expect(page.getByTestId("dealer-hub-metric-vehicles")).toContainText("76");
    await expect(page.getByTestId("dealer-hub-metric-new-today")).toContainText("34");
    await expect(page.getByTestId("dealer-hub-metric-deals")).toContainText("22");

    /*
      §5 — A TENDÊNCIA DIZ QUE MEDE FLUXO.

      "128 / +18% nos últimos 7 dias" se lia como "há 18% mais compradores
      ativos do que há 7 dias". Falso: 128 é o ESTOQUE atual e os 18% comparam
      quantas procuras ENTRARAM na janela contra a janela anterior.
    */
    await expect(page.getByTestId("dealer-hub-metric-buyers")).toContainText(
      "+18% novas entradas"
    );
    await expect(page.getByTestId("dealer-hub-metric-vehicles")).toContainText(
      "+12% novas entradas"
    );
    // §8 — o cartão diário declara a janela, porque número e tendência divergem.
    await expect(page.getByTestId("dealer-hub-metric-new-today")).toContainText(
      "+9% novas entradas em 7 dias"
    );
    // §9 — o que entra em compras são COMPRAS.
    await expect(page.getByTestId("dealer-hub-metric-deals")).toContainText(
      "+5% novas compras"
    );
    await expect(strip).not.toContainText("nos últimos 7 dias");

    // Quatro cartões numa linha só em 1440 — é a faixa da referência.
    const tops = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid^="dealer-hub-metric-"]')];
      return cards.map((card) => Math.round(card.getBoundingClientRect().top));
    });
    expect(new Set(tops).size, `cartões em ${new Set(tops).size} linha(s)`).toBe(1);

    /*
      §16 — A RÉGUA DOS NÚMEROS RESISTE À COPY NOVA.

      "novas entradas em 7 dias" é o rótulo mais longo dos quatro e quebra em
      duas linhas na largura de quatro colunas. A quebra é aceita: o §8 pede a
      janela declarada nesse cartão, e ela vale mais que uma linha economizada.

      O que NÃO pode ceder é a altura dos quatro números — é ela que faz a faixa
      ser lida de relance, e uma quebra abaixo do número não a afeta. Esta
      asserção é a prova de que a troca de texto não empurrou nada: sem ela, o
      próximo rótulo mais longo poderia desalinhar a régua sem que ninguém visse.
    */
    const numberTops = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid^="dealer-hub-metric-"]')];
      return cards.map((card) => {
        // O número é o único elemento com `tabular-nums` dentro do cartão.
        const value = card.querySelector<HTMLElement>(".tabular-nums")!;
        return Math.round(value.getBoundingClientRect().top);
      });
    });
    expect(
      new Set(numberTops).size,
      `números em ${new Set(numberTops).size} alturas diferentes: ${numberTops.join(", ")}`
    ).toBe(1);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/01-hub-desktop-1440.png` });
  });

  /**
   * §2 e §10 — as duas correções de semântica, no render real.
   *
   * Componente e teste de copy já as travam isoladamente. Aqui prova-se que a
   * PÁGINA MONTADA não traz nenhuma das duas redações antigas por outro caminho
   * — um texto herdado do shell, uma sobra de outro componente, qualquer coisa
   * que uma asserção por `data-testid` não veria.
   */
  test("§2/§10 — 'Compras em andamento' e 'sua cidade', sem os termos antigos", async ({
    page,
  }) => {
    await prepare(page);
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

    await expect(page.getByTestId("dealer-hub-metric-deals")).toContainText(
      "Compras em andamento"
    );
    await expect(page.getByTestId("dealer-hub-card-buyers")).toContainText(
      "Receba demandas reais da sua cidade"
    );

    // A varredura é no texto VISÍVEL da página inteira.
    const visible = await page.locator("main").innerText();
    for (const term of [
      "Negócios em andamento",
      "Negociações em andamento",
      "Vendas em andamento",
      "sua região",
      "da região",
    ]) {
      expect(visible, `redação antiga na tela: ${term}`).not.toContain(term);
    }
  });

  test("os dois caminhos ficam lado a lado, com botões alinhados", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);

    /*
      Esperar a faixa ASSENTAR antes de medir.

      As duas medidas abaixo são sequenciais, e o resumo chega por fetch: sem
      esta espera, a primeira pode ser lida com o esqueleto na tela e a segunda
      já com os números — as duas alturas viriam de layouts diferentes, e o teste
      falharia por corrida, não por defeito.

      (O esqueleto tem a mesma altura do cartão cheio de propósito, justamente
      para que a troca não desloque nada. A espera é o cinto de segurança.)
    */
    await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

    const buyers = (await boxOf(page, "dealer-hub-card-buyers"))!;
    const vehicles = (await boxOf(page, "dealer-hub-card-vehicles"))!;

    // Lado a lado, não empilhados.
    expect(vehicles.x).toBeGreaterThan(buyers.x + buyers.width - 1);
    expect(Math.abs(vehicles.y - buyers.y)).toBeLessThan(2);
    // Mesma largura: são duas escolhas equivalentes, e uma maior sugeriria
    // preferência da plataforma por um dos caminhos.
    expect(Math.abs(vehicles.width - buyers.width)).toBeLessThan(2);

    /*
      Os DOIS CTAs na mesma altura. É o que o `mt-auto` do rodapé do cartão
      garante — sem ele, um texto uma linha mais longo do que o outro deixa o
      par visivelmente torto, e nenhum teste de presença veria isso.
    */
    const ctaBuyers = (await boxOf(page, "dealer-opportunities-buyers-link"))!;
    const ctaVehicles = (await boxOf(page, "dealer-opportunities-vehicles-link"))!;
    expect(Math.abs(ctaVehicles.y - ctaBuyers.y)).toBeLessThan(2);

    await page.screenshot({ path: `${SHOTS}/02-hub-desktop-cards.png` });
  });

  test("as duas ilustrações pintam com as próprias cores", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-card-vehicles")).toBeVisible();

    /*
      A ARMADILHA QUE ISTO TRANCA: `id` de gradiente em SVG é global ao
      DOCUMENTO. Se as duas ilustrações usassem o mesmo id, a segunda pintaria
      com o gradiente da primeira — o carro verde sairia azul, sem nenhum erro no
      console e sem nenhum teste de presença acusando.

      A prova é contar ids ÚNICOS: se algum se repetisse entre as duas figuras, o
      total de `<linearGradient>` no documento seria maior que o de ids distintos.
    */
    const gradients = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("svg linearGradient, svg radialGradient")];
      const ids = nodes.map((node) => node.id).filter(Boolean);
      return { count: ids.length, unique: new Set(ids).size };
    });

    expect(gradients.count).toBeGreaterThan(4);
    expect(gradients.unique, "ids de gradiente colidindo entre as ilustrações").toBe(
      gradients.count
    );
  });

  test("os dois botões levam às duas listas", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);

    await expect(page.getByTestId("dealer-opportunities-buyers-link")).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/compradores"
    );
    await expect(page.getByTestId("dealer-opportunities-vehicles-link")).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/veiculos"
    );

    // "Como funciona" leva a um lugar que EXISTE — a seção da própria página.
    await page.getByRole("link", { name: "Como funciona" }).first().click();
    await expect(page.getByTestId("dealer-hub-how-it-works")).toBeInViewport();
  });

  test("os dois fluxos de 'Como funciona' têm três passos cada", async ({ page }) => {
    await prepare(page);
    await page.goto(HUB_PATH);

    const flows = page.getByTestId("dealer-hub-how-flow");
    await expect(flows).toHaveCount(2);

    await expect(flows.nth(0)).toContainText("Ver intenção de compra");
    await expect(flows.nth(0)).toContainText("Ofertar veículo do estoque");
    await expect(flows.nth(0)).toContainText("Aguardar resposta");

    await expect(flows.nth(1)).toContainText("Analisar veículo");
    await expect(flows.nth(1)).toContainText("Enviar oferta");
    await expect(flows.nth(1)).toContainText("Negociar compra");

    // Duas setas por fluxo — entre os passos, nunca depois do último.
    await expect(page.getByTestId("dealer-hub-step-arrow")).toHaveCount(4);

    await page.getByTestId("dealer-hub-how-it-works").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-hub-desktop-how-it-works.png` });
  });

  test("sem base de comparação NÃO existe etiqueta verde", async ({ page }) => {
    await prepare(page, {
      active_buyers: { total: 1, trend: null },
      sale_requests: { total: 0, trend: null },
      new_today: { total: 0, trend: null },
      deals_in_progress: { total: 0, trend: null },
    });
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

    const strip = page.getByTestId("dealer-hub-metrics");
    await expect(strip).toContainText("sem base de comparação");
    // Nem percentual, nem "0%", nem seta — nenhuma afirmação sobre tendência.
    await expect(strip).not.toContainText("%");
    await expect(strip).not.toContainText("▲");

    await page.screenshot({ path: `${SHOTS}/06-hub-sem-base-comparacao.png` });
  });

  test("resumo indisponível some com a faixa em vez de mostrar zero", async ({ page }) => {
    await page.context().addCookies([
      { name: "cnc_session", value: signedDealerSessionCookie(), domain: "127.0.0.1", path: "/" },
    ]);
    await page.route(SUMMARY_URL, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "indisponível" }),
      })
    );

    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-metrics-error")).toBeVisible();

    /*
      Zero seria PIOR que ausência: o lojista leria "não há compradores na minha
      cidade" e fecharia a tela. A faixa some, os dois caminhos continuam.
    */
    await expect(page.getByTestId("dealer-hub-metrics")).toHaveCount(0);
    await expect(page.getByTestId("dealer-hub-card-buyers")).toBeVisible();
    await expect(page.getByTestId("dealer-hub-card-vehicles")).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("@dealer-hub responsivo", () => {
  const VIEWPORTS = [
    { name: "360", width: 360, height: 800 },
    { name: "390", width: 390, height: 844 },
    { name: "412", width: 412, height: 915 },
    { name: "768", width: 768, height: 1024 },
    { name: "1024", width: 1024, height: 800 },
    { name: "1280", width: 1280, height: 900 },
    { name: "1440", width: 1440, height: 900 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}px: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);
      await page.goto(HUB_PATH);
      await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

      await expectNoHorizontalOverflow(page);

      // O CTA precisa caber INTEIRO: um botão que estoura a coluna some do
      // `scrollWidth` do documento se algum pai tiver `overflow`.
      const cta = (await boxOf(page, "dealer-opportunities-vehicles-link"))!;
      expect(cta.x).toBeGreaterThanOrEqual(-1);
      expect(cta.x + cta.width).toBeLessThanOrEqual(viewport.width + 1);
    });
  }

  test("390px: métricas empilhadas e caminhos em blocos verticais", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

    // Um cartão de métrica por linha.
    const tops = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid^="dealer-hub-metric-"]')];
      return cards.map((card) => Math.round(card.getBoundingClientRect().top));
    });
    expect(new Set(tops).size).toBe(4);

    // Os dois caminhos, um sob o outro e na ordem do DOM.
    const buyers = (await boxOf(page, "dealer-hub-card-buyers"))!;
    const vehicles = (await boxOf(page, "dealer-hub-card-vehicles"))!;
    expect(vehicles.y).toBeGreaterThan(buyers.y + buyers.height - 1);

    // §15 — as mesmas garantias semânticas do desktop valem no celular. Os
    // rótulos são os que mais mudam de forma aqui (uma coluna, texto inteiro),
    // e é a largura em que uma quebra ruim passaria despercebida no desktop.
    await expect(page.getByTestId("dealer-hub-metric-deals")).toContainText(
      "Compras em andamento"
    );
    await expect(page.getByTestId("dealer-hub-metric-deals")).toContainText(
      "+5% novas compras"
    );
    const visible = await page.locator("main").innerText();
    expect(visible).not.toContain("Negócios em andamento");
    expect(visible).not.toContain("sua região");
    expect(visible).toContain("Receba demandas reais da sua cidade");

    await page.screenshot({ path: `${SHOTS}/04-hub-mobile-390.png` });
  });

  test("768px: tablet em duas colunas de métrica, sem quebra", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await prepare(page);
    await page.goto(HUB_PATH);
    await expect(page.getByTestId("dealer-hub-metrics")).toBeVisible();

    const tops = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid^="dealer-hub-metric-"]')];
      return cards.map((card) => Math.round(card.getBoundingClientRect().top));
    });
    // 4 cartões em 2 linhas de 2.
    expect(new Set(tops).size).toBe(2);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/05-hub-tablet-768.png` });
  });
});
