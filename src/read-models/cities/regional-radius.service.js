// src/read-models/cities/regional-radius.service.js
//
// Orquestra o modelo "âncora regional" (Onda 2 Fase 2a). Regra final de produto
// (2026-07-05): a página é SEMPRE da própria cidade (canonical/H1 = self),
// mesmo sem estoque — NUNCA redireciona nem canonicaliza para outra cidade. A
// cidade sem estoque próprio mostra os carros da vizinhança (raio) ordenados
// por distância, permanecendo em "[cidade]". Só é INDEXÁVEL a cidade com
// estoque PRÓPRIO >= minAds; abaixo disso é noindex + fora do sitemap (a
// expansão por distância é EXPERIÊNCIA, nunca gera URL indexável).
//
// A parte PURA é testável sem DB; a orquestração usa o repository. A montagem
// final (city_slugs, sort por distância, blocos, rótulos) fica no loader do
// frontend, que consome a cobertura por um endpoint público.

import { getRadiusMembers, getOwnActiveCount } from "./regional-radius.repository.js";
import { getRegionalRadiusKm } from "./regional-radius.config.js";
import { getSitemapMinAds } from "../seo/sitemap-min-ads.js";

/**
 * Indexação (PURA): só a cidade com estoque PRÓPRIO >= minAds indexa. Vizinhança
 * no raio é experiência — não muda a decisão. Canonical é SEMPRE a própria
 * cidade (self); aqui decidimos apenas index vs noindex.
 */
export function decideCityIndexable({ ownCount, minAds }) {
  return (Number(ownCount) || 0) >= (Number(minAds) || 1);
}

/**
 * Resolve a cobertura de uma cidade: estoque próprio + membros dentro do raio
 * (ordenados por distância). `minAds`/`radiusKm` default às envs. Funciona para
 * QUALQUER cidade (region_memberships tem todas as ~5.570 como base) — não
 * depende de `is_ancora` (ao contrário do endpoint público de região).
 */
export async function resolveCityCoverage(citySlug, opts = {}) {
  const minAds = opts.minAds ?? getSitemapMinAds();
  const radiusKm = opts.radiusKm ?? getRegionalRadiusKm();

  const [ownCount, members] = await Promise.all([
    getOwnActiveCount(citySlug),
    getRadiusMembers(citySlug, radiusKm),
  ]);

  return {
    citySlug,
    radiusKm,
    minAds,
    ownCount,
    indexable: decideCityIndexable({ ownCount, minAds }),
    members, // [{ slug, name, state, distance_km }] ordenados por distância
  };
}
