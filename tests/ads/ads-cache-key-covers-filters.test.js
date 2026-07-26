import { describe, expect, it } from "vitest";

import { ADS_ALLOWED_QUERY_KEYS } from "../../src/modules/ads/ads.routes.js";
import { adsFilterQueryBase } from "../../src/modules/ads/filters/ads-filter.schema.js";

/**
 * Guarda contra colisão de cache key por filtro não-listado.
 *
 * `cacheGet({ allowedQueryKeys })` DESCARTA da cache key toda chave fora da
 * whitelist (`filterQuery` em src/shared/cache/cache.middleware.js). Um
 * filtro que restringe o WHERE mas não está na lista faz duas requests
 * semanticamente diferentes colidirem na MESMA key do Redis:
 *
 *   /api/ads/search?city_slug=atibaia-sp
 *   /api/ads/search?city_slug=atibaia-sp&seller_kind=private
 *
 * Quem populou primeiro define o que o outro recebe, por até o TTL (30s).
 * O sintoma é intermitente e depende de tráfego — praticamente impossível
 * de reproduzir localmente.
 *
 * Este teste é DERIVADO DO SCHEMA de propósito: um filtro novo em
 * `adsFilterQueryBase` quebra aqui sem ninguém precisar lembrar de editar
 * o teste. Foi exatamente a falta disso que deixou `seller_kind`,
 * `opportunity` e `priority_tier` fora da whitelist desde a Fase 3.
 *
 * Se um filtro novo NÃO deve variar o cache, adicione-o a
 * `NAO_VARIA_CACHE` abaixo com a justificativa — exigir a decisão
 * explícita é o objetivo.
 */

/**
 * Chaves do schema que legitimamente não precisam entrar na cache key
 * porque não restringem o conjunto de resultados.
 */
const NAO_VARIA_CACHE = new Set([
  // Metadado interno produzido pelo parser de free-query, nunca vem do
  // querystring do cliente.
  "free_query_meta",
]);

describe("cache key de /api/ads — cobertura dos filtros do schema", () => {
  const schemaKeys = Object.keys(adsFilterQueryBase.shape);
  const allowed = new Set(ADS_ALLOWED_QUERY_KEYS);

  it("o schema expõe as chaves (sanidade — se vazio, o teste não prova nada)", () => {
    expect(schemaKeys.length).toBeGreaterThan(15);
    // Âncoras: se estas sumirem, o schema mudou de forma e o teste precisa
    // ser revisto em vez de silenciosamente parar de cobrir.
    expect(schemaKeys).toContain("brand");
    expect(schemaKeys).toContain("seller_kind");
    expect(schemaKeys).toContain("priority_tier");
  });

  it("TODO filtro do schema está na whitelist da cache key", () => {
    const faltando = schemaKeys
      .filter((key) => !NAO_VARIA_CACHE.has(key))
      .filter((key) => !allowed.has(key));

    expect(
      faltando,
      `Filtros no schema mas fora de ADS_ALLOWED_QUERY_KEYS (colidem na cache key): ${faltando.join(", ")}. ` +
        `Adicione em src/modules/ads/ads.routes.js, ou a NAO_VARIA_CACHE deste teste com justificativa.`
    ).toEqual([]);
  });

  it("os três filtros da Fase 3 estão cobertos (regressão 2026-07-26)", () => {
    for (const key of ["seller_kind", "opportunity", "priority_tier"]) {
      expect(allowed.has(key), `"${key}" fora da whitelist da cache key`).toBe(true);
    }
  });

  /*
   * NÃO testamos a direção inversa (chave na whitelist ausente do schema).
   * A whitelist contém de propósito aliases de querystring que o parser
   * normaliza e que por isso não existem no shape: `city_slug`, `city_id`,
   * `min_price`/`max_price` (→ price_min/price_max), `fuel` (→ fuel_type),
   * `version`, `seller_type`, `featured`, `city_slugs[]`. Um teste com 8
   * exceções fixas geraria churn sem sinal — a direção que importa é a de
   * cima: filtro que restringe o WHERE e não varia o cache.
   */
});
