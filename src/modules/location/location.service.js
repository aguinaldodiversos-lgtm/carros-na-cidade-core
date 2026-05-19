import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { getRegionByBaseSlugDynamic } from "../regions/regions.service.js";

/**
 * Service: resolução de localização (coordenadas → cidade + região).
 *
 * Objetivo: dado um par lat/long, encontrar a cidade brasileira mais
 * próxima usando haversine SQL contra `cities.latitude/longitude`,
 * dentro de um raio máximo. Retorna a região consolidada (cidade-base +
 * vizinhos) reaproveitando `getRegionByBaseSlugDynamic` (mesma fonte de
 * verdade da Página Regional).
 *
 * Princípios:
 *   - Sem PII: coordenadas NUNCA são gravadas em banco nem em log
 *     estruturado. O caller (BFF) também deve evitar logar o body cru.
 *   - Threshold rigoroso: cidade só é retornada se a distância ≤
 *     MAX_DISTANCE_KM. Acima disso, devolvemos `null` e o frontend cai
 *     em fallback estadual ou escolha manual.
 *   - Não inferir UF: a cidade-base traz a própria UF. Não combinamos
 *     cidades de UFs diferentes.
 *
 * Trade-offs:
 *   - O `SELECT ... ORDER BY distance LIMIT 1` percorre o subset filtrado
 *     pelo bounding box em latitude (`BETWEEN $1-Δ AND $1+Δ`). É O(N) no
 *     número de cidades dentro do bbox — aceitável (~poucas centenas em
 *     SP grande, ainda mais com índice futuro em latitude).
 *   - Sem GIST/PostGIS para não exigir extensão no Render gratuito.
 *
 * Confidence levels:
 *   - high   → distância ≤ 30 km (mesma faixa do layer 1 regional)
 *   - medium → 30 < distância ≤ 60 km
 *   - low    → 60 < distância ≤ 80 km
 *   - null   → > 80 km, o caller deve usar fallback estadual
 */

const MAX_DISTANCE_KM = 80;
const EARTH_RADIUS_KM = 6371;
const DEG_LAT_KM = 111.32; // graus → km de latitude (aproximação no equador)

function isValidLat(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLng(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function classifyConfidence(distanceKm) {
  if (distanceKm <= 30) return "high";
  if (distanceKm <= 60) return "medium";
  if (distanceKm <= MAX_DISTANCE_KM) return "low";
  return null;
}

/**
 * Acha a cidade brasileira mais próxima de (lat, lng) dentro de
 * MAX_DISTANCE_KM. Retorna `null` se nada confiável estiver no raio.
 *
 * Não persiste coordenadas. Não loga coordenadas. Loga apenas o resultado
 * agregado (city_slug, distance_km arredondado) para diagnóstico.
 */
export async function findNearestCity(latitude, longitude) {
  if (!isValidLat(latitude) || !isValidLng(longitude)) return null;

  const latDelta = MAX_DISTANCE_KM / DEG_LAT_KM;

  let row = null;
  try {
    const result = await pool.query(
      `
      WITH candidates AS (
        SELECT
          c.id, c.slug, c.name, c.state,
          c.latitude, c.longitude
        FROM cities c
        WHERE c.latitude IS NOT NULL
          AND c.longitude IS NOT NULL
          AND c.latitude BETWEEN $1 - $3 AND $1 + $3
      )
      SELECT
        id, slug, name, state,
        ROUND(
          (
            ${EARTH_RADIUS_KM} * acos(
              LEAST(1.0, GREATEST(-1.0,
                sin(radians($1)) * sin(radians(latitude))
                + cos(radians($1)) * cos(radians(latitude))
                * cos(radians(longitude) - radians($2))
              ))
            )
          )::numeric,
          2
        ) AS distance_km
      FROM candidates
      WHERE
        ${EARTH_RADIUS_KM} * acos(
          LEAST(1.0, GREATEST(-1.0,
            sin(radians($1)) * sin(radians(latitude))
            + cos(radians($1)) * cos(radians(latitude))
            * cos(radians(longitude) - radians($2))
          ))
        ) <= $4
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [latitude, longitude, latDelta, MAX_DISTANCE_KM]
    );
    row = result.rows[0] || null;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[location] haversine SQL falhou"
    );
    return null;
  }

  if (!row) return null;

  return {
    city: {
      id: Number(row.id),
      slug: row.slug,
      name: row.name,
      state: row.state,
    },
    distanceKm: Number(row.distance_km) || 0,
  };
}

/**
 * Resolve a localização completa: cidade mais próxima + região + estado +
 * confidence. Não retorna coordenadas, apenas o resultado consolidado.
 *
 * Saída:
 *   { city, state, region, confidence, distanceKm }
 *   ou
 *   null (fora de cobertura, dados inválidos, ou erro)
 *
 * O `region` pode ser `null` mesmo com cidade encontrada — significa que
 * a Região da cidade-base não tem vizinhos resolvíveis no momento. O
 * caller decide o que mostrar (ainda dá para sugerir a cidade isolada).
 */
export async function resolveLocation(latitude, longitude) {
  const nearest = await findNearestCity(latitude, longitude);
  if (!nearest) return null;

  const confidence = classifyConfidence(nearest.distanceKm);
  if (!confidence) return null;

  let region = null;
  try {
    const regionPayload = await getRegionByBaseSlugDynamic(nearest.city.slug);
    if (regionPayload && regionPayload.base) {
      region = {
        slug: regionPayload.base.slug,
        name: `Região de ${regionPayload.base.name}`,
        href: `/carros-usados/regiao/${regionPayload.base.slug}`,
        memberCount: Array.isArray(regionPayload.members)
          ? regionPayload.members.length
          : 0,
      };
    }
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), citySlug: nearest.city.slug },
      "[location] falha ao resolver região — retornando só cidade/estado"
    );
    region = null;
  }

  const stateCode = String(nearest.city.state || "").toUpperCase().slice(0, 2);

  // Log SEM coordenadas — só city_slug + distância arredondada + confidence.
  // Útil para diagnóstico de cobertura sem expor PII.
  logger.info(
    {
      citySlug: nearest.city.slug,
      distanceKm: Math.round(nearest.distanceKm),
      confidence,
      hasRegion: Boolean(region),
    },
    "[location] resolved"
  );

  return {
    city: {
      slug: nearest.city.slug,
      name: nearest.city.name,
      state: stateCode,
    },
    state: {
      code: stateCode,
      slug: stateCode.toLowerCase(),
    },
    region,
    confidence,
    distanceKm: nearest.distanceKm,
  };
}

export const __INTERNAL__ = {
  MAX_DISTANCE_KM,
  classifyConfidence,
  isValidLat,
  isValidLng,
};
