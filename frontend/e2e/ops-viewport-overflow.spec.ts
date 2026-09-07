import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  ensureBackendApiReachable,
  ensureDevServerUp,
  getBackendApiBaseUrl,
  loginAsLocalUser,
} from "./helpers";

/**
 * Homologação pré-lançamento — GRUPO J (OPS-01, OPS-03, OPS-05, OPS-06).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO É DUPLICAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Já existem checagens de overflow no repositório, mas todas presas a UMA
 * superfície e a UMA lista de larguras própria:
 *
 *   comprar-national-catalog.spec.ts   → só /comprar,            5 larguras
 *   catalog-city-clean-grid.spec.ts    → só /carros-em/[cidade], grid da 5.0B
 *   dealer-*-visual.spec.ts            → só telas de lojista
 *   active-buyers-card-grid.spec.ts    → só o hub de compradores
 *
 * Nenhuma cobre a home, a página de veículo, o login, o painel, o simulador ou
 * a FIPE — e nenhuma usa as SETE larguras que a homologação pede
 * (375/768/1024/1280/1440/1600/1920). As duas maiores importam de verdade: o
 * shell largo do catálogo tem teto de 1600px e sidebar fixa de 296px, então
 * 1600 e 1920 são exatamente onde uma régua errada aparece.
 *
 * Este arquivo é a MATRIZ transversal: mesma medição, todas as páginas
 * públicas críticas, todas as larguras. As suítes acima continuam donas das
 * suas asserções específicas (nº de colunas, ordem dos blocos); aqui só se
 * pergunta "estourou?".
 *
 * IDs cobertos:
 *   OPS-01  zero overflow horizontal nos 7 breakpoints × 8 páginas
 *   OPS-03  home não emite erro de console (hero/carrossel)
 *   OPS-05  CTAs críticos têm nome acessível
 *   OPS-06  nenhuma tela mostra stack trace ao usuário
 *
 * OPS-02 (CLS) e OPS-04 (navegação por teclado) NÃO estão aqui — ver o
 * relatório da homologação: CLS medido em dev server mede o HMR, não o
 * produto, e teclado no wizard exige sessão + FIPE viva (fica como lacuna
 * declarada, não como falso verde).
 */

/** As sete larguras do briefing. Altura fixa: o eixo medido é o horizontal. */
const LARGURAS = [375, 768, 1024, 1280, 1440, 1600, 1920] as const;

type Alvo = { nome: string; path: string; autenticado?: boolean };

/** Páginas públicas. A de veículo e a do painel são resolvidas em runtime. */
const ALVOS_PUBLICOS: Alvo[] = [
  { nome: "home", path: "/" },
  { nome: "comprar", path: "/comprar" },
  { nome: "cidade", path: "/carros-em/atibaia-sp" },
  { nome: "login", path: "/login" },
  { nome: "simulador", path: "/simulador-financiamento/atibaia-sp" },
  { nome: "fipe", path: "/tabela-fipe/atibaia-sp" },
];

/**
 * Mede o eixo horizontal do DOCUMENTO.
 *
 * `scrollWidth > clientWidth` no `documentElement` é o único sinal que casa
 * com o que o usuário sente (a página "anda" para o lado). Medir um container
 * interno acharia transbordo legítimo — carrossel com `overflow-x` próprio,
 * tabela rolável — e reprovaria layout correto.
 *
 * A folga de 1px cobre arredondamento sub-pixel do layout engine.
 */
async function medirOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    // Quem está estourando: ajuda a diagnosticar sem abrir o trace.
    culpados: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`),
  }));
}

async function irPara(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // O layout do shell largo assenta depois das fontes; sem isso a medição
  // pega um estado intermediário e produz falso positivo.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
}

let slugVeiculo: string | null = null;

/**
 * Slug de um anúncio ativo, perguntado ao BACKEND — não à página.
 *
 * Extrair o slug do HTML de `/comprar` faria o teste pular quando o catálogo
 * estivesse quebrado, que é justamente o defeito a detectar. Perguntando à API
 * separamos "ambiente sem estoque" (pula) de "página vazia com estoque"
 * (falha).
 */
async function primeiroSlugAtivo(request: APIRequestContext): Promise<string | null> {
  const url = new URL(`${getBackendApiBaseUrl()}/api/ads/search`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("sort", "recent");
  const res = await request
    .get(url.toString(), { headers: { Accept: "application/json" }, timeout: 30_000 })
    .catch(() => null);
  if (!res?.ok()) return null;
  const json = (await res.json()) as { data?: Array<{ slug?: string }> };
  return json?.data?.[0]?.slug ?? null;
}

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  await ensureBackendApiReachable(request, getBackendApiBaseUrl());
});

test.describe("@ops-viewport OPS-01 — zero overflow horizontal", () => {
  for (const alvo of ALVOS_PUBLICOS) {
    for (const largura of LARGURAS) {
      test(`${alvo.nome} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await irPara(page, alvo.path);

        const { scrollWidth, clientWidth, culpados } = await medirOverflow(page);

        expect(
          scrollWidth,
          `${alvo.path} estourou ${scrollWidth - clientWidth}px em ${largura}px. Suspeitos: ${culpados.join(" | ") || "(nenhum identificado)"}`
        ).toBeLessThanOrEqual(clientWidth + 1);
      });
    }
  }

  test("página de veículo: sem overflow nas 7 larguras", async ({ page, request }) => {
    slugVeiculo = slugVeiculo ?? (await primeiroSlugAtivo(request));
    test.skip(!slugVeiculo, "Backend sem anúncios ativos — não há página de veículo para medir.");

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await irPara(page, `/veiculo/${slugVeiculo}`);

      const { scrollWidth, clientWidth, culpados } = await medirOverflow(page);
      expect(
        scrollWidth,
        `/veiculo/${slugVeiculo} estourou em ${largura}px. Suspeitos: ${culpados.join(" | ")}`
      ).toBeLessThanOrEqual(clientWidth + 1);
    }
  });

  test("painel autenticado: sem overflow nas 7 larguras", async ({ page, context }) => {
    await loginAsLocalUser(page, context);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Se o login não pegou, /dashboard redireciona para /login e mediríamos a
    // tela errada com nome de painel.
    expect(new URL(page.url()).pathname, "login E2E não autenticou").not.toBe("/login");

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await irPara(page, "/dashboard");

      const { scrollWidth, clientWidth, culpados } = await medirOverflow(page);
      expect(
        scrollWidth,
        `/dashboard estourou em ${largura}px. Suspeitos: ${culpados.join(" | ")}`
      ).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
});

