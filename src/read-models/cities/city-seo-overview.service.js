// src/read-models/cities/city-seo-overview.service.js
//
// CitySeoOverview — a FONTE DE VERDADE única dos módulos de autoridade local
// (Fase 3, Etapa 4). Antes desta camada, cada módulo da página de cidade
// buscava seu próprio recorte: um pedia facets, outro pedia stats do snapshot,
// outro contava anúncios. Números do mesmo assunto discordavam entre blocos da
// mesma página.
//
// Agora existe um payload só, calculado de uma vez, e todo módulo lê dele.
//
// INDEPENDÊNCIA TERRITORIAL: tudo aqui é resolvido a partir de `city.id`, que
// vem do slug pedido. Não há cidade padrão, fallback nem slug fixo — uma
// cidade sem inventário devolve um overview vazio DELA, nunca os números de
// outra.
//
// CUSTO: 1 query de identidade + 5 agregações em paralelo + a cobertura de
// raio (que tem cache próprio de 300s no endpoint público). Nenhum N+1.

import * as repo from "./city-seo-overview.repository.js";
import { getCityIdentity } from "./territorial-cluster.repository.js";
import { resolveCityCoverage } from "./regional-radius.service.js";
import { getSeoInventoryThresholds } from "./city-thresholds.js";
import {
  buildBrandEntities,
  buildCommercialModelEntities,
  buildDealerEntities,
  buildFacetEntities,
  buildNearbyCities,
  buildPriceStats,
} from "./city-seo-overview.logic.js";

/**
 * @param {string} slug slug canônico da cidade (`nome-uf`)
 * @returns {Promise<object|null>} `null` quando a cidade não existe
 */
export async function getCitySeoOverview(slug) {
  const citySlug = String(slug || "")
    .trim()
    .toLowerCase();
  if (!citySlug) return null;

  const city = await getCityIdentity(citySlug);
  if (!city) return null;

  const [statsRow, brandRows, modelRows, facetRows, dealerRows, coverage] = await Promise.all([
    repo.getCityInventoryStats(city.id),
    repo.getCityBrandAggregates(city.id),
    repo.getCityBrandModelAggregates(city.id),
    repo.getCityFacetAggregates(city.id),
    repo.getCityActiveDealers(city.id),
    // A vizinhança é geográfica (region_memberships + distância), não
    // inventário — por isso vem de um serviço próprio, já cacheado.
    resolveCityCoverage(citySlug).catch(() => ({ members: [], radiusKm: null })),
  ]);

  const nearbySlugs = (coverage.members || []).map((m) => m.slug).filter(Boolean);
  const nearbyCounts = nearbySlugs.length
    ? await repo.getActiveCountsByCitySlugs(nearbySlugs)
    : [];

  const brands = buildBrandEntities(brandRows, citySlug);
  const { models, unresolved: unresolvedModelAds } = buildCommercialModelEntities(
    modelRows,
    citySlug
  );
  const facets = buildFacetEntities(facetRows);
  const priceStats = buildPriceStats(statsRow);
  const dealers = buildDealerEntities(dealerRows);
  const nearbyCities = buildNearbyCities(coverage.members, nearbyCounts);

  const activeAds = Number(statsRow?.active_ads) || 0;

  return {
    city: {
      id: city.id,
      slug: city.slug,
      name: city.name,
      state: city.state || null,
    },
    inventory: {
      activeAds,
      activeDealers: Number(statsRow?.active_advertisers) || 0,
      belowFipeCount: Number(statsRow?.below_fipe_count) || 0,
      automaticCount: Number(statsRow?.automatic_count) || 0,
      manualCount: Number(statsRow?.manual_count) || 0,
      minYear: statsRow?.min_year ?? null,
      maxYear: statsRow?.max_year ?? null,
      updatedAt: statsRow?.inventory_updated_at
        ? new Date(statsRow.inventory_updated_at).toISOString()
        : null,
    },
    priceStats,
    brands,
    models,
    /**
     * Anúncios ativos cujo modelo comercial NÃO foi derivável. Exposto de
     * propósito: se crescer, a taxonomia precisa de override novo. Um zero
     * silencioso esconderia exatamente esse sinal.
     */
    unresolvedModelAds,
    facets,
    dealers,
    nearbyCities,
    thresholds: getSeoInventoryThresholds(),
    generatedAt: new Date().toISOString(),
  };
}
