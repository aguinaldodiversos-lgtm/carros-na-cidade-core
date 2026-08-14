import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ensureDevServerUp, getBackendApiBaseUrl } from "./helpers";

/**
 * `/comprar` é o CATÁLOGO NACIONAL — E2E do hotfix 2026-08-13.
 *
 * ── O defeito que este arquivo precisa detectar ──────────────────────────────
 * A rota respondia HTTP 200 renderizando apenas dois blocos de links:
 *
 *     Estados com anúncios ativos  →  São Paulo
 *     Cidades com anúncios ativos  →  Atibaia
 *
 * Nenhum veículo, com 28 anúncios ativos no banco. Um teste que só checasse
 * "status 200" ou "tem canonical" passaria nesse estado — foi o que aconteceu.
 * Por isso as asserções aqui são sobre CARROS NA TELA: busca visível, contagem,
 * card de veículo com link para `/veiculo/[slug]`. Se a página voltar a ser só
 * diretório, estes testes caem.
 *
 * ── Ambiente ─────────────────────────────────────────────────────────────────
 * Precisa do Next em pé (`npm run dev`) e de um backend respondendo
 * `/api/ads/search`. Quando o backend responde mas o seed está vazio, as
 * asserções de CARD são puladas explicitamente — um seed vazio é uma condição
 * de ambiente, não uma regressão; o que NUNCA é pulado é a identidade nacional
 * da rota (H1, busca, filtros) e a ausência de recorte territorial.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** Viewports obrigatórios do briefing — todos passam pela checagem de overflow. */
const VIEWPORTS = [
  { name: "360×640", width: 360, height: 640 },
  { name: "390×844 (referência mobile)", width: 390, height: 844 },
  { name: "412×915", width: 412, height: 915 },
  { name: "768×1024", width: 768, height: 1024 },
  { name: "1440×900", width: 1440, height: 900 },
];

async function countVehicleCards(page: Page): Promise<number> {
  return page.locator('a[href^="/veiculo/"]').count();
}

/**
 * Há estoque público neste ambiente? Pergunta ao BACKEND, nunca à página.
 *
 * Essa distinção é o teste do teste. Na primeira versão, o `skip` olhava para os
 * cards da própria página: rodando contra a versão defeituosa (o diretório sem
 * veículos), "zero cards" era lido como "seed vazio" e três casos PULARAM em vez
 * de falhar — o guard de regressão passava exatamente no estado que ele existe
 * para detectar. Perguntando ao backend, "seed vazio" e "página quebrada" viram
 * duas respostas diferentes: a primeira pula, a segunda falha.
 */
async function backendHasActiveAds(request: APIRequestContext): Promise<boolean> {
  const apiBase = getBackendApiBaseUrl();
  const res = await request
    .get(`${apiBase}/api/ads/search?limit=5&sort=recent`, { timeout: 60_000 })
    .catch(() => null);
  if (!res?.ok()) return false;

  const json = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
  return Array.isArray(json?.data) && json.data.length > 0;
}

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("@comprar-nacional /comprar é catálogo, não diretório", () => {
  test("desktop: H1 nacional, busca, filtros e cards de veículo", async ({ page, request }) => {
    const hasStock = await backendHasActiveAds(request);
    await page.setViewportSize(DESKTOP);
    const response = await page.goto("/comprar", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    expect(response?.status(), "GET /comprar").toBe(200);

    // 1. Identidade nacional — um H1 só, e é o do catálogo.
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/Carros usados/i);
    await expect(h1).toContainText(/Brasil/i);
    // O H1 NÃO pode virar o de uma cidade só porque o estoque está concentrado.
    await expect(h1).not.toContainText(/Atibaia/i);

    // 2. Busca do catálogo, com escopo nacional no placeholder.
    const search = page.getByLabel("Buscar no catálogo");
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("placeholder", /Brasil/i);

    // 3. Filtros do catálogo (sidebar desktop).
    await expect(page.locator("#fs-state")).toBeVisible();

    // 4. Cards reais. O defeito era exatamente a ausência deles.
    test.skip(!hasStock, "Backend sem anúncios ativos — nada a listar neste ambiente.");
    expect(await countVehicleCards(page), "/comprar precisa listar veículos").toBeGreaterThan(0);

    const firstCard = page.locator('a[href^="/veiculo/"]').first();
    const href = await firstCard.getAttribute("href");
    expect(href, "card deve apontar para /veiculo/[slug]").toMatch(/^\/veiculo\/.+/);
  });

  test("os cards vêm do SSR (existem no HTML inicial, sem hidratação)", async ({ request }) => {
    // Pedido cru, sem JS: se os veículos só aparecessem depois da hidratação, o
    // crawler — e o primeiro paint no celular — continuariam vendo um diretório.
    const res = await request.get("/comprar", { timeout: 60_000 });
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).toMatch(/Carros usados/i);

    test.skip(!(await backendHasActiveAds(request)), "Backend sem anúncios ativos neste ambiente.");
    expect(
      /href="\/veiculo\//.test(html),
      "o HTML inicial precisa conter link de veículo"
    ).toBe(true);
  });

  test("nenhum recorte territorial: sem redirect, sem UF/cidade na URL", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/comprar", { waitUntil: "domcontentloaded", timeout: 60_000 });

    // A URL final continua /comprar: nada de 302 para estado/cidade.
    expect(new URL(page.url()).pathname).toBe("/comprar");
    expect(page.url()).not.toContain("city_slug");
    expect(page.url()).not.toContain("state=");

    // Canonical autorreferente na URL limpa.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/comprar$/);

    // O select de Estado abre em "todos" — a página não pré-selecionou UF.
    await expect(page.locator("#fs-state")).toHaveValue("");
  });

  test("o diretório territorial continua, mas DEPOIS dos veículos", async ({ page, request }) => {
    test.skip(!(await backendHasActiveAds(request)), "Backend sem anúncios ativos neste ambiente.");

    await page.setViewportSize(DESKTOP);
    await page.goto("/comprar", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const directory = page.getByTestId("national-territory-directory");
    const visible = await directory.isVisible().catch(() => false);
    test.skip(!visible, "Conjunto público de cidades indisponível neste ambiente.");

    expect(await countVehicleCards(page), "sem cards não há o que comparar").toBeGreaterThan(0);

    const cardBox = await page.locator('a[href^="/veiculo/"]').first().boundingBox();
    const directoryBox = await directory.boundingBox();
    expect(directoryBox!.y, "o diretório não pode vir acima dos carros").toBeGreaterThan(
      cardBox!.y
    );
  });

  test("busca e filtro funcionam nacionalmente, sem injetar território", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/comprar?brand=Honda", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    expect(new URL(page.url()).pathname, "filtro não pode mudar a rota").toBe("/comprar");
    await expect(page.locator("h1")).toContainText(/Brasil/i);

    // Filtro desindexa por política central, mas a canonical volta para a limpa.
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/comprar$/);
  });
});