test.describe("@ops-viewport OPS-03 — console limpo na home", () => {
  test("hero/carrossel não emite erro de console em mobile nem em desktop", async ({ page }) => {
    const erros: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const texto = msg.text();
      // Ruído de ambiente de desenvolvimento, não do produto: recurso externo
      // ausente e avisos do próprio dev server.
      if (/favicon|net::ERR_|Failed to load resource|\[Fast Refresh\]/i.test(texto)) return;
      erros.push(texto);
    });

    for (const largura of [375, 1440]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await irPara(page, "/");
      await page.waitForTimeout(1_500); // deixa o carrossel avançar ao menos um passo
    }

    expect(erros, `erros de console na home:\n${erros.join("\n")}`).toEqual([]);
  });
});

test.describe("@ops-viewport OPS-05 — nome acessível nos CTAs críticos", () => {
  test("todo link e botão visível da home tem nome acessível", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await irPara(page, "/");

    const { visiveis, semNome } = await page.evaluate(() => {
      const nomeDe = (el: Element) =>
        (
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          (el as HTMLElement).innerText ||
          el.querySelector("img")?.getAttribute("alt") ||
          ""
        ).trim();

      const controles = Array.from(document.querySelectorAll("a, button")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      return {
        visiveis: controles.length,
        semNome: controles
          .filter((el) => nomeDe(el).length === 0)
          .slice(0, 10)
          .map((el) => `${el.tagName.toLowerCase()}[href=${el.getAttribute("href") ?? "-"}]`),
      };
    });

    // Home quebrada rende zero controles — e "zero sem nome" passaria calado.
    expect(visiveis, "a home não renderizou link nem botão visível").toBeGreaterThan(10);
    expect(semNome, `controles sem nome acessível: ${semNome.join(", ")}`).toEqual([]);
  });

  test("o campo de busca do catálogo é rotulado", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await irPara(page, "/comprar");

    const { total, semRotulo } = await page.evaluate(() => {
      const campos = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="search"], input[type="text"]')
      ).filter((el) => el.getBoundingClientRect().width > 0);

      return {
        total: campos.length,
        semRotulo: campos
          .filter(
            (el) =>
              !el.getAttribute("aria-label") &&
              !el.getAttribute("placeholder") &&
              !el.labels?.length
          )
          .map((el) => el.name || el.id || "(sem name/id)"),
      };
    });

    // Sem esta linha o `expect` seguinte passaria numa página SEM campo nenhum —
    // um catálogo que perdeu a busca sairia verde no teste de rótulo dela.
    expect(total, "/comprar precisa ter ao menos um campo de busca visível").toBeGreaterThan(0);
    expect(semRotulo, `campos sem rótulo: ${semRotulo.join(", ")}`).toEqual([]);
  });
});

test.describe("@ops-viewport OPS-06 — nenhum stack trace na tela", () => {
  const ROTAS_DE_ERRO = [
    "/",
    "/comprar",
    "/carros-em/atibaia-sp",
    "/login",
    "/veiculo/slug-que-nao-existe-123",
  ];

  for (const rota of ROTAS_DE_ERRO) {
    test(`${rota} não expõe stack trace ao usuário`, async ({ page }) => {
      await irPara(page, rota);
      const texto = (await page.locator("body").innerText()).slice(0, 20_000);

      // Assinaturas de stack trace de Node/Next vazando para o corpo da página.
      expect(texto).not.toMatch(/\bat\s+\w+\s+\(.*\.js:\d+:\d+\)/);
      expect(texto).not.toContain("node_modules");
      expect(texto).not.toMatch(/webpack-internal:/);
      expect(texto).not.toMatch(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/);
    });
  }
});
