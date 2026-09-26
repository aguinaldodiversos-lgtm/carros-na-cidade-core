import { describe, expect, it } from "vitest";
import {
  parseAdsFilters,
  parseAdsFacetFilters,
} from "../../src/modules/ads/filters/ads-filter.parser.js";

/**
 * Fail-closed dos parâmetros do Search Policy Engine no caminho legado.
 *
 * Reproduzido em produção em 2026-09-25, contra o backend no ar:
 *
 *   GET /api/ads?origem=mairipora-sp&raio=0  → 36 anúncios do país inteiro
 *   GET /api/ads?origem=condado-pb&raio=25   → os mesmos 36
 *
 * `origem`/`raio`/`escopo` só são lidos pelo motor. Nas rotas que não o
 * chamam — e em `/api/ads/search` quando a origem está fora da allowlist —
 * eles eram ignorados, e ignorar ampliava o escopo: um pedido de UMA cidade
 * virava catálogo nacional. A regra é que parâmetro não honrado nunca alarga
 * o recorte; no máximo estreita.
 */
describe("parseAdsFilters — parâmetros do motor não honrados", () => {
  it("origem vira território: raio=0 não devolve o país", async () => {
    const f = await parseAdsFilters({ origem: "mairipora-sp", raio: "0" }, "public_global");
    expect(f.city_slug).toBe("mairipora-sp");
    expect(f.origem).toBeUndefined();
    expect(f.raio).toBeUndefined();
  });

  it("origem distante não vira busca nacional", async () => {
    const f = await parseAdsFilters({ origem: "condado-pb", raio: "25" }, "public_global");
    expect(f.city_slug).toBe("condado-pb");
  });

  it("escopo=brasil não alarga pelo caminho legado", async () => {
    const f = await parseAdsFilters({ origem: "atibaia-sp", escopo: "brasil" }, "public_global");
    expect(f.city_slug).toBe("atibaia-sp");
    expect(f.escopo).toBeUndefined();
  });

  it("território explícito vence a origem (não sobrescreve o que o caller pediu)", async () => {
    const f = await parseAdsFilters(
      { city_slug: "atibaia-sp", origem: "mairipora-sp", raio: "50" },
      "public_global"
    );
    expect(f.city_slug).toBe("atibaia-sp");
    expect(f.raio).toBeUndefined();
  });

  it("sem parâmetros do motor, nada muda", async () => {
    const f = await parseAdsFilters({ city_slug: "atibaia-sp", brand: "Honda" }, "public_global");
    expect(f.city_slug).toBe("atibaia-sp");
    expect(f.brand).toBe("Honda");
  });

  it("raio sozinho, sem origem, não inventa território nem sobrevive", async () => {
    const f = await parseAdsFilters({ raio: "25" }, "public_global");
    expect(f.city_slug).toBeUndefined();
    expect(f.raio).toBeUndefined();
  });

  it("vale também para as facetas, que usam o mesmo chokepoint", async () => {
    const f = await parseAdsFacetFilters({ origem: "piracaia-sp", raio: "0" });
    expect(f.city_slug).toBe("piracaia-sp");
    expect(f.raio).toBeUndefined();
  });
});
