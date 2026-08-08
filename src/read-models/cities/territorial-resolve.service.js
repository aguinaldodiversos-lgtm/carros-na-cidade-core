// src/read-models/cities/territorial-resolve.service.js
//
// Orquestra repository (DB) + lógica pura para resolver, a partir dos slugs
// de URL, a cidade + marca[+modelo] reais e a contagem EXATA de estoque
// ativo que decide a indexação. Usado por city-brand.service.js e
// city-model.service.js.

import * as repo from "./territorial-cluster.repository.js";
import { brandModelSlug, canonicalBrandSlug } from "../../shared/utils/slugify.js";
import {
  matchRowsBySlug,
  matchModelRowsBySlug,
  aggregateMatchedRows,
} from "./territorial-cluster.logic.js";

/**
 * Resolve `/cidade/{citySlug}/marca/{brandSlug}`.
 *
 * @returns {Promise<
 *   | { city: null }
 *   | { city: object, brandSlug: string, brand: { label, values, activeCount, hasActiveInventory, stats, lastUpdated } }
 * >}
 */
export async function resolveCityBrand(citySlug, brandSlug) {
  const city = await repo.getCityIdentity(citySlug);
  if (!city) return { city: null };

  const rows = await repo.getActiveBrandAggregates(city.id);
  const matched = matchRowsBySlug(rows, brandSlug, "brand");
  const brand = aggregateMatchedRows(matched, { labelKey: "brand", slug: brandSlug });

  return { city, brandSlug: canonicalBrandSlug(brandSlug), brand };
}

/**
 * Resolve `/cidade/{citySlug}/marca/{brandSlug}/modelo/{modelSlug}`.
 * Resolve a marca primeiro; só então restringe os modelos às marcas reais.
 *
 * O slug de modelo é resolvido pelo MODELO COMERCIAL quando possível
 * (`/modelo/onix` agrega as quatro descrições FIPE do Onix), com fallback para
 * a descrição FIPE crua — ver `matchModelRowsBySlug`. `taxonomy` diz qual dos
 * dois resolveu, para que o service consiga filtrar os anúncios pelo mesmo
 * critério que contou o estoque.
 */
export async function resolveCityModel(citySlug, brandSlug, modelSlug) {
  const base = await resolveCityBrand(citySlug, brandSlug);
  if (!base.city) return { city: null };

  let model = aggregateMatchedRows([], { labelKey: "model", slug: modelSlug });
  let taxonomy = "none";

  if (base.brand.values.length > 0) {
    const rows = await repo.getActiveModelAggregates(base.city.id, base.brand.values);
    const matched = matchModelRowsBySlug(rows, modelSlug);
    taxonomy = matched.taxonomy;
    model = aggregateMatchedRows(matched.rows, {
      labelKey: "model",
      slug: modelSlug,
      labelOverride: matched.commercialLabel,
    });
  }

  return {
    city: base.city,
    brandSlug: base.brandSlug,
    brand: base.brand,
    modelSlug: brandModelSlug(modelSlug),
    model,
    taxonomy,
  };
}
