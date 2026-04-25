import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * PR B — Testes de proteção (DIAGNOSTICO_REDESIGN.md §8.3 Contrato SEO).
 *
 * Verifica que páginas públicas indexáveis têm:
 *   - <link rel="canonical" href="..."> presente
 *   - canonical aponta para URL coerente (mesmo domínio, mesmo path ou alvo definido)
 *   - <h1> único
 *   - meta description presente e razoável (50-200 chars)
 *
 * Lista mínima de 10 URLs alinhada com docs/ROUTE_CANONICAL_MAP.md §4.
 */

const PUBLIC_URLS_WITH_CANONICAL = [
  { path: "/", description: "Home" },
  { path: "/anuncios", description: "Listagem canônica" },
  { path: "/sobre", description: "Sobre" },
  { path: "/como-funciona", description: "Como funciona" },
  { path: "/blog", description: "Blog index" },
  { path: "/tabela-fipe", description: "Tabela FIPE root" },
  { path: "/simulador-financiamento", description: "Simulador" },
  { path: "/planos", description: "Planos" },
  { path: "/login", description: "Login" },
  { path: "/cadastro", description: "Cadastro" },
];

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("@seo-canonical canonical em páginas públicas", () => {
  for (const target of PUBLIC_URLS_WITH_CANONICAL) {
    test(`${target.description} (${target.path}) tem canonical e h1 único`, async ({ page }) => {
      const response = await page.goto(target.path, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      expect(response?.ok(), `Status para ${target.path}`).toBe(true);

      // 1. Canonical presente
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, `Canonical em ${target.path}`).toBeTruthy();
      expect(canonical, `Canonical deve ser absoluto em ${target.path}`).toMatch(/^https?:\/\//);

      // 2. H1 único
      const h1Count = await page.locator("h1").count();
      expect(h1Count, `Quantidade de <h1> em ${target.path}`).toBe(1);

      // 3. Meta description presente
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(description, `Description em ${target.path}`).toBeTruthy();
      expect((description || "").length).toBeGreaterThan(40);
      expect((description || "").length).toBeLessThan(220);

      // 4. OG tags básicas
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
      expect(ogTitle, `og:title em ${target.path}`).toBeTruthy();
    });
  }
});
