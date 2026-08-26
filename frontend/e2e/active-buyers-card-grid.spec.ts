import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/**
 * Prova VISUAL e GEOMÉTRICA de "Compradores ativos" (Fase 4.11C).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO PROVA — E O QUE NÃO PROVA
 * ────────────────────────────────────────────────────────────────────────────
 * PROVA: que a página real, dentro do shell real (`AccountPanelShell`), monta a
 * grade sem overflow horizontal em sete larguras, com a densidade certa em cada
 * uma, com os CTAs alinhados dentro da linha mesmo com títulos de alturas
 * diferentes, e sem nenhuma colisão de `id` de gradiente entre as ilustrações.
 *
 * NÃO PROVA: o backend. A resposta do BFF é interceptada e servida por uma
 * fixture — de propósito. O escopo territorial, os filtros, a ordenação e a
 * ausência de PII são provados onde moram, em
 * `tests/purchase-intents/purchase-intents-dealer-feed.test.js`, contra o router
 * real. Duplicar aquelas asserções aqui as tornaria dependentes de um banco e de
 * um seed, sem aumentar a cobertura.
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
 * segredo de DESENVOLVIMENTO, literal no código (`cnc-dev-session-secret`, em
 * `services/sessionService.ts`) quando `AUTH_SESSION_SECRET` não está definido e
 * `NODE_ENV !== "production"`.
 *
 * Não há credencial real envolvida, e o mesmo cookie é inútil em qualquer
 * ambiente com `AUTH_SESSION_SECRET` configurado.
 */

const DEV_SESSION_SECRET = "cnc-dev-session-secret";
const FEED_URL = "**/api/account/opportunities/purchase-intents*";
const PAGE_PATH = "/dashboard-loja/oportunidades/compradores";
const SHOTS = "../reports/screenshots/fase-4-11c";

