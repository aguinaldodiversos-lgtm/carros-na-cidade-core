import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { findCitiesByStateVariants } from "../cities/cities.repository.js";

import { getRegionByBaseSlugDynamic } from "./regions.service.js";

/**
 * Service: regiões destacadas por UF.
 *
 * Endpoint público que alimenta o bloco "Explore por região" na Página
 * Estadual (e CTAs leves na Home). A política territorial é:
 *
 *   - Estado dá volume e SEO macro; conduz para regiões.
 *   - Região é o destino transacional principal.
 *   - Cidade é restrição local.
 *
 * Por isso a Página Estadual não pode promover só cidades — ela tem que
 * destacar REGIÕES, e cada região é uma cidade-base + vizinhos próximos
 * computados pelo mesmo pipeline da Página Regional (raio configurável
 * via platform_settings).
 *
 * Pipeline:
 *   1. Lista cidades candidatas do UF (ordem: ranking_priority desc do
 *      city_scores, depois name asc). Cap em CANDIDATE_POOL_SIZE para
 *      manter número de RTTs previsível.
 *   2. Para cada candidata, resolve a região via
 *      `getRegionByBaseSlugDynamic` (haversine SQL + fallback memberships).
 *      Deduplica: se Itatiba já está como membro da Região de Atibaia,
 *      Itatiba NÃO vira base de uma região concorrente.
 *   3. Conta anúncios (active + featured) das cidades de TODAS as regiões
 *      em UMA SQL agregada (sem N+1).
 *   4. Ordena por adsCount desc, featuredCount desc, baseCityName asc.
 *   5. Trunca para `maxRegions` (default 8, hard cap 12).
 *
 * Trade-offs:
 *   - Até N chamadas ao haversine SQL por request descacheada (N =
 *     CANDIDATE_POOL_SIZE = 20). Aceitável porque a rota é cacheada em
 *     Redis pelo middleware `cacheGet` (TTL 300 s).
 *   - O dedup é greedy: a primeira região encontrada pega seus membros;
 *     uma cidade que seria base de uma região maior perde a chance se já
 *     foi engolida. Aceitável — a ordem das candidatas (por demanda) faz
 *     com que as regiões mais relevantes apareçam primeiro.
 *
 * Saída (shape do contrato público):
 *   {
 *     slug: "atibaia-sp",
 *     name: "Região de Atibaia",
 *     baseCitySlug: "atibaia-sp",
 *     baseCityName: "Atibaia",
 *     href: "/carros-usados/regiao/atibaia-sp",
 *     cityNames: ["Atibaia", "Bragança Paulista", ...],
 *     citySlugs: ["atibaia-sp", "braganca-paulista-sp", ...],
 *     adsCount: 12,
 *     featuredCount: 2,
 *     radiusKm: 80
 *   }
 *
 * Retorna `null` se UF inválida — o controller transforma em 400.
 * Retorna `[]` se UF válida sem cidades — o frontend suprime o bloco.
 */

const DEFAULT_MAX_REGIONS = 8;
const HARD_CAP_REGIONS = 12;
const CANDIDATE_POOL_SIZE = 20;

function normalizeUf(uf) {
  return String(uf || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
}

async function countAdsByCitySlugs(citySlugs) {
  if (!citySlugs.length) return new Map();
  try {
    const result = await pool.query(
      `SELECT
         c.slug,
         COUNT(*) FILTER (WHERE a.status = 'active')::int AS active_count,
         COUNT(*) FILTER (
           WHERE a.status = 'active'
             AND a.highlight_until IS NOT NULL
             AND a.highlight_until > NOW()
         )::int AS featured_count
       FROM ads a
       JOIN cities c ON c.id = a.city_id
       WHERE c.slug = ANY($1::text[])
       GROUP BY c.slug`,
      [citySlugs]
    );

    const map = new Map();
    for (const row of result.rows) {
      map.set(row.slug, {
        active: Number(row.active_count) || 0,
        featured: Number(row.featured_count) || 0,
      });
    }
    return map;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), citySlugCount: citySlugs.length },
      "[state-regions] countAdsByCitySlugs falhou — contagens viram 0"
    );
    return new Map();
  }
}

