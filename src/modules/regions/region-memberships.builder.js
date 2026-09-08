// src/modules/regions/region-memberships.builder.js
//
// Construtor de `region_memberships` — Search Policy Engine v2.1, Fase F1 (§3.1).
//
// ────────────────────────────────────────────────────────────────────────────
// O QUE MUDOU EM RELAÇÃO AO BUILD ANTIGO (scripts/build-region-memberships.mjs
// até 65bc2e95) E POR QUÊ
// ────────────────────────────────────────────────────────────────────────────
//   • A fronteira de UF caiu. Bragança Paulista-SP está a 25,4 km de
//     Extrema-MG e a tabela nunca registrou o par (auditoria §7.5, A2:
//     `COUNT(*) WHERE b.state <> m.state` = 0). O motor de busca precisa do
//     par para expandir por raio.
//   • O alcance subiu de 100 para 150 km (teto do anel automático).
//   • Os tetos por camada NÃO limitam mais quais pares existem — todo par
//     ≤ 150 km é gravado. O motor (F2) elege território por `distance_km`,
//     não por `layer`.
//
// ────────────────────────────────────────────────────────────────────────────
// COMPATIBILIDADE (R4): `layer` É O CONTRATO DOS LEITORES LEGADOS
// ────────────────────────────────────────────────────────────────────────────
// Nenhum leitor fora do motor novo enxerga as linhas novas: a página regional
// filtra `layer <= 2` e os leitores por distância receberam `layer <= 3` na F1
// (getRadiusMembers, findRadiusDonor, hasRegionMemberships). Para esses
// leitores serem byte a byte iguais ao pré-F1, o conjunto `layer <= 3` DEPOIS
// do rebuild tem de ser EXATAMENTE o conjunto de linhas que existia ANTES.
// Três regras garantem isso:
//
//   1. Linha que já existe na tabela MANTÉM o `layer` gravado. A distância é
//      recomputada pela mesma fórmula, logo dá o mesmo valor. Vale sobretudo
//      para o layer 3: em produção ele só existe para 180 bases (o build
//      antigo rodou parcialmente com essa banda). Reproduzir a "regra"
//      (60–100 km, top 40) daria layer 3 a ~5.500 bases que hoje não o têm,
//      e `layer <= 3` passaria a devolver outro conjunto.
//   2. Sobre tabela JÁ POVOADA (`freezeLegacyLayer3`), linha nova recebe layer
//      1 ou 2 só pela regra antiga (mesma UF, ≤30 / 30–60 km, top 12 / 18 por
//      distância) — e NUNCA layer 3. Em produção nenhuma linha nova cai nos
//      layers 1/2: eles já estavam completos (EXCEPT vazio nos dois sentidos).
//      É o layer 3 que exige a trava: ele existe hoje para só 180 bases (a
//      banda 60–100 km foi construída parcialmente), e reproduzir a regra
//      daria layer 3 a milhares de bases, inflando `layer <= 3` de 101.909
//      para ~339.000 linhas. Medido: mesmo a variante "só para base sem
//      vizinhança" criava 283 linhas novas em 122 cidades isoladas, que
//      passariam a ter vizinhança onde hoje não têm — mudando inclusive o
//      caminho de código (`hasRegionMemberships`).
//   3. Sobre tabela SEM nenhuma vizinha gravada (CI, instalação nova) não há
//      "antes" a preservar: vale a regra antiga COMPLETA, inclusive o layer 3
//      (60–100 km, top 40), introduzido em 2026-07 para os stops de 75/100 km
//      do filtro de distância. É o que os testes de `pickRegionMembers` fixam.
//   4. Toda outra linha nova (outra UF, além dos tetos, fora da faixa legada)
//      recebe `layer = 4` (`LAYER_EXTENDED`).
//
// Consequência conhecida, registrada para a F3: cidade que ganhar coordenadas
// DEPOIS deste rebuild recebe layer 4 na faixa 60–100 km, então aparece com
// menos vizinhas em `?raio=75/100` do que o algoritmo antigo daria. É o lado
// conservador (nunca mostra a mais) e some quando o motor novo assumir.
//
// A self-row (`base = member`, `layer 0`, `distance_km 0`) é gerada para TODA
// cidade, com ou sem coordenadas — a migration 021 fazia isso no backfill e a
// quarentena BUG-REG-01 registrou que cidade nova nunca a ganhava.
//
// Este módulo é puro onde possível (testável sem Postgres); as funções que
// tocam o banco recebem o `pool`/`client` por parâmetro.

