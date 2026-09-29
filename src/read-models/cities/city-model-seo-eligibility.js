// src/read-models/cities/city-model-seo-eligibility.js
//
// Elegibilidade SEO da landing cidade + marca + modelo — DEC-30 (Proposed, não
// certificada). É a ÚNICA implementação dessa regra: o robots da página
// (`city-model.service.js`) e o sitemap de modelos
// (`territorial-inventory-sitemap.service.js`) chegam aqui pelo mesmo caminho.
//
// A regra depende de QUEM SERVE a listagem da landing, porque o número que
// decide a indexação tem de ser o do conjunto exibido (DEC-29):
//
//   modo servido = motor    local_model_count >= 1
//                           AND regional_model_count >= LIMIAR
//   modo servido = legado   local_model_count >= LIMIAR
//                           (a página mostra só a cidade; regra de DEC-29)
//
// LIMIAR vem da política central pela TAXONOMIA já resolvida da URL
// (`getSeoThreshold(seoSurfaceForModelTaxonomy(taxonomy))`, em
// city-thresholds.js): modelo comercial → `model` (1); URL antiga por
// descrição FIPE → `modelFipeLegacy` (base, 3). Este arquivo não conhece os
// números.
//
// O modo vem de `resolveSearchServingMode` — as mesmas três portas do
// controller de `/api/ads/search` (flag v1, contrato, allowlist). Aqui não se
// amplia nem se contorna a allowlist: fora dela, o território do motor nem é
// consultado. Trocar SEARCH_POLICY_ENGINE_CITIES muda o modo servido E a regra
// SEO no mesmo instante, para o robots e para o sitemap.
//
// Os números do modo motor vêm de `countSearchPolicyTerritory`: mesma origem,
// mesmas memberships, mesmo piso regional, mesma countQuery da listagem. A
// regra SEO mora aqui; o território, lá — este arquivo não conhece raio.
//
// Filtro, ordenação, paginação e resultado vazio na RENDERIZAÇÃO continuam com
// o frontend (`buildTerritorialMetadata`): isto decide só a URL-base limpa.

import { logger } from "../../shared/logger.js";
import {
  SERVING_MODE,
  countSearchPolicyTerritory,
  resolveSearchServingMode,
} from "../../modules/ads/search-policy/engine.js";
import { getCommercialModelDictionary } from "../../modules/ads/search-policy/dictionaries.js";
import { resolveCityModel } from "./territorial-resolve.service.js";
import { resolveModelListing } from "./territorial-cluster.logic.js";
import { getSeoThreshold, seoSurfaceForModelTaxonomy } from "./city-thresholds.js";

export const CITY_MODEL_SEO_RULE = "DEC-30";
export { SERVING_MODE };

export const CITY_MODEL_SEO_REASON = Object.freeze({
  /** Indexável pelo motor: âncora local + território com estoque suficiente. */
  LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY: "LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY",
  /** Indexável pelo legado: estoque próprio suficiente. */
  LOCAL_INVENTORY: "LOCAL_INVENTORY",
  /** Conjunto exibido vazio. */
  NO_ACTIVE_INVENTORY: "no_active_inventory",
  /** Motor: há estoque só nas vizinhas — sem âncora, não indexa. */
  NO_LOCAL_ANCHOR: "no_local_anchor",
  /** Conjunto exibido abaixo do limiar. */
  BELOW_MIN_INVENTORY: "below_min_inventory",
  /** A contagem falhou: fail-closed. */
  ELIGIBILITY_UNAVAILABLE: "eligibility_unavailable",
});

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * PURA: DEC-30 sobre o modo servido e os números. É aqui, e só aqui, que a
 * regra existe.
 *
 * @param {{ servingMode: string, localCount: number, regionalCount?: number,
 *           minInventory: number }} input
 *   `regionalCount` só é lido no modo motor.
 */
export function decideCityModelSeoEligibility({
  servingMode,
  localCount,
  regionalCount,
  minInventory,
}) {
  const engine = servingMode === SERVING_MODE.ENGINE;
  const local = toCount(localCount);
  // No legado o conjunto exibido é a própria cidade.
  const shown = engine ? toCount(regionalCount) : local;
  const min = Math.max(1, toCount(minInventory) || 1);

  let noindexReason = null;
  if (shown === 0) noindexReason = CITY_MODEL_SEO_REASON.NO_ACTIVE_INVENTORY;
  else if (local === 0) noindexReason = CITY_MODEL_SEO_REASON.NO_LOCAL_ANCHOR;
  else if (shown < min) noindexReason = CITY_MODEL_SEO_REASON.BELOW_MIN_INVENTORY;

  return {
    rule: CITY_MODEL_SEO_RULE,
    serving_mode: engine ? SERVING_MODE.ENGINE : SERVING_MODE.LEGACY,
    indexable: noindexReason === null,
    reason:
      noindexReason ||
      (engine
        ? CITY_MODEL_SEO_REASON.LOCAL_ANCHOR_WITH_REGIONAL_INVENTORY
        : CITY_MODEL_SEO_REASON.LOCAL_INVENTORY),
    noindexReason,
    local_model_count: local,
    regional_model_count: engine ? shown : null,
    min_inventory: min,
  };
}

