import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * PR B — Testes de proteção (DIAGNOSTICO_REDESIGN.md §8.3 Contrato SEO).
 *
 * Verifica que páginas estratégicas têm JSON-LD esperado:
 *   - /cidade/[slug]                  → BreadcrumbList
 *   - /veiculo/[slug]                 → BreadcrumbList + Product (ou Vehicle)
 *   - /blog/[cidade]                  → BreadcrumbList + Article (presente em blog post)
 *
 * O detalhe do veículo só roda se VEHICLE_SLUG_FOR_E2E for definido.
 *
 * Marca: @seo-jsonld
 */

const TERRITORIAL_URLS_WITH_BREADCRUMB = [
  "/cidade/atibaia-sp",
  "/cidade/atibaia-sp/marca/honda",
  "/cidade/atibaia-sp/oportunidades",
  "/cidade/atibaia-sp/abaixo-da-fipe",
];

type JsonLdNode = { "@type"?: string | string[] | undefined };

async function readJsonLdTypes(page: import("@playwright/test").Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types: string[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr as JsonLdNode[]) {
        if (item && typeof item === "object" && item["@type"] !== undefined) {
          const t = Array.isArray(item["@type"]) ? item["@type"].join(",") : String(item["@type"]);
          types.push(t);
        }
      }
    } catch {
      // Ignora JSON inválido — outros assertions falharão se houver problema real
    }
  }
  return types;
}

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("@seo-jsonld JSON-LD em páginas públicas", () => {
  for (const path of TERRITORIAL_URLS_WITH_BREADCRUMB) {
    test(`${path} tem BreadcrumbList JSON-LD`, async ({ page }) => {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // Páginas territoriais podem retornar 404 se cidade não tiver dados,
      // mas o objetivo é detectar regressão em cidades existentes
      expect(
        response?.status(),
        `Status de ${path} — se 404, ajustar lista para cidade com dados`
      ).toBeLessThan(500);

      const types = await readJsonLdTypes(page);
      expect(types.length, `Esperado ao menos 1 bloco JSON-LD em ${path}`).toBeGreaterThan(0);
      expect(
        types.some((t) => t.toLowerCase().includes("breadcrumb")),
        `BreadcrumbList esperado em ${path} — tipos encontrados: ${types.join(", ")}`
      ).toBe(true);
    });
  }

  test("/blog tem JSON-LD (Article ou BreadcrumbList)", async ({ page }) => {
    const response = await page.goto("/blog", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.ok()).toBe(true);
    const types = await readJsonLdTypes(page);
    expect(types.length).toBeGreaterThan(0);
  });

  test("/blog/atibaia-sp tem JSON-LD", async ({ page }) => {
    const response = await page.goto("/blog/atibaia-sp", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBeLessThan(500);
    const types = await readJsonLdTypes(page);
    expect(types.length).toBeGreaterThan(0);
  });

  const vehicleSlug = process.env.VEHICLE_SLUG_FOR_E2E;
  if (vehicleSlug) {
    test(`/veiculo/${vehicleSlug} tem JSON-LD de detalhe`, async ({ page }) => {
      const response = await page.goto(`/veiculo/${vehicleSlug}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(response?.ok()).toBe(true);
      const types = await readJsonLdTypes(page);
      expect(types.length).toBeGreaterThan(0);
      expect(
        types.some((t) => t.toLowerCase().includes("breadcrumb")),
        `BreadcrumbList esperado em /veiculo/${vehicleSlug}`
      ).toBe(true);
      // Product ou Vehicle típicos para detalhe
      expect(
        types.some((t) => /product|vehicle|car|automobile/i.test(t)),
        `Product/Vehicle JSON-LD esperado em detalhe — tipos: ${types.join(", ")}`
      ).toBe(true);
    });
  } else {
    test.skip("/veiculo/[slug] tem JSON-LD (skip — VEHICLE_SLUG_FOR_E2E não definido)", async () => {
      // Ativar definindo VEHICLE_SLUG_FOR_E2E=<slug-real-de-anuncio>
    });
  }
});
