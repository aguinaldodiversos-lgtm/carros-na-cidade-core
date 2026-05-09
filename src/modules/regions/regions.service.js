import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { getRegionalRadiusKm } from "../admin/regional-settings/admin-regional-settings.service.js";

/**
 * Cap de membros retornados pela API regional.
 *
 * Mantido sincronizado com:
 *  - frontend/lib/regions/fetch-region.ts (MAX_CITY_SLUGS = 30)
 *  - src/modules/ads/filters/ads-filter.constants.js (CITY_SLUGS_MAX = 30)
 *
 * Cap aplicado AOS MEMBROS (não ao total) — a cidade base é injetada
 * separadamente pelo frontend (regionToAdsSearchFilters em fetch-region.ts).
 * Backend retorna até 29 membros para o frontend cobrir o cap de 30 slots
 * com base + 29 vizinhos. Conservador: usar 30 aqui também não quebra
 * (frontend deduplica e respeita o teto), mas 30 + 1 base = 31 slugs
 * pode estourar a validação Zod do /api/ads/search. Manter 30 e deixar
 * frontend gerenciar é mais seguro.
 */
const MAX_REGION_MEMBERS = 30;

/**
 * Lê a cidade-base por slug. Retorna null se não existir.
 */
async function findBaseCity(slug) {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;
  const result = await pool.query(
    `SELECT id, slug, name, state, latitude, longitude
     FROM cities
     WHERE slug = $1
     LIMIT 1`,
    [safeSlug]
  );
  return result.rows[0] || null;
}

/**
 * Busca vizinhos via region_memberships (fallback estático). Layer 1 ≤30 km,
 * layer 2 entre 30–60 km. Pré-computado offline. Sempre disponível mesmo
 * que cities.latitude/longitude esteja vazio.
 */
async function findMembersFromMemberships(baseCityId) {
  const result = await pool.query(
    `
    SELECT
      c.id        AS city_id,
      c.slug      AS slug,
      c.name      AS name,
      c.state     AS state,
      rm.layer    AS layer,
      rm.distance_km AS distance_km
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    WHERE rm.base_city_id = $1
      AND rm.member_city_id != $1
    ORDER BY rm.layer ASC, rm.distance_km ASC NULLS LAST, c.name ASC
    LIMIT $2
    `,
    [baseCityId, MAX_REGION_MEMBERS]
  );
  return result.rows;
}

/**
 * Busca vizinhos dinamicamente via haversine SQL contra cities.latitude /
 * longitude, dado um raio em km e uma cidade-base com coordenadas.
 *
 * Decisões:
 *  - Filtra por mesma UF (`c.state = base.state`). Contenção territorial
 *    obrigatória: a Página Regional NÃO pode listar cidades de outro
 *    estado mesmo que estejam dentro do raio (regra de produto).
 *  - Excluir a cidade-base do resultado (`c.id != base.id`).
 *  - Bounding box em latitude antes do acos para usar índice futuro em
 *    latitude (B-tree). Sem índice GIST/PostGIS — não dependemos de
 *    extensão extra.
 *  - 1° de latitude ≈ 111 km. Para um raio R em km, latitude varia em
 *    R/111. Bounding box em longitude é assimétrico (depende de cos(lat))
 *    — mantemos só latitude por simplicidade; o filtro acos faz a
 *    poda final.
 *  - Distância via fórmula esférica acos(sin*sin + cos*cos*cos(Δlong))
 *    em radianos × 6371 (raio da Terra em km).
 *  - Layer derivado da distância: ≤30 km → 1, 30–60 km → 2, >60 km → 3.
 *    Mantém compatibilidade com clientes que esperam o campo `layer`.
 *
 * Retorna [] se a cidade-base não tiver lat/long ou se nenhuma vizinha
 * estiver dentro do raio.
 */