const EARTH_RADIUS_KM = 6371;

/** Alcance máximo gravado (km). Anel automático máximo da política (§2). */
export const MAX_DISTANCE_KM = 150;

/** Faixas legadas — regra antiga, preservada. */
export const LEGACY_LAYER_1_MAX_KM = 30;
export const LEGACY_LAYER_2_MAX_KM = 60;
export const LEGACY_LAYER_3_MAX_KM =
  Number.parseInt(String(process.env.REGIONAL_LAYER3_MAX_KM ?? "100"), 10) || 100;

function parsePositiveInt(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
export const LEGACY_LAYER_1_MAX_MEMBERS = parsePositiveInt(
  process.env.REGIONAL_LAYER1_MAX_MEMBERS,
  12
);
export const LEGACY_LAYER_2_MAX_MEMBERS = parsePositiveInt(
  process.env.REGIONAL_LAYER2_MAX_MEMBERS,
  18
);
export const LEGACY_LAYER_3_MAX_MEMBERS = parsePositiveInt(
  process.env.REGIONAL_LAYER3_MAX_MEMBERS,
  40
);

/** Maior layer que os leitores legados enxergam (guard `layer <= 3` da F1). */
export const LEGACY_MAX_LAYER = 3;

/** Linha que o build antigo não produziria (outra UF, além dos tetos, fora das faixas legadas). */
export const LAYER_EXTENDED = 4;

/** Faixas usadas nos relatórios de contagem (km). */
export const REPORT_BANDS = Object.freeze([25, 50, 75, 100, 150]);

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Haversine, R = 6371 km. Erro da Terra-esfera < 0,5 % — irrelevante aqui. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Arredondamento a 2 casas, como a coluna `distance_km` sempre foi gravada. */
export function roundKm(km) {
  return Number(km.toFixed(2));
}

/**
 * Camada da regra antiga por distância. `null` = fora das faixas legadas.
 *
 * `includeLayer3`: o layer 3 (60–100 km) só é atribuível a base SEM vizinhança
 * gravada (regra 3 do cabeçalho). Para base já construída, a faixa 60–100 km
 * vira layer 4 — do contrário o guard `layer <= 3` passaria a enxergar
 * milhares de linhas novas.
 */
export function classifyLegacyLayer(distanceKm, { includeLayer3 = true } = {}) {
  if (distanceKm <= LEGACY_LAYER_1_MAX_KM) return 1;
  if (distanceKm <= LEGACY_LAYER_2_MAX_KM) return 2;
  if (includeLayer3 && distanceKm <= LEGACY_LAYER_3_MAX_KM) return 3;
  return null;
}

function hasCoords(city) {
  return (
    city != null &&
    city.latitude != null &&
    city.longitude != null &&
    Number.isFinite(Number(city.latitude)) &&
    Number.isFinite(Number(city.longitude))
  );
}

function sameState(a, b) {
  return String(a.state || "").toUpperCase() === String(b.state || "").toUpperCase();
}

export function membershipKey(row) {
  return `${row.base_city_id}:${row.member_city_id}`;
}

/**
 * Bounding box grosseiro antes do haversine: 1° de latitude ≈ 111 km; em
 * longitude o grau encolhe com cos(lat). Folga de 5 % para não podar par
 * legítimo na borda.
 */
function withinBoundingBox(base, candidate, maxKm) {
  const dLat = Math.abs(Number(candidate.latitude) - Number(base.latitude));
  if (dLat > (maxKm / 111) * 1.05) return false;
  const cosLat = Math.max(0.2, Math.cos(toRadians(Number(base.latitude))));
  const dLon = Math.abs(Number(candidate.longitude) - Number(base.longitude));
  return dLon <= (maxKm / (111 * cosLat)) * 1.05;
}

/**
 * Todas as memberships de UMA cidade-base (exclui a self-row).
 *
 * @param {{id, state, latitude, longitude}} baseCity
 * @param {Array<{id, state, latitude, longitude}>} candidates todas as cidades
 * @param {{ maxKm?: number, existingLayerByKey?: Map<string, number>, allowLegacyLayer3?: boolean }} [options]
 *   `existingLayerByKey`: layer já gravado por chave `base:member` — preservado
 *   (regra 1 do cabeçalho). `allowLegacyLayer3`: base sem vizinhança gravada
 *   recebe a regra antiga completa, com layer 3 (regra 3); default `true`, que
 *   é o comportamento do build do zero.
 * @returns {Array<{member_city_id:number, distance_km:number, layer:number}>}
 *   ordenado por distance_km ASC, member_city_id ASC.
 */
export function buildMembershipsForBase(
  baseCity,
  candidates,
  { maxKm = MAX_DISTANCE_KM, existingLayerByKey = null, allowLegacyLayer3 = true } = {}
) {
  if (!hasCoords(baseCity)) return [];

  const rows = [];
  for (const candidate of candidates) {
    if (candidate.id === baseCity.id) continue;
    if (!hasCoords(candidate)) continue;
    if (!withinBoundingBox(baseCity, candidate, maxKm)) continue;

    const km = haversineKm(
      Number(baseCity.latitude),
      Number(baseCity.longitude),
      Number(candidate.latitude),
      Number(candidate.longitude)
    );
    if (km > maxKm) continue;

    rows.push({
      member_city_id: candidate.id,
      distance_km: roundKm(km),
      layer: LAYER_EXTENDED,
      _sameState: sameState(baseCity, candidate),
      _rawKm: km,
    });
  }

  // Regras 2 e 3 — linha nova ganha layer pela regra antiga (mesma UF, faixas
  // fixas, top-K por distância crua; o build antigo ordenava pelo valor não
  // arredondado e gravava com 2 casas). O layer 3 só entra em base sem
  // vizinhança gravada.
  const legacyBuckets = { 1: [], 2: [], 3: [] };
  for (const row of rows) {
    if (!row._sameState) continue;
    const layer = classifyLegacyLayer(row._rawKm, { includeLayer3: allowLegacyLayer3 });
    if (layer) legacyBuckets[layer].push(row);
  }
  const caps = {
    1: LEGACY_LAYER_1_MAX_MEMBERS,
    2: LEGACY_LAYER_2_MAX_MEMBERS,
    3: LEGACY_LAYER_3_MAX_MEMBERS,
  };
  for (const layer of [1, 2, 3]) {
    legacyBuckets[layer].sort((a, b) => a._rawKm - b._rawKm);
    for (const row of legacyBuckets[layer].slice(0, caps[layer])) row.layer = layer;
  }

  // Regra 1 — linha já existente mantém o layer gravado (vence a regra 2).
  if (existingLayerByKey && existingLayerByKey.size) {
    for (const row of rows) {
      const existing = existingLayerByKey.get(`${baseCity.id}:${row.member_city_id}`);
      if (existing != null) row.layer = Number(existing);
    }
  }

  rows.sort((a, b) => a.distance_km - b.distance_km || a.member_city_id - b.member_city_id);
  return rows.map(({ member_city_id, distance_km, layer }) => ({
    member_city_id,
    distance_km,
    layer,
  }));
}

/**
 * Compatibilidade com o contrato antigo de `pickRegionMembers`: só as linhas
 * que os leitores legados enxergam (`layer <= 3`). Usado pelos testes históricos.
 */
export function pickLegacyRegionMembers(baseCity, candidates, options = {}) {
  return buildMembershipsForBase(baseCity, candidates, options).filter(
    (r) => r.layer <= LEGACY_MAX_LAYER
  );
}

/**
 * Conjunto completo para TODAS as cidades: self-rows (inclusive sem coords)
 * + pares ≤ 150 km.
 *
 * @returns {{ rows: Array<{base_city_id, member_city_id, distance_km, layer}>, stats }}
 */
export function buildAllMemberships(
  cities,
  { existingLayerByKey = null, freezeLegacyLayer3 = false } = {}
) {
  const rows = [];
  let basesWithCoords = 0;
  let basesWithoutCoords = 0;

  for (const base of cities) {
    rows.push({ base_city_id: base.id, member_city_id: base.id, distance_km: 0, layer: 0 });
    if (!hasCoords(base)) {
      basesWithoutCoords += 1;
      continue;
    }
    basesWithCoords += 1;
    for (const m of buildMembershipsForBase(base, cities, {
      existingLayerByKey,
      allowLegacyLayer3: !freezeLegacyLayer3,
    })) {
      rows.push({ base_city_id: base.id, member_city_id: m.member_city_id, ...m });
    }
  }

  return {
    rows,
    stats: { cities: cities.length, basesWithCoords, basesWithoutCoords, freezeLegacyLayer3 },
  };
}

/**
 * A tabela já tem alguma vizinha gravada? Decide entre CONGELAR (regra 2) e
 * aplicar a regra antiga completa (regra 3).
 *
 * A decisão é GLOBAL, não por base: bastaria uma cidade isolada receber uma
 * linha de layer 3 nova para o conjunto `layer <= 3` deixar de ser o de antes.
 * Medido no snapshot de produção: a versão por base criava 283 linhas de
 * layer 3 em 122 cidades que hoje não têm vizinhança nenhuma — e essas cidades
 * mudariam até de caminho de código (`hasRegionMemberships`).
 */
export function hasAnyNeighborRow(existingByKey) {
  for (const row of existingByKey.values()) {
    if (row.base_city_id !== row.member_city_id) return true;
  }
  return false;
}

/** Contagens para relatório (total, self, cross-UF, por faixa, por layer). */
export function summarizeMemberships(rows, cities) {
  const stateById = new Map(cities.map((c) => [c.id, String(c.state || "").toUpperCase()]));
  const summary = {
    total: rows.length,
    self: 0,
    crossUf: 0,
    legacyVisible: 0,
    byLayer: {},
    byBand: {},
    maxDistanceKm: 0,
  };
  let prevBand = 0;
  for (const band of REPORT_BANDS) {
    summary.byBand[`${prevBand}-${band}`] = 0;
    prevBand = band;
  }

  for (const row of rows) {
    if (Number(row.layer) <= LEGACY_MAX_LAYER) summary.legacyVisible += 1;
    if (row.base_city_id === row.member_city_id) {
      summary.self += 1;
      summary.byLayer[0] = (summary.byLayer[0] || 0) + 1;
      continue;
    }
    summary.byLayer[row.layer] = (summary.byLayer[row.layer] || 0) + 1;
    if (stateById.get(row.base_city_id) !== stateById.get(row.member_city_id)) summary.crossUf += 1;
    const km = Number(row.distance_km);
    if (km > summary.maxDistanceKm) summary.maxDistanceKm = km;
    let lo = 0;
    for (const band of REPORT_BANDS) {
      if (km > lo && km <= band) {
        summary.byBand[`${lo}-${band}`] += 1;
        break;
      }
      lo = band;
    }
  }
  return summary;
}

/**
 * Prova de superconjunto LINHA A LINHA (não só contagem — R3/R4): para cada
 * linha atual, existe no novo conjunto? com o mesmo layer? com a mesma
 * distância?
 *
 * @param {Map<string, {distance_km:number, layer:number}>} existingByKey
 * @param {Array} newRows
 * @returns {{ existing:number, missing:string[], layerChanged:string[], distanceChanged:string[] }}
 */
export function compareWithExisting(existingByKey, newRows) {
  const newByKey = new Map(newRows.map((r) => [membershipKey(r), r]));
  const result = {
    existing: existingByKey.size,
    missing: [],
    layerChanged: [],
    distanceChanged: [],
  };
  for (const [key, old] of existingByKey) {
    const next = newByKey.get(key);
    if (!next) {
      result.missing.push(key);
      continue;
    }
    if (Number(next.layer) !== Number(old.layer)) result.layerChanged.push(key);
    if (Number(next.distance_km) !== Number(old.distance_km ?? 0)) result.distanceChanged.push(key);
  }
  return result;
}

/** Compatibilidade: só as chaves atuais ausentes no novo conjunto. */
export function findMissingFromSuperset(existingKeys, newRows) {
  const newKeys = new Set(newRows.map(membershipKey));
  const missing = [];
  for (const key of existingKeys) if (!newKeys.has(key)) missing.push(key);
  return missing;
}

// ─── Acesso a banco ──────────────────────────────────────────────────────────

export async function loadCities(db) {
  const { rows } = await db.query(
    `SELECT id, slug, name, state, latitude, longitude
     FROM cities
     ORDER BY id ASC`
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
  }));
}