test.describe("@comprar-nacional mobile", () => {
  test("390×844: carros sem clique territorial prévio", async ({ page, request }) => {
    const hasStock = await backendHasActiveAds(request);
    await page.setViewportSize(MOBILE);
    const response = await page.goto("/comprar", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);

    // O fluxo que o defeito quebrava: tocar em "Comprar" e ver carros.
    await expect(page.locator("h1")).toContainText(/Brasil/i);
    await expect(page.getByLabel("Buscar no catálogo")).toBeVisible();

    // Barra de ações mobile — "Filtrar" abre a gaveta de filtros.
    const filterButton = page.getByRole("button", { name: /Filtrar/i }).first();
    await expect(filterButton).toBeVisible();

    test.skip(!hasStock, "Backend sem anúncios ativos — nada a listar neste ambiente.");
    expect(
      await countVehicleCards(page),
      "no mobile os carros precisam aparecer sem passar por estado/cidade"
    ).toBeGreaterThan(0);

    // Nenhum passo territorial obrigatório antes do primeiro card.
    await expect(page.locator('a[href^="/veiculo/"]').first()).toBeVisible();
  });

  test("390×844: a bottom nav não cobre o último card nem a paginação", async ({
    page,
    request,
  }) => {
    test.skip(!(await backendHasActiveAds(request)), "Backend sem anúncios ativos neste ambiente.");

    await page.setViewportSize(MOBILE);
    await page.goto("/comprar", { waitUntil: "domcontentloaded", timeout: 60_000 });

    expect(await countVehicleCards(page), "sem cards não há o que medir").toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // O shell reserva padding inferior (pb-20) para a bottom nav fixed; o
    // wrapper pós-catálogo replica o mesmo padding. Se alguém remover um dos
    // dois, o fim da página passa a ficar embaixo da barra.
    const overlapped = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação principal"]');
      if (!nav) return false;
      const navTop = nav.getBoundingClientRect().top;
      const last = Array.from(document.querySelectorAll('a[href^="/veiculo/"]')).pop();
      if (!last) return false;
      const box = last.getBoundingClientRect();
      // Só conta como sobreposição se o card está na viewport E cruzando a nav.
      return box.bottom > navTop && box.top < navTop && box.top >= 0;
    });

    expect(overlapped, "a bottom nav está cobrindo o último card").toBe(false);
  });
});

test.describe("@comprar-nacional responsividade", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: sem overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/comprar", { waitUntil: "domcontentloaded", timeout: 60_000 });

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // 1px de folga para arredondamento de layout.
      expect(
        overflow.scrollWidth,
        `overflow horizontal em ${overflow.clientWidth}px`
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});