async function findMembersFromHaversine(base, radiusKm) {
  if (
    base.latitude == null ||
    base.longitude == null ||
    !Number.isFinite(Number(base.latitude)) ||
    !Number.isFinite(Number(base.longitude))
  ) {
    return null; // sinaliza "não dá para haversine" ao caller
  }

  const baseLat = Number(base.latitude);
  const baseLon = Number(base.longitude);
  const radius = Number(radiusKm);
  // 111 km por grau de latitude no equador; usar 111.32 como aproximação
  // suficiente para bounding box (não para distância final).
  const latDelta = radius / 111.32;

  const result = await pool.query(
    `
    WITH candidates AS (
      SELECT
        c.id, c.slug, c.name, c.state,
        c.latitude, c.longitude
      FROM cities c
      WHERE c.id != $1
        AND c.state = $2
        AND c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND c.latitude BETWEEN $3 - $5 AND $3 + $5
    )
    SELECT
      id   AS city_id,
      slug,
      name,
      state,
      ROUND(
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              sin(radians($3)) * sin(radians(latitude))
              + cos(radians($3)) * cos(radians(latitude))
              * cos(radians(longitude) - radians($4))
            ))
          )
        )::numeric,
        2
      ) AS distance_km
    FROM candidates
    WHERE
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          sin(radians($3)) * sin(radians(latitude))
          + cos(radians($3)) * cos(radians(latitude))
          * cos(radians(longitude) - radians($4))
        ))
      ) <= $6
    ORDER BY distance_km ASC, name ASC
    LIMIT $7
    `,
    [base.id, base.state, baseLat, baseLon, latDelta, radius, MAX_REGION_MEMBERS]
  );

  return result.rows.map((row) => {
    const dist = row.distance_km == null ? null : Number(row.distance_km);
    let layer = 3;
    if (dist != null) {
      if (dist <= 30) layer = 1;
      else if (dist <= 60) layer = 2;
      else layer = 3;
    }
    return { ...row, layer };
  });
}

/**
 * Lê a região aproximada de uma cidade-base (versão legada baseada em
 * region_memberships pré-computado).
 *
 * Mantida exportada para consumidores que dependem do comportamento fixo
 * (workers, jobs offline, dashboards). A rota pública agora usa
 * `getRegionByBaseSlugDynamic`.
 */
export async function getRegionByBaseSlug(slug) {
  const base = await findBaseCity(slug);
  if (!base) return null;

  const rows = await findMembersFromMemberships(base.id);

  return {
    base: {
      id: Number(base.id),
      slug: base.slug,
      name: base.name,
      state: base.state,
    },
    members: rows.map((row) => ({
      city_id: Number(row.city_id),
      slug: row.slug,
      name: row.name,
      state: row.state,
      layer: Number(row.layer),
      distance_km: row.distance_km == null ? null : Number(row.distance_km),
    })),
  };
}

/**
 * Lê a região aproximada com raio dinâmico do `platform_settings`
 * (default 80 km, range 10..150 km, editável via /api/admin/regional-settings).
 *
 * Pipeline:
 *   1. Encontra a cidade-base por slug (404 se não existir).
 *   2. Lê radius_km de platform_settings (cache 60 s no service).
 *   3. Tenta haversine SQL contra cities.latitude/longitude na MESMA UF.
 *   4. Se haversine retorna null (base sem lat/long), [] (nenhuma vizinha
 *      dentro do raio) ou falha de SQL, faz FALLBACK para
 *      region_memberships pré-computado.
 *   5. Cap em MAX_REGION_MEMBERS.
 *
 * Shape de resposta IDÊNTICO ao getRegionByBaseSlug — frontend BFF e smoke
 * tests não precisam mudar.
 */
export async function getRegionByBaseSlugDynamic(slug) {
  const base = await findBaseCity(slug);
  if (!base) return null;

  let radius = 80;
  try {
    radius = await getRegionalRadiusKm();
  } catch (err) {
    logger.warn(
      { err: err?.message },
      "[regions] falha ao ler radius_km — usando 80 km"
    );
  }

  let rows = null;
  try {
    rows = await findMembersFromHaversine(base, radius);
  } catch (err) {
    logger.warn(
      { err: err?.message, slug: base.slug, radius_km: radius },
      "[regions] haversine falhou — caindo para region_memberships"
    );
    rows = null;
  }

  // Fallback: base sem lat/long, haversine vazio, ou erro.
  if (rows === null || rows.length === 0) {
    logger.info(
      { slug: base.slug, radius_km: radius, hasCoords: base.latitude != null },
      "[regions] usando fallback region_memberships"
    );
    rows = await findMembersFromMemberships(base.id);
  }

  return {
    base: {
      id: Number(base.id),
      slug: base.slug,
      name: base.name,
      state: base.state,
    },
    radius_km: radius,
    members: rows.map((row) => ({
      city_id: Number(row.city_id),
      slug: row.slug,
      name: row.name,
      state: row.state,
      layer: Number(row.layer),
      distance_km: row.distance_km == null ? null : Number(row.distance_km),
    })),
  };
}