/** Linhas atuais por chave `base:member` → { distance_km, layer } (R3/R4). */
export async function loadExistingMemberships(db) {
  const { rows } = await db.query(
    `SELECT base_city_id, member_city_id, distance_km, layer FROM region_memberships`
  );
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(`${r.base_city_id}:${r.member_city_id}`, {
      base_city_id: Number(r.base_city_id),
      member_city_id: Number(r.member_city_id),
      distance_km: r.distance_km == null ? 0 : Number(r.distance_km),
      layer: Number(r.layer),
    });
  }
  return byKey;
}

/** Chaves `base:member` já existentes (compatibilidade). */
export async function loadExistingMembershipKeys(db) {
  return new Set((await loadExistingMemberships(db)).keys());
}

/** Map chave → layer, para `buildAllMemberships`/`buildMembershipsForBase`. */
export function layerMapFrom(existingByKey) {
  const map = new Map();
  for (const [key, row] of existingByKey) map.set(key, row.layer);
  return map;
}

const INSERT_BATCH_ROWS = 5000; // 4 params/linha → 20k params, abaixo dos 65k do protocolo.

async function insertRowsInBatches(client, table, rows) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_ROWS) {
    const slice = rows.slice(i, i + INSERT_BATCH_ROWS);
    const params = [];
    const tuples = slice.map((r, idx) => {
      const b = idx * 4;
      params.push(r.base_city_id, r.member_city_id, r.distance_km, r.layer);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
    });
    await client.query(
      `INSERT INTO ${table} (base_city_id, member_city_id, distance_km, layer) VALUES ${tuples.join(",")}`,
      params
    );
  }
}

function assertSafeIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return name;
}

export function defaultBackupTableName(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  return `region_memberships_backup_${stamp}`;
}

/** Nunca sobrescreve um backup: se o nome já existe, sufixa _2, _3, … */
async function uniqueBackupTableName(client, wanted) {
  let candidate = wanted;
  for (let i = 2; i < 1000; i += 1) {
    const { rows } = await client.query(`SELECT to_regclass($1) AS oid`, [candidate]);
    if (rows[0].oid == null) return candidate;
    candidate = `${wanted}_${i}`;
  }
  throw new Error(`não foi possível obter nome livre para o backup a partir de ${wanted}`);
}

/**
 * Troca atômica: gera em tabela TEMPORÁRIA, faz backup da tabela atual em
 * tabela REAL (`backupTable`), e dentro de UMA transação DELETE + INSERT.
 * A tabela nunca fica vazia para quem lê fora da transação; leitores veem o
 * conjunto antigo até o COMMIT e o novo depois.
 *
 * Superconjunto garantido por construção: após inserir o novo conjunto,
 * reinsere do backup qualquer linha que por acaso tenha ficado de fora
 * (`ON CONFLICT DO NOTHING`), e o script aborta se a contagem final for
 * menor que a anterior.
 *
 * @returns {{ before:number, after:number, reinsertedFromBackup:number, backupTable:string, elapsedMs:number }}
 */