export async function listFeaturedRegionsByUf(uf, options = {}) {
  const ufNorm = normalizeUf(uf);
  if (ufNorm.length !== 2) return null;

  const maxRegions = Math.min(
    HARD_CAP_REGIONS,
    Math.max(1, Number(options.maxRegions) || DEFAULT_MAX_REGIONS)
  );

  // 1. Candidatas
  const allCities = await findCitiesByStateVariants(ufNorm);
  if (!Array.isArray(allCities) || allCities.length === 0) return [];
  const candidates = allCities.slice(0, CANDIDATE_POOL_SIZE);

  // 2. Resolve regiões + dedup
  const regions = [];
  const consumedSlugs = new Set();

  for (const city of candidates) {
    if (consumedSlugs.has(city.slug)) continue;

    let region;
    try {
      region = await getRegionByBaseSlugDynamic(city.slug);
    } catch (err) {
      logger.warn(
        { err: err?.message || String(err), slug: city.slug },
        "[state-regions] getRegionByBaseSlugDynamic falhou — pulando candidata"
      );
      continue;
    }

    if (!region || !region.base) continue;

    // Contenção territorial: NUNCA promover região cuja base é de outra UF.
    // Defesa em profundidade — o pipeline regional já filtra members na
    // mesma UF, mas a base pode ser de UF diferente se a candidata vier
    // de match por sufixo de slug em vez de coluna state.
    if (normalizeUf(region.base.state) !== ufNorm) continue;

    regions.push(region);
    consumedSlugs.add(region.base.slug);
    for (const member of region.members) {
      // Só consome membros da mesma UF — defesa contra fronteira.
      if (normalizeUf(member.state) === ufNorm) {
        consumedSlugs.add(member.slug);
      }
    }

    if (regions.length >= maxRegions * 2) break;
  }

  if (regions.length === 0) return [];

  // 3. Contagem agregada
  const allCitySlugs = new Set();
  for (const region of regions) {
    allCitySlugs.add(region.base.slug);
    for (const member of region.members) {
      if (normalizeUf(member.state) === ufNorm) {
        allCitySlugs.add(member.slug);
      }
    }
  }

  const countsBySlug = await countAdsByCitySlugs(Array.from(allCitySlugs));

  // 4. Monta summaries + ordena
  const summaries = regions.map((region) => {
    let adsCount = countsBySlug.get(region.base.slug)?.active ?? 0;
    let featuredCount = countsBySlug.get(region.base.slug)?.featured ?? 0;

    const cityNames = [region.base.name];
    const citySlugs = [region.base.slug];

    for (const member of region.members) {
      if (normalizeUf(member.state) !== ufNorm) continue;
      adsCount += countsBySlug.get(member.slug)?.active ?? 0;
      featuredCount += countsBySlug.get(member.slug)?.featured ?? 0;
      cityNames.push(member.name);
      citySlugs.push(member.slug);
    }

    return {
      slug: region.base.slug,
      name: `Região de ${region.base.name}`,
      baseCitySlug: region.base.slug,
      baseCityName: region.base.name,
      href: `/carros-usados/regiao/${region.base.slug}`,
      cityNames,
      citySlugs,
      adsCount,
      featuredCount,
      radiusKm: Number.isFinite(Number(region.radius_km)) ? Number(region.radius_km) : null,
    };
  });

  summaries.sort((a, b) => {
    if (b.adsCount !== a.adsCount) return b.adsCount - a.adsCount;
    if (b.featuredCount !== a.featuredCount) return b.featuredCount - a.featuredCount;
    return a.baseCityName.localeCompare(b.baseCityName, "pt-BR");
  });

  return summaries.slice(0, maxRegions);
}