function signedDealerSessionCookie(): string {
  const payload = {
    id: 20,
    name: "Loja Teste",
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
 * Nove procuras com os DOIS modos reais e títulos de comprimentos bem
 * diferentes.
 *
 * O comprimento é deliberado: "Fiat Argo" e
 * "Chevrolet Tracker Premier Turbo 1.0" ocupam alturas de título diferentes, e é
 * essa diferença que o teste de alinhamento de CTA precisa para significar
 * alguma coisa. Uma fixture com títulos do mesmo tamanho passaria mesmo sem
 * `mt-auto`.
 *
 * Há também uma linha com `max_price` zerado — a que exercita a frase neutra em
 * vez de "R$ 0" — e uma sem câmbio, que exercita a ausência da linha de
 * critérios.
 */
function buildFixture(total = 9) {
  const specific: Array<[string, string]> = [
    ["Volkswagen", "Gol"],
    ["Fiat", "Argo"],
    ["Chevrolet", "Tracker Premier Turbo 1.0"],
    ["Hyundai", "HB20"],
  ];
  const categories = ["suv", "hatch", "sedan", "picape", "minivan"];

  const items = Array.from({ length: total }, (_, index) => {
    const isSpecific = index % 2 === 0;
    const [brand, model] = specific[(index / 2) % specific.length | 0] ?? specific[0];

    return {
      id: index + 1,
      intent_type: isSpecific ? "specific_model" : "open_category",
      brand: isSpecific ? brand : null,
      model: isSpecific ? model : null,
      body_type: isSpecific ? null : categories[index % categories.length],
      // A linha 5 fica sem câmbio: exercita a linha de critérios AUSENTE.
      transmission: index === 5 ? null : ["automatico", "manual", "cvt"][index % 3],
      // A linha 7 fica sem orçamento: exercita "Sem orçamento definido".
      max_price: index === 7 ? "0.00" : `${40000 + index * 9000}.00`,
      purchase_timeframe: ["as_soon_as_possible", "within_7_days", "within_30_days"][index % 3],
      created_at: new Date(Date.now() - index * 86400000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    };
  });

  return {
    success: true,
    purchase_intents: items,
    next_cursor: null,
    limit: 20,
    sort: "recent",
    summary: { total: 27 },
  };
}

async function prepare(page: Page, body: unknown = buildFixture(), delayMs = 0) {
  await page.context().addCookies([
    {
      name: "cnc_session",
      value: signedDealerSessionCookie(),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.route(FEED_URL, async (route) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "private, no-store" },
      body: JSON.stringify(body),
    });
  });
}

/**
 * A medida que importa: `scrollWidth <= clientWidth + 1`.
 *
 * O `+1` absorve arredondamento subpixel — sem ele o teste ficaria intermitente
 * em larguras ímpares e acabaria desativado, que é o pior desfecho possível para
 * uma guarda de overflow.
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
 * Elas foram escolhidas contra a largura REAL da área de conteúdo, que não é a
 * do viewport: a partir de `lg` a barra lateral de 260px do `AccountPanelShell`
 * entra e come essa largura. Por isso 1024 fica em DUAS colunas enquanto 768,
 * mais estreito, também fica em duas — a 768 não há barra lateral.
 */
const VIEWPORTS = [
  { name: "360", width: 360, height: 800, columns: 1 },
  { name: "390", width: 390, height: 844, columns: 1 },
  { name: "412", width: 412, height: 915, columns: 1 },
  { name: "768", width: 768, height: 1024, columns: 2 },
  { name: "1024", width: 1024, height: 800, columns: 2 },
  { name: "1280", width: 1280, height: 900, columns: 3 },
  { name: "1440", width: 1440, height: 900, columns: 3 },
];

test.describe("@active-buyers grade de compradores ativos", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}px: sem overflow e ${viewport.columns} card(s) por linha`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepare(page);
      await page.goto(PAGE_PATH);

      await expect(page.getByTestId("dealer-opportunities-list")).toBeVisible();
      await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

      await expectNoHorizontalOverflow(page);

      // Conta quantos cards compartilham o MESMO topo — é a definição observável
      // de "cards na mesma linha", e não depende de ler classes do Tailwind.
      const perRow = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-testid="active-buyer-card"]')];
        if (cards.length === 0) return 0;
        const firstTop = Math.round(cards[0].getBoundingClientRect().top);
        return cards.filter((card) => Math.round(card.getBoundingClientRect().top) === firstTop)
          .length;
      });
      expect(perRow).toBe(viewport.columns);
    });
  }

  test("1440: os CTAs da mesma linha param na MESMA altura", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    const rows = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="active-buyer-card"]')];
      const byRow = new Map<number, number[]>();

      for (const card of cards) {
        const top = Math.round(card.getBoundingClientRect().top);
        const cta = card.querySelector('[data-testid="active-buyer-cta"]');
        if (!cta) continue;
        const bottom = Math.round(cta.getBoundingClientRect().bottom);
        byRow.set(top, [...(byRow.get(top) ?? []), bottom]);
      }
      return [...byRow.values()];
    });

    expect(rows.length).toBeGreaterThan(1);
    for (const bottoms of rows) {
      /*
        GATE GEOMÉTRICO.

        A fixture mistura "Fiat Argo" com "Chevrolet Tracker Premier Turbo 1.0" e
        inclui uma procura sem linha de critérios — três alturas de conteúdo
        diferentes na mesma linha. Sem `mt-auto` no CTA, os botões parariam em
        alturas distintas e a linha viraria uma escada.

        A tolerância de 1px é subpixel, não folga de layout.
      */
      expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
    }
  });

  test("os títulos NÃO são truncados: o modelo decide a abordagem", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    const longest = page.getByText("Chevrolet Tracker Premier Turbo 1.0").first();
    await expect(longest).toBeVisible();

    const clipped = await longest.evaluate(
      (node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
    );
    expect(clipped).toBe(false);
  });
});

test.describe("@active-buyers a figura é ilustração, e não colide consigo mesma", () => {
  test("nenhum `id` repetido, mesmo com nove ilustrações na página", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    const report = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
      const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
      return { total: ids.length, duplicated: [...new Set(duplicated)] };
    });

    /*
      No DOM REAL, e não só no jsdom: `url(#…)` é resolvido pelo navegador pela
      PRIMEIRA ocorrência do id, e o sintoma de uma colisão (todas as lupas
      pintando com o gradiente da primeira) não gera nenhum aviso no console.
    */
    expect(report.total).toBeGreaterThan(0);
    expect(report.duplicated).toEqual([]);
  });

  test("nenhuma fotografia: zero <img> e zero requisição de imagem", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);

    const imageRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image") imageRequests.push(request.url());
    });

    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    const imgCount = await page
      .locator('[data-testid="active-buyer-card"] img, [data-testid="active-buyer-card"] image')
      .count();
    expect(imgCount).toBe(0);

    // O logo do cabeçalho é do shell, não do card. O que não pode existir é
    // requisição de imagem DISPARADA por um card de procura.
    expect(imageRequests.filter((url) => /veiculo|vehicle|ads?\/|r2\.dev/i.test(url))).toEqual([]);
  });
});

