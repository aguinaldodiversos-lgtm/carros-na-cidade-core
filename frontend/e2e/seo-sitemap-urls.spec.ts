import { expect, test, type APIRequestContext } from "@playwright/test";

import { ensureDevServerUp } from "./helpers";

/**
 * Homologação pré-lançamento — GRUPO H (SEO-07, SEO-10, SEO-12).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE `seo-sitemap.spec.ts` JÁ FAZ, E O QUE FALTAVA
 * ────────────────────────────────────────────────────────────────────────────
 * O spec existente prova que cada sitemap temático responde 200 com XML bem
 * formado. Isso não diz nada sobre o CONTEÚDO: um `core.xml` impecável pode
 * listar uma URL que responde 404, ou que redireciona, ou que a própria página
 * marca como `noindex`. Foi exatamente esse o defeito de produção que originou
 * o Route Handler de `/tabela-fipe` — uma URL do `core.xml` mandando o
 * visitante para um 404.
 *
 * Este arquivo percorre os `<loc>` de verdade.
 *
 * IDs cobertos:
 *   SEO-07  URLs dos sitemaps: zero 404 inesperado, zero redirect
 *   SEO-10  nenhum Location com hostname interno em toda a varredura
 *   SEO-12  nada listado em sitemap se declara noindex
 *
 * Ambiente sem estoque produz sitemaps vazios; isso é `skip` explícito, não
 * verde silencioso — um sitemap vazio e um sitemap com lixo são diagnósticos
 * diferentes e o relatório precisa distinguir os dois.
 */

const SITEMAP_INDEX = "/sitemap.xml";

/** Teto por sitemap: a varredura é amostral por desenho, não exaustiva. */
const MAX_URLS_POR_SITEMAP = 25;

function extrairLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)).map((m) => m[1]);
}

async function baixar(request: APIRequestContext, url: string) {
  return request.get(url, { timeout: 45_000, maxRedirects: 0 });
}

/** Caminho + query, sem o host — o host local varia entre execuções. */
function paraCaminho(loc: string) {
  try {
    const u = new URL(loc);
    return u.pathname + u.search;
  } catch {
    return loc;
  }
}

let indiceXml = "";
let sitemapsTematicos: string[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  const res = await baixar(request, (baseURL ?? "http://127.0.0.1:3000") + SITEMAP_INDEX);
  expect(res.status(), "/sitemap.xml precisa responder 200 para a varredura fazer sentido").toBe(
    200
  );
  indiceXml = await res.text();
  sitemapsTematicos = extrairLocs(indiceXml);
});