/**
 * Modo servido e números da listagem que a landing de fato mostra.
 *
 *   filtros null   nada a listar (modelo sem estoque em lugar nenhum).
 *   modo legado    a página lista só a cidade: local = estoque próprio, e o
 *                  território do motor não é consultado. Inclui a URL antiga
 *                  por descrição FIPE (`model` é chave fora do contrato).
 *   modo motor     o motor conta o território canônico.
 */
export async function countCityModelTerritory(
  { citySlug, listingFilters, ownActiveCount },
  deps = {}
) {
  if (!listingFilters) {
    return { servingMode: SERVING_MODE.LEGACY, servingReason: "no_listing", local: 0 };
  }

  // Exatamente os parâmetros de produto que a página manda ao /api/ads/search.
  const query = { city_slug: citySlug, ...listingFilters };
  const serving = (deps.resolveServingMode || resolveSearchServingMode)(query, citySlug);

  if (serving.mode !== SERVING_MODE.ENGINE) {
    return {
      servingMode: SERVING_MODE.LEGACY,
      servingReason: serving.reason,
      local: toCount(ownActiveCount),
    };
  }

  const countTerritory = deps.countTerritory || countSearchPolicyTerritory;
  const result = await countTerritory(query, {
    db: deps.db,
    policy: deps.policy,
    cache: deps.cache,
  });

  // Sem origem resolvida o motor conta o país inteiro — nunca é o território
  // desta landing.
  if (!result?.origin_city || result.origin_city.slug !== citySlug) {
    throw new Error(`[city-model-seo] origem não resolvida pelo motor: ${citySlug}`);
  }

  const regional = toCount(result.total_result_count);
  // GEO_FALLBACK (origem sem coordenadas/memberships) não publica a contagem
  // local, mas o território é a própria cidade: local = total.
  const local =
    result.local_result_count == null
      ? result.geo_mode === "EXACT_CITY"
        ? regional
        : 0
      : toCount(result.local_result_count);

  return { servingMode: SERVING_MODE.ENGINE, servingReason: null, local, regional };
}

/**
 * Elegibilidade da landing. Nunca lança: falha de contagem vira noindex
 * (fail-closed), com log — página fora do índice por um erro é recuperável;
 * página magra dentro dele, não.
 *
 * `taxonomy` ("commercial" | "fipe" | "none") é a de `resolveCityModel`; o
 * limiar sai dela pela política central. Taxonomia ausente cai na família
 * mais estrita. `minInventory` explícito sobrepõe (testes).
 */
export async function evaluateCityModelSeoEligibility(
  {
    citySlug,
    listingFilters,
    ownActiveCount,
    taxonomy,
    minInventory = getSeoThreshold(seoSurfaceForModelTaxonomy(taxonomy)),
  },
  deps = {}
) {
  try {
    const counts = await countCityModelTerritory(
      { citySlug, listingFilters, ownActiveCount },
      deps
    );
    return {
      ...decideCityModelSeoEligibility({
        servingMode: counts.servingMode,
        localCount: counts.local,
        regionalCount: counts.regional,
        minInventory,
      }),
      serving_reason: counts.servingReason,
    };
  } catch (err) {
    logger.error(
      { err: err?.message || String(err), citySlug },
      "[city-model-seo] contagem territorial falhou — noindex por fail-closed"
    );
    return {
      rule: CITY_MODEL_SEO_RULE,
      serving_mode: SERVING_MODE.ENGINE,
      serving_reason: null,
      indexable: false,
      reason: CITY_MODEL_SEO_REASON.ELIGIBILITY_UNAVAILABLE,
      noindexReason: CITY_MODEL_SEO_REASON.ELIGIBILITY_UNAVAILABLE,
      local_model_count: null,
      regional_model_count: null,
      min_inventory: Math.max(1, toCount(minInventory) || 1),
    };
  }
}

/**
 * Filtro de produto da listagem a partir da resolução da cidade. O dicionário
 * nacional só é lido quando a cidade não tem o modelo — é o caso em que o
 * rótulo exato não sai do estoque próprio. Falha dele não derruba nada: sem
 * rótulo, `filters` é null.
 */
export async function resolveCityModelListing(resolution) {
  const { brandSlug, brand, modelSlug, model, taxonomy } = resolution;
  const commercialDictionary =
    taxonomy === "none" ? await getCommercialModelDictionary().catch(() => []) : [];
  return resolveModelListing(
    {
      brandSlug,
      modelSlug,
      brandLabel: brand.label,
      modelLabel: model.label,
      taxonomy,
    },
    commercialDictionary
  );
}

/**
 * Elegibilidade a partir dos slugs da URL — o caminho do sitemap. Resolve a
 * cidade e a listagem exatamente como a página e cai na MESMA avaliação (e no
 * mesmo modo servido).
 * Cidade que não existe → null (a URL nem responde 200).
 */
export async function resolveCityModelSeoEligibility(citySlug, brandSlug, modelSlug, deps = {}) {
  const resolution = await (deps.resolveCityModel || resolveCityModel)(
    citySlug,
    brandSlug,
    modelSlug
  );
  if (!resolution?.city) return null;
  const listing = await (deps.resolveListing || resolveCityModelListing)(resolution);
  return evaluateCityModelSeoEligibility(
    {
      citySlug: resolution.city.slug,
      listingFilters: listing.filters,
      ownActiveCount: resolution.model.activeCount,
      taxonomy: resolution.taxonomy,
    },
    deps
  );
}
