import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { getRegionalRadiusKm } from "../admin/regional-settings/admin-regional-settings.service.js";
import { getSetting } from "../platform/settings.service.js";
import { commercialLayerExpr } from "../ads/filters/ads-ranking.sql.js";

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

// ─── Defaults para configurações de faixa ────────────────────────────────────
const FAIXA_2_DEFAULT = 30;
const FAIXA_3_DEFAULT = 60;

/**
 * Lê os limites de faixa da Página Regional de platform_settings.
 * Retorna { faixa2Km, faixa3Km } sempre como inteiros válidos.
 */
async function getRegionalFaixas() {
  const [f2Raw, f3Raw] = await Promise.all([
    getSetting("regional.faixa_2_km", FAIXA_2_DEFAULT),
    getSetting("regional.faixa_3_km", FAIXA_3_DEFAULT),
  ]);
  const faixa2Km = Number.isFinite(Number(f2Raw)) ? Number(f2Raw) : FAIXA_2_DEFAULT;
  const faixa3Km = Number.isFinite(Number(f3Raw)) ? Number(f3Raw) : FAIXA_3_DEFAULT;
  return { faixa2Km, faixa3Km };
}

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
 *
 * GUARD `rm.layer <= 2` (2026-07-09): a Página Regional (System B) define a
 * vizinhança em ≤60 km. Hoje esta query NÃO tinha teto de distância nem de
 * layer — só o cap de MAX_REGION_MEMBERS — e dependia de a TABELA só conter
 * layers 1/2. Vamos introduzir uma banda LAYER 3 (60–100 km) em
 * `region_memberships`, lida SÓ pelo filtro "Distância (km)" do /comprar
 * (System A). Sem este guard, essas linhas vazariam para a Regional (onde há
 * folga no LIMIT de 30). O guard mantém a Regional intocada em ≤60 km.
 *
 * NO-OP HOJE: enquanto a tabela não tiver linhas de layer 3, `rm.layer <= 2`
 * não filtra nada (todas as linhas não-self já são layer 1 ou 2) — o resultado
 * é byte-a-byte idêntico ao de antes. Por isso este fix é seguro de deployar
 * ANTES do rebuild que popula o layer 3. Usa o índice (base_city_id, layer).
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
      AND rm.layer <= 2
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
    logger.warn({ err: err?.message }, "[regions] falha ao ler radius_km — usando 80 km");
  }

  // DECISÃO DE PRODUTO (2026-07-05): a fonte DESEJADA da vizinhança é
  // `region_memberships` (pré-computado, mesma UF, ≤60km) — NÃO o haversine ao
  // vivo. O haversine SQL abaixo tem um bug latente (bounding box `$3 - $5` com
  // parâmetros sem tipo → "operator is not unique: unknown - unknown"), então
  // hoje ele sempre falha e caímos no fallback. Como o fallback é EXATAMENTE o
  // comportamento que queremos, mantemos assim e apenas rebaixamos o log para
  // `debug` (era `warn`/`info` e poluía a produção a cada cidade). NÃO reativar o
  // haversine ao vivo sem revalidar (mudaria o raio de ≤60km p/ ≤80km do admin).
  // TODO(limpeza futura): remover o haversine morto e chamar
  // findMembersFromMemberships direto (sem a query que sempre falha).
  let rows = null;
  try {
    rows = await findMembersFromHaversine(base, radius);
  } catch (err) {
    logger.debug(
      { err: err?.message, slug: base.slug, radius_km: radius },
      "[regions] haversine indisponível — usando region_memberships (caminho principal)"
    );
    rows = null;
  }

  // Caminho principal: region_memberships (também cobre base sem lat/long).
  if (rows === null || rows.length === 0) {
    logger.debug(
      { slug: base.slug, radius_km: radius, hasCoords: base.latitude != null },
      "[regions] servindo via region_memberships"
    );
    rows = await findMembersFromMemberships(base.id);
  }

  return {
    base: {
      id: Number(base.id),
      slug: base.slug,
      name: base.name,
      state: base.state,
      latitude: base.latitude != null ? Number(base.latitude) : null,
      longitude: base.longitude != null ? Number(base.longitude) : null,
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

/**
 * Resolve a cidade-âncora pelo slug parcial (sem sufixo de UF) + UF.
 *
 * URLs públicas usam `ancoraPart` (ex: "atibaia"); o banco armazena o slug
 * completo "atibaia-sp". Reconstrói o slug e filtra por is_ancora = true
 * para garantir que a cidade tem cobertura regional ativa.
 *
 * Retorna null se:
 *  - slug inválido ou UF inválida
 *  - cidade não existe
 *  - cidade existe mas is_ancora = false (sem anúncios ativos)
 */
export async function getAncoraBySlugPart(ancoraPart, uf) {
  const part = String(ancoraPart || "")
    .trim()
    .toLowerCase();
  const state = String(uf || "")
    .trim()
    .toUpperCase();
  if (!part || !state) return null;

  const fullSlug = `${part}-${state.toLowerCase()}`;
  const result = await pool.query(
    `SELECT id, slug, name, state, latitude, longitude
     FROM cities
     WHERE slug = $1 AND state = $2 AND is_ancora = true
     LIMIT 1`,
    [fullSlug, state]
  );
  return result.rows[0] || null;
}

/**
 * Encontra a cidade-âncora ativa mais próxima de uma coordenada (lat, lng)
 * dentro da mesma UF.
 *
 * Usado para redirecionar o usuário geolocalizado para a Página Regional
 * mais relevante. Filtra is_ancora = true e ordena por distância haversine.
 *
 * Retorna null se:
 *  - lat/lng inválidos
 *  - nenhuma âncora ativa na UF dentro de radius_km (usa o raio do admin)
 */
export async function getCidadeAncoraProxima(lat, lng, uf) {
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng))
  ) {
    return null;
  }

  const baseLat = Number(lat);
  const baseLon = Number(lng);
  const state = String(uf || "")
    .trim()
    .toUpperCase();
  if (!state) return null;

  let radius = 80;
  try {
    radius = await getRegionalRadiusKm();
  } catch (_) {
    // usa 80 km por padrão
  }

  const latDelta = radius / 111.32;

  const result = await pool.query(
    `
    WITH candidates AS (
      SELECT id, slug, name, state, latitude, longitude
      FROM cities
      WHERE state = $1
        AND is_ancora = true
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND latitude BETWEEN $2 - $4 AND $2 + $4
    )
    SELECT
      id, slug, name, state,
      ROUND(
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              sin(radians($2)) * sin(radians(latitude))
              + cos(radians($2)) * cos(radians(latitude))
              * cos(radians(longitude) - radians($3))
            ))
          )
        )::numeric,
        2
      ) AS distance_km
    FROM candidates
    WHERE
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          sin(radians($2)) * sin(radians(latitude))
          + cos(radians($2)) * cos(radians(latitude))
          * cos(radians(longitude) - radians($3))
        ))
      ) <= $5
    ORDER BY distance_km ASC
    LIMIT 1
    `,
    [state, baseLat, baseLon, latDelta, radius]
  );

  return result.rows[0] || null;
}