export async function applyMemberships(pool, rows, { backupTable } = {}) {
  const wanted = assertSafeIdentifier(backupTable || defaultBackupTableName());
  const started = Date.now();
  const client = await pool.connect();
  try {
    const backup = await uniqueBackupTableName(client, wanted);
    await client.query(`CREATE TEMP TABLE region_memberships_next (
      base_city_id BIGINT NOT NULL,
      member_city_id BIGINT NOT NULL,
      distance_km NUMERIC,
      layer SMALLINT NOT NULL,
      PRIMARY KEY (base_city_id, member_city_id)
    ) ON COMMIT PRESERVE ROWS`);
    await insertRowsInBatches(client, "region_memberships_next", rows);

    await client.query("BEGIN");
    try {
      const { rows: beforeRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM region_memberships`
      );
      const before = beforeRows[0].n;

      await client.query(`CREATE TABLE ${backup} AS SELECT * FROM region_memberships`);
      await client.query(`DELETE FROM region_memberships`);
      await client.query(
        `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
         SELECT base_city_id, member_city_id, distance_km, layer FROM region_memberships_next`
      );
      const reinsert = await client.query(
        `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
         SELECT base_city_id, member_city_id, distance_km, layer FROM ${backup}
         ON CONFLICT (base_city_id, member_city_id) DO NOTHING`
      );
      const { rows: afterRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM region_memberships`
      );
      const after = afterRows[0].n;
      if (after < before) {
        throw new Error(
          `rebuild produziria ${after} linhas < ${before} atuais — abortado (R3: superconjunto)`
        );
      }
      await client.query("COMMIT");
      return {
        before,
        after,
        reinsertedFromBackup: reinsert.rowCount || 0,
        backupTable: backup,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.query(`DROP TABLE IF EXISTS region_memberships_next`).catch(() => {});
    client.release();
  }
}

/** SQL de rollback a partir do backup — impresso pelo script e citado no relatório. */
export function rollbackSql(backupTable) {
  const backup = assertSafeIdentifier(backupTable);
  return [
    "BEGIN;",
    "DELETE FROM region_memberships;",
    `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)`,
    `  SELECT base_city_id, member_city_id, distance_km, layer FROM ${backup};`,
    "COMMIT;",
  ].join("\n");
}

/**
 * Recomputa SÓ as linhas de uma cidade (como base e como membro) — usado
 * pelo worker `cities.geo-changed` quando latitude/longitude são preenchidas.
 *
 * Mesmas três regras do cabeçalho: linha existente mantém o layer gravado;
 * linha nova como base segue a regra legada 1/2; como membro de outra base B,
 * layer 1/2 se (mesma UF, faixa legada e B ainda tem vaga no teto), senão 4.
 */
export async function recomputeCityMemberships(pool, cityId) {
  const id = Number(cityId);
  if (!Number.isFinite(id) || id <= 0) throw new Error(`cityId inválido: ${cityId}`);

  const cities = await loadCities(pool);
  const city = cities.find((c) => c.id === id);
  if (!city) throw new Error(`cidade ${id} não existe`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query(
      `SELECT base_city_id, member_city_id, layer FROM region_memberships
       WHERE base_city_id = $1 OR member_city_id = $1`,
      [id]
    );
    const existingLayerByKey = new Map(
      existingRows.map((r) => [`${r.base_city_id}:${r.member_city_id}`, Number(r.layer)])
    );
    // Regra 3: a cidade já tinha vizinhança gravada? Se não (caso típico do
    // worker — cidade que acabou de ganhar coordenadas), aplica a regra antiga
    // completa, com layer 3.
    const alreadyBuilt = existingRows.some(
      (r) => Number(r.base_city_id) === id && Number(r.member_city_id) !== id
    );
    const asBase = buildMembershipsForBase(city, cities, {
      existingLayerByKey,
      allowLegacyLayer3: !alreadyBuilt,
    });

    const { rows: capRows } = await client.query(
      `SELECT base_city_id, layer, COUNT(*)::int AS n
       FROM region_memberships
       WHERE member_city_id <> $1 AND layer IN (1,2)
       GROUP BY base_city_id, layer`,
      [id]
    );
    const usage = new Map(capRows.map((r) => [`${r.base_city_id}:${r.layer}`, r.n]));
    const caps = { 1: LEGACY_LAYER_1_MAX_MEMBERS, 2: LEGACY_LAYER_2_MAX_MEMBERS };
    // Como MEMBRO de outra base B: só layers 1/2 (nunca 3) — B já está
    // construída, então nada novo pode entrar no que ela mostra em layer <= 3.

    await client.query(
      `DELETE FROM region_memberships WHERE base_city_id = $1 OR member_city_id = $1`,
      [id]
    );

    const rows = [{ base_city_id: id, member_city_id: id, distance_km: 0, layer: 0 }];
    for (const m of asBase) {
      rows.push({ base_city_id: id, ...m });
      const other = cities.find((c) => c.id === m.member_city_id);
      const reverseKey = `${m.member_city_id}:${id}`;
      let layer = existingLayerByKey.get(reverseKey);
      if (layer == null) {
        layer = LAYER_EXTENDED;
        if (other && sameState(other, city)) {
          const legacy = classifyLegacyLayer(m.distance_km, { includeLayer3: false });
          if (legacy && (usage.get(`${other.id}:${legacy}`) || 0) < caps[legacy]) layer = legacy;
        }
      }
      rows.push({
        base_city_id: m.member_city_id,
        member_city_id: id,
        distance_km: m.distance_km,
        layer: Number(layer),
      });
    }
    await insertRowsInBatches(client, "region_memberships", rows);
    await client.query("COMMIT");
    return { cityId: id, rowsWritten: rows.length, asBase: asBase.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