test.describe("@active-buyers filtros, contagem e estados", () => {
  test("desktop: os filtros primários ficam visíveis sem clique", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-filters")).toBeVisible();

    await expect(page.getByLabel("Tipo de procura")).toBeVisible();
    await expect(page.getByLabel("Marca")).toBeVisible();
    await expect(page.getByLabel("Carroceria")).toBeVisible();
    await expect(page.getByLabel("Câmbio")).toBeVisible();
    await expect(page.getByLabel("Ordenar por")).toBeVisible();

    // A cidade é ETIQUETA, não seletor: o backend não aceita cidade do cliente.
    await expect(page.getByTestId("active-buyer-city-scope")).toHaveText(/Atibaia - SP/);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/08-buyers-filters.png`, fullPage: false });
  });

  test("mobile: os filtros ficam atrás de um botão, não empilhados no topo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-filters")).toBeVisible();

    // Seis selects empilhados empurrariam o primeiro card para fora da tela.
    await expect(page.getByLabel("Tipo de procura")).toBeHidden();
    await expect(page.getByTestId("active-buyer-filters-toggle")).toBeVisible();

    await page.getByTestId("active-buyer-filters-toggle").click();
    await expect(page.getByLabel("Tipo de procura")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("o filtro vai ao SERVIDOR: a query string carrega o valor escolhido", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);

    const requested: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/account/opportunities/purchase-intents")) {
        requested.push(request.url());
      }
    });

    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    await page.getByLabel("Câmbio").selectOption("manual");
    await expect
      .poll(() => requested.some((url) => url.includes("transmission=manual")))
      .toBe(true);

    await page.getByLabel("Ordenar por").selectOption("budget_desc");
    await expect.poll(() => requested.some((url) => url.includes("sort=budget_desc"))).toBe(true);

    // "Limpar filtros" refaz a busca SEM nenhum filtro na URL.
    await page.getByTestId("active-buyer-clear-filters").click();
    await expect
      .poll(() => {
        const last = requested[requested.length - 1] ?? "";
        return last.includes("transmission=") || last.includes("intent_type=");
      })
      .toBe(false);
  });

  test("a contagem do cabeçalho é a do SERVIDOR, não a da página", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);

    // Nove cards na tela; vinte e sete na cidade.
    await expect(page.getByTestId("active-buyer-total")).toHaveText("27 oportunidades ativas");
    await expect(page.getByTestId("active-buyer-card")).toHaveCount(9);
  });

  test("vazio: estado próprio, sem grade e sem '0 oportunidades'", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, {
      success: true,
      purchase_intents: [],
      next_cursor: null,
      limit: 20,
      sort: "recent",
      summary: { total: 0 },
    });
    await page.goto(PAGE_PATH);

    await expect(page.getByTestId("dealer-opportunities-empty")).toBeVisible();
    await expect(page.getByTestId("active-buyer-grid")).toHaveCount(0);
    await expect(page.getByTestId("active-buyer-total")).toHaveCount(0);
    await expect(page.getByTestId("dealer-opportunities-error")).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/09-buyers-empty.png`, fullPage: false });
  });

  test("erro NÃO vira '0 resultados'", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: "cnc_session", value: signedDealerSessionCookie(), domain: "127.0.0.1", path: "/" },
    ]);
    await page.route(FEED_URL, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Serviço indisponível." }),
      });
    });

    await page.goto(PAGE_PATH);

    const box = page.getByTestId("dealer-opportunities-error");
    await expect(box).toBeVisible();
    await expect(box).toContainText("Não foi possível carregar as oportunidades");
    // Uma falha de rede lida como "a cidade está parada" faria o lojista
    // desistir do produto por um motivo que não existe.
    await expect(page.getByTestId("dealer-opportunities-empty")).toHaveCount(0);
    await expect(page.getByTestId("active-buyer-total")).toHaveCount(0);
  });

  test("carregando: esqueleto do MESMO tamanho do card, sem salto de layout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, buildFixture(), 1500);

    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-loading")).toBeVisible();

    const skeleton = await page.getByTestId("active-buyer-skeleton").first().boundingBox();
    await page.screenshot({ path: `${SHOTS}/10-buyers-loading.png`, fullPage: false });

    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();
    const card = await page.getByTestId("active-buyer-card").first().boundingBox();

    /*
      O esqueleto tem a MESMA largura e praticamente a mesma altura do card real.

      A tolerância de 8px é subpixel de arredondamento de linha, não folga de
      layout: o primeiro card da fixture é "Volkswagen Gol", um título de UMA
      linha, que é o caso que o esqueleto representa.

      Este gate já pegou um defeito real: a primeira versão errava 51px, porque a
      figura do esqueleto estava fixa em 104px enquanto a real segue a proporção
      do `viewBox`, e porque faltava o `pt-4` que separa o CTA da meta.
    */
    expect(skeleton).not.toBeNull();
    expect(card).not.toBeNull();
    expect(Math.abs((skeleton?.width ?? 0) - (card?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((skeleton?.height ?? 0) - (card?.height ?? 0))).toBeLessThanOrEqual(8);
  });
});