/**
 * Retorna os anúncios ativos de uma região (âncora + vizinhas) ordenados por
 * faixa de proximidade e camada comercial.
 *
 * Pipeline:
 *   1. Resolve a âncora (getAncoraBySlugPart). 404 se não encontrar.
 *   2. Lê radius_km e faixas de platform_settings.
 *   3. CTE `nearby`: vizinhas haversine dentro do raio na mesma UF.
 *   4. CTE `ranked`: JOIN ads + anunciantes + planos + faixa de distância.
 *   5. Ordena por (faixa ASC, commercial_layer DESC, created_at DESC).
 *   6. Aplica paginação via LIMIT / OFFSET.
 *
 * Parâmetros `options`:
 *   - page      {number}  página (1-based, default 1)
 *   - limit     {number}  itens por página (default 20, max 60)
 *   - status    {string}  default "active"
 *
 * Retorna { ancora, radius_km, total, page, limit, ads } ou null se âncora
 * não existir.
 */
export async function getAnunciosNaRegiao(ancoraPart, uf, options = {}) {
  const ancora = await getAncoraBySlugPart(ancoraPart, uf);
  if (!ancora) return null;

  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(options.limit) || 20));
  const offset = (page - 1) * limit;
  const status = String(options.status || "active");

  let radius = 80;
  try {
    radius = await getRegionalRadiusKm();
  } catch (_) {
    // usa 80 km por padrão
  }

  const { faixa2Km, faixa3Km } = await getRegionalFaixas();

  const baseLat = ancora.latitude != null ? Number(ancora.latitude) : null;
  const baseLon = ancora.longitude != null ? Number(ancora.longitude) : null;
  const hasCoords =
    baseLat != null && baseLon != null && Number.isFinite(baseLat) && Number.isFinite(baseLon);

  const latDelta = hasCoords ? radius / 111.32 : 0;

  // city_ids elegíveis: âncora + vizinhas dentro do raio (mesma UF)
  // Se a âncora não tiver coords, inclui apenas ela mesma.
  let cityIds = [Number(ancora.id)];
  let memberDistances = new Map([[Number(ancora.id), 0]]);

  if (hasCoords) {
    const nearbyResult = await pool.query(
      `
      WITH candidates AS (
        SELECT id,
          ROUND(
            (
              6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                  sin(radians($2)) * sin(radians(latitude))
                  + cos(radians($2)) * cos(radians(latitude))
                  * cos(radians(longitude) - radians($3))
                ))
              )
            )::numeric,
            2
          ) AS distance_km
        FROM cities
        WHERE state = $1
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND latitude BETWEEN $2 - $4 AND $2 + $4
      )
      SELECT id, distance_km
      FROM candidates
      WHERE distance_km <= $5
      ORDER BY distance_km ASC
      LIMIT $6
      `,
      [ancora.state, baseLat, baseLon, latDelta, radius, MAX_REGION_MEMBERS + 1]
    );
    cityIds = nearbyResult.rows.map((r) => Number(r.id));
    if (!cityIds.includes(Number(ancora.id))) cityIds.unshift(Number(ancora.id));
    memberDistances = new Map(nearbyResult.rows.map((r) => [Number(r.id), Number(r.distance_km)]));
    memberDistances.set(Number(ancora.id), 0);
  }

  const commercialExpr = commercialLayerExpr("sp", "u", "plans");

  const result = await pool.query(
    `
    WITH city_dist AS (
      SELECT
        unnest($1::int[]) AS city_id,
        unnest($2::numeric[]) AS distance_km
    ),
    ranked AS (
      SELECT
        a.id,
        a.slug,
        a.title,
        a.price,
        a.brand,
        a.model,
        a.year,
        a.mileage,
        a.fuel_type,
        a.body_type,
        a.city_id,
        a.created_at,
        cd.distance_km,
        CASE
          WHEN cd.distance_km = 0            THEN 0
          WHEN cd.distance_km <= $3          THEN 1
          WHEN cd.distance_km <= $4          THEN 2
          ELSE                                    3
        END AS faixa,
        ${commercialExpr} AS commercial_layer
      FROM ads a
      JOIN city_dist cd ON cd.city_id = a.city_id
      LEFT JOIN advertisers sp ON sp.id = a.advertiser_id
      LEFT JOIN users u ON u.id = sp.user_id
      LEFT JOIN subscription_plans plans ON plans.id = u.plan_id
      WHERE a.status = $5
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM ranked
    ORDER BY faixa ASC, commercial_layer DESC, created_at DESC
    LIMIT $6 OFFSET $7
    `,
    [
      cityIds,
      cityIds.map((id) => memberDistances.get(id) ?? 0),
      faixa2Km,
      faixa3Km,
      status,
      limit,
      offset,
    ]
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const ads = result.rows.map(({ total_count, faixa, commercial_layer, ...ad }) => ({
    ...ad,
    price: ad.price == null ? null : Number(ad.price),
    faixa: Number(faixa),
    commercial_layer: Number(commercial_layer),
    distance_km: memberDistances.get(Number(ad.city_id)) ?? null,
  }));

  return {
    ancora: {
      id: Number(ancora.id),
      slug: ancora.slug,
      name: ancora.name,
      state: ancora.state,
    },
    radius_km: radius,
    total,
    page,
    limit,
    ads,
  };
}