test.describe("@seo-sitemap-urls SEO-07 — as URLs listadas existem", () => {
  test("o índice aponta para pelo menos um sitemap temático", async () => {
    expect(sitemapsTematicos.length).toBeGreaterThan(0);
  });

  test("nenhuma URL listada responde 404 ou redireciona", async ({ request, baseURL }) => {
    const origem = baseURL ?? "http://127.0.0.1:3000";
    const problemas: string[] = [];
    let visitadas = 0;

    const desabilitados: string[] = [];

    for (const sitemapUrl of sitemapsTematicos) {
      const nome = paraCaminho(sitemapUrl);
      const res = await baixar(request, origem + nome);

      // 503 é o kill switch documentado (`SITEMAP_PUBLIC_ENABLED`, default
      // false — ver `src/modules/public/public-seo.controller.js`). É o
      // fail-closed CORRETO: melhor 503 que 200 com urlset vazio, que faria o
      // Google desindexar. Em produção a variável está `true`.
      //
      // Distinguir 503 de 404 é o ponto deste teste: "sitemap desligado neste
      // ambiente" e "sitemap servindo URL quebrada" são diagnósticos opostos, e
      // tratá-los igual produziria vermelho sem defeito — ou, pior, o hábito de
      // ignorar o vermelho.
      if (res.status() === 503) {
        desabilitados.push(nome);
        continue;
      }
      expect(res.status(), `${nome} deve responder 200 ou 503 (kill switch)`).toBe(200);

      const locs = extrairLocs(await res.text()).slice(0, MAX_URLS_POR_SITEMAP);
      for (const loc of locs) {
        const caminho = paraCaminho(loc);
        const pagina = await baixar(request, origem + caminho);
        visitadas += 1;

        const status = pagina.status();
        if (status === 200) continue;

        // 3xx é falha própria: sitemap deve listar a URL FINAL, nunca a que
        // redireciona — o crawler gasta orçamento e o sinal se dilui.
        if (status >= 300 && status < 400) {
          problemas.push(
            `${caminho} → ${status} para ${pagina.headers()["location"] ?? "(sem Location)"} (sitemap: ${nome})`
          );
          continue;
        }
        problemas.push(`${caminho} → ${status} (sitemap: ${nome})`);
      }
    }

    test.skip(
      visitadas === 0,
      `Nada a percorrer neste ambiente. Sitemaps desligados pelo kill switch: ${
        desabilitados.join(", ") || "(nenhum)"
      }. Sem estoque, os servidos saem vazios.`
    );

    expect(
      problemas,
      `URLs problemáticas nos sitemaps:\n${problemas.join("\n")}\n` +
        `(desligados por SITEMAP_PUBLIC_ENABLED: ${desabilitados.join(", ") || "nenhum"})`
    ).toEqual([]);
  });

  test("SEO-10 — nenhum redirect da varredura carrega hostname interno", async ({
    request,
    baseURL,
  }) => {
    const origem = baseURL ?? "http://127.0.0.1:3000";
    const locationsInternos: string[] = [];

    for (const sitemapUrl of sitemapsTematicos) {
      const res = await baixar(request, origem + paraCaminho(sitemapUrl));
      const locs = extrairLocs(await res.text()).slice(0, MAX_URLS_POR_SITEMAP);

      for (const loc of locs) {
        const caminho = paraCaminho(loc);
        const pagina = await baixar(request, origem + caminho);
        const location = pagina.headers()["location"];
        if (location && /srv-|\.internal|:10000/.test(location)) {
          locationsInternos.push(`${caminho} → ${location}`);
        }
      }
    }

    expect(locationsInternos, locationsInternos.join("\n")).toEqual([]);
  });
});

test.describe("@seo-sitemap-urls SEO-12 — sitemap e robots dizem a mesma coisa", () => {
  test("nada listado em sitemap se declara noindex", async ({ request, baseURL }) => {
    const origem = baseURL ?? "http://127.0.0.1:3000";
    const contradicoes: string[] = [];
    let visitadas = 0;

    for (const sitemapUrl of sitemapsTematicos) {
      const res = await baixar(request, origem + paraCaminho(sitemapUrl));
      const locs = extrairLocs(await res.text()).slice(0, MAX_URLS_POR_SITEMAP);

      for (const loc of locs) {
        const caminho = paraCaminho(loc);
        const pagina = await baixar(request, origem + caminho);
        if (pagina.status() !== 200) continue;
        visitadas += 1;

        const html = await pagina.text();
        // Tanto a meta quanto o header contam — os dois chegam ao crawler.
        const metaNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(
          html
        );
        const headerNoindex = /noindex/i.test(pagina.headers()["x-robots-tag"] ?? "");
        if (metaNoindex || headerNoindex) {
          contradicoes.push(caminho);
        }
      }
    }

    test.skip(visitadas === 0, "Sitemaps vazios neste ambiente — nada a conferir.");

    expect(contradicoes, `URLs em sitemap declarando noindex:\n${contradicoes.join("\n")}`).toEqual(
      []
    );
  });

  test("/robots.txt aponta para o índice de sitemaps", async ({ request, baseURL }) => {
    const origem = baseURL ?? "http://127.0.0.1:3000";
    const res = await baixar(request, `${origem}/robots.txt`);

    expect(res.status()).toBe(200);
    expect((await res.text()).toLowerCase()).toContain("sitemap");
  });
});