test.describe("@active-buyers o shell e a fase anterior seguem intactos", () => {
  test("a barra lateral e o cabeçalho global continuam montados", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    // Esta é tela de NAVEGAÇÃO, não de foco: tirar o menu deixaria o lojista sem
    // saída. `lib/account/focus-routes.ts` distingue as duas por caminho.
    await expect(page.locator("aside").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Oportunidades/ }).first()).toBeVisible();
  });

  test("nenhum canal de contato direto na tela", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();

    const text = (await page.getByTestId("dealer-opportunities-list").innerText()).toLowerCase();
    for (const forbidden of ["whatsapp", "telefone", "e-mail", "chat", "agendar", "ligar"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

/**
 * As capturas do relatório.
 *
 * Ficam num teste próprio, e não espalhadas pelos outros, para que uma mudança
 * de asserção não apague um arquivo que o relatório referencia.
 */
test.describe("@active-buyers capturas do relatório", () => {
  test("desktop, tablet e mobile", async ({ page }) => {
    await prepare(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-buyers-desktop-1440.png`, fullPage: false });
    await page.screenshot({ path: `${SHOTS}/02-buyers-desktop-grid.png`, fullPage: true });

    // Um card de cada modo, recortado do grid real — nada de composição à parte.
    const specific = page.getByTestId("active-buyer-card").first();
    await specific.screenshot({ path: `${SHOTS}/03-buyers-specific-card.png` });

    const category = page
      .locator('[data-testid="active-buyer-card"]')
      .filter({ has: page.locator('[data-intent-type="open_category"]') })
      .first();
    await category.screenshot({ path: `${SHOTS}/04-buyers-category-card.png` });

    // A procura SEM orçamento declarado: a frase neutra no lugar de "R$ 0".
    const noBudget = page
      .locator('[data-testid="active-buyer-card"]')
      .filter({ hasText: "Sem orçamento definido" })
      .first();
    await expect(noBudget).toBeVisible();
    await noBudget.screenshot({ path: `${SHOTS}/05-buyers-budget-card.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-buyers-mobile-390.png`, fullPage: false });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(PAGE_PATH);
    await expect(page.getByTestId("active-buyer-card").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/07-buyers-tablet-768.png`, fullPage: false });
  });
});
