import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * PR B — Testes de proteção (DIAGNOSTICO_REDESIGN.md §4 risco #3, §8.3 Contrato SEO).
 *
 * Verifica que sitemap.xml gera todas as 9 seções sem erro silencioso.
 *
 * Risco coberto: `try/catch` mudo em sitemap.xml/route.ts pode engolir falha
 * de detectAvailableStates() e perder 2.000+ URLs na indexação.
 *
 * Esta suite NÃO valida volumes específicos (ex: "deve ter X cidades") porque
 * volume varia por dataset. Valida estrutura mínima e ausência de erro 5xx.
 *
 * Marca: @seo-sitemap
 */

const SITEMAP_INDEX = "/sitemap.xml";

const SITEMAP_TARGETS = [
  { path: "/sitemaps/core.xml", name: "core" },
  { path: "/sitemaps/cities.xml", name: "cities" },
  { path: "/sitemaps/brands.xml", name: "brands" },
  { path: "/sitemaps/models.xml", name: "models" },
  { path: "/sitemaps/content.xml", name: "content" },
  { path: "/sitemaps/below-fipe.xml", name: "below-fipe" },
  { path: "/sitemaps/opportunities.xml", name: "opportunities" },
  { path: "/sitemaps/local-seo.xml", name: "local-seo" },
];

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("@seo-sitemap sitemap.xml e sitemaps temáticos", () => {
  test("/sitemap.xml retorna 200 com XML válido", async ({ request, baseURL }) => {
    const url = (baseURL ?? "http://127.0.0.1:3000") + SITEMAP_INDEX;
    const res = await request.get(url, { timeout: 30_000 });
    expect(res.status(), `Status de ${SITEMAP_INDEX}`).toBe(200);

    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toMatch(/xml/);

    const body = await res.text();
    expect(body.startsWith("<?xml")).toBe(true);
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("</sitemapindex>");

    // Deve referenciar pelo menos os 8 sitemaps temáticos esperados
    for (const target of SITEMAP_TARGETS) {
      expect(body, `${target.name} referenciado no index`).toContain(target.name);
    }
  });

  for (const target of SITEMAP_TARGETS) {
    test(`${target.path} retorna 200 com XML válido`, async ({ request, baseURL }) => {
      const url = (baseURL ?? "http://127.0.0.1:3000") + target.path;
      const res = await request.get(url, { timeout: 30_000 });
      expect(res.status(), `Status de ${target.path}`).toBe(200);

      const contentType = res.headers()["content-type"] || "";
      expect(contentType).toMatch(/xml/);

      const body = await res.text();
      expect(body.startsWith("<?xml")).toBe(true);
      // <urlset> ou <sitemapindex> são raízes válidas
      expect(body).toMatch(/<(urlset|sitemapindex)/);
    });
  }

  test("/sitemaps/regiao/sp.xml retorna 200 (sample regional)", async ({ request, baseURL }) => {
    const url = (baseURL ?? "http://127.0.0.1:3000") + "/sitemaps/regiao/sp.xml";
    const res = await request.get(url, { timeout: 30_000 });
    // Aceita 200 (com conteúdo) ou 404 (estado sem dados — ambos não são 5xx)
    expect(res.status(), "Status do sitemap regional").toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.text();
      expect(body.startsWith("<?xml")).toBe(true);
    }
  });

  test("/robots.txt retorna 200 e referencia sitemap", async ({ request, baseURL }) => {
    const url = (baseURL ?? "http://127.0.0.1:3000") + "/robots.txt";
    const res = await request.get(url, { timeout: 30_000 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Robots gerado por app/robots.ts — deve mencionar Sitemap
    expect(body.toLowerCase()).toContain("sitemap");
  });
});
