import { describe, it, expect } from "vitest";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";

/**
 * Tarefa 10 — filtros públicos só ACTIVE.
 *
 * O builder produz um WHERE que SEMPRE inclui status='active'. Assim,
 * qualquer ad em pending_review/rejected/paused/sold/expired/deleted/blocked
 * é automaticamente excluído de:
 *   • /comprar
 *   • páginas de cidade/estado/SEO
 *   • carrosséis públicos
 *   • busca textual (search)
 *   • autocomplete (que usa o repository com filtro 'active')
 *   • sitemap (lê via show/list que respeitam o mesmo filtro)
 */

function normalize(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

describe("buildAdsSearchQuery — somente ACTIVE no WHERE público", () => {
  it("query padrão restringe a status = 'active'", () => {
    const { dataQuery, countQuery } = buildAdsSearchQuery({});
    expect(normalize(dataQuery)).toMatch(/a\.status\s*=\s*'active'/);
    expect(normalize(countQuery)).toMatch(/a\.status\s*=\s*'active'/);
  });

  it("nenhum dos status não públicos aparece no WHERE", () => {
    const { dataQuery } = buildAdsSearchQuery({});
    const sql = normalize(dataQuery);
    for (const blocked of [
      "pending_review",
      "rejected",
      "paused",
      "sold",
      "expired",
      "deleted",
      "blocked",
    ]) {
      expect(sql).not.toMatch(new RegExp(`a\\.status\\s*=\\s*'${blocked}'`));
    }
  });

  it("filtros adicionais (cidade, marca) preservam o guard de status", () => {
    const { dataQuery } = buildAdsSearchQuery({
      city_slug: "atibaia-sp",
      brand: "Honda",
    });
    expect(normalize(dataQuery)).toMatch(/a\.status\s*=\s*'active'/);
  });
});
