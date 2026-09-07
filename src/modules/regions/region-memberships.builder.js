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
//   • Os tetos por camada (12/18/40) NÃO limitam mais quais pares existem —
//     todo par ≤ 150 km é gravado. O motor (F2) elege território por
//     `distance_km`, não por `layer`.
//
// ────────────────────────────────────────────────────────────────────────────
// COMPATIBILIDADE: A COLUNA `layer` SEGUE A REGRA ANTIGA
// ────────────────────────────────────────────────────────────────────────────
// A página regional (`regions.service.js`, `findMembersFromMemberships`) filtra
// `rm.layer <= 2` e corta em `LIMIT 30` ordenando por layer/distância. Se as
// linhas novas recebessem layer 1/2 por faixa de distância, uma base densa
// (capital paulista tem dezenas de municípios a ≤30 km) passaria a devolver
// outro conjunto de vizinhas — mudança de comportamento que a F1 não pode
// introduzir.
//
// Por isso `layer` 1, 2 e 3 são atribuídos EXATAMENTE como antes: mesma UF,
// faixas 0–30 / 30–60 / 60–100 km, top 12 / 18 / 40 por distância. Toda linha
// que o build antigo não produziria (outra UF, além dos tetos, 100–150 km)
// recebe `layer = 4` (`LAYER_EXTENDED`). Assim:
//   • `layer <= 2`  → mesmas linhas de antes (página regional intocada);
//   • `layer > 0`   → continua verdadeiro para toda vizinha;
//   • `distance_km` → é a única chave que o motor novo usa.
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

/** Camadas legadas — regra antiga, preservada byte a byte. */
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

/** Linha que o build antigo não produziria (outra UF, além do teto, >100 km). */
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

/** Camada legada por distância (regra antiga). `null` = fora das faixas legadas. */
export function classifyLegacyLayer(distanceKm) {
  if (distanceKm <= LEGACY_LAYER_1_MAX_KM) return 1;
  if (distanceKm <= LEGACY_LAYER_2_MAX_KM) return 2;
  if (distanceKm <= LEGACY_LAYER_3_MAX_KM) return 3;
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
 * @returns {Array<{member_city_id:number, distance_km:number, layer:number}>}
 *   ordenado por distance_km ASC, member_city_id ASC.
 */
export function buildMembershipsForBase(baseCity, candidates, { maxKm = MAX_DISTANCE_KM } = {}) {
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

  // Regra legada: mesma UF, faixas fixas, top-K por distância crua (o build
  // antigo ordenava pelo valor não arredondado e gravava com 2 casas).
  const legacyBuckets = { 1: [], 2: [], 3: [] };
  for (const row of rows) {
    if (!row._sameState) continue;
    const layer = classifyLegacyLayer(row._rawKm);
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

  rows.sort((a, b) => a.distance_km - b.distance_km || a.member_city_id - b.member_city_id);
  return rows.map(({ member_city_id, distance_km, layer }) => ({
    member_city_id,
    distance_km,
    layer,
  }));
}

/**
 * Compatibilidade com o contrato antigo de `pickRegionMembers`: só as linhas
 * que o build legado produziria (layer 1–3). Usado pelos testes históricos.
 */
export function pickLegacyRegionMembers(baseCity, candidates) {
  return buildMembershipsForBase(baseCity, candidates).filter((r) => r.layer !== LAYER_EXTENDED);
}

/**
 * Conjunto completo para TODAS as cidades: self-rows (inclusive sem coords)
 * + pares ≤ 150 km.
 *
 * @returns {{ rows: Array<{base_city_id, member_city_id, distance_km, layer}>, stats }}
 */
export function buildAllMemberships(cities) {
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
    for (const m of buildMembershipsForBase(base, cities)) {
      rows.push({ base_city_id: base.id, member_city_id: m.member_city_id, ...m });
    }
  }

  return { rows, stats: { cities: cities.length, basesWithCoords, basesWithoutCoords } };
}

/** Contagens para relatório (total, self, cross-UF, por faixa, por layer). */
export function summarizeMemberships(rows, cities) {
  const stateById = new Map(cities.map((c) => [c.id, String(c.state || "").toUpperCase()]));
  const summary = {
    total: rows.length,
    self: 0,
    crossUf: 0,
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

/** Chaves `base:member` já existentes — para provar o superconjunto (R3). */
export async function loadExistingMembershipKeys(db) {
  const { rows } = await db.query(`SELECT base_city_id, member_city_id FROM region_memberships`);
  return new Set(rows.map((r) => `${r.base_city_id}:${r.member_city_id}`));
}

export function membershipKey(row) {
  return `${row.base_city_id}:${row.member_city_id}`;
}

/** Linhas atuais que o novo conjunto NÃO contém (deve ser vazio — R3). */
export function findMissingFromSuperset(existingKeys, newRows) {
  const newKeys = new Set(newRows.map(membershipKey));
  const missing = [];
  for (const key of existingKeys) if (!newKeys.has(key)) missing.push(key);
  return missing;
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
 * Como base: regra completa (idêntica ao rebuild total).
 * Como membro de outra base B: camada legada se (mesma UF, faixa legada e
 * B ainda tem vaga no teto daquela camada); senão `LAYER_EXTENDED`. É a
 * melhor aproximação sem recomputar B inteira — e `layer` só importa para a
 * página regional; o motor usa `distance_km`.
 */
export async function recomputeCityMemberships(pool, cityId) {
  const id = Number(cityId);
  if (!Number.isFinite(id) || id <= 0) throw new Error(`cityId inválido: ${cityId}`);

  const cities = await loadCities(pool);
  const city = cities.find((c) => c.id === id);
  if (!city) throw new Error(`cidade ${id} não existe`);

  const asBase = buildMembershipsForBase(city, cities);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: capRows } = await client.query(
      `SELECT base_city_id, layer, COUNT(*)::int AS n
       FROM region_memberships
       WHERE member_city_id <> $1 AND layer IN (1,2,3)
       GROUP BY base_city_id, layer`,
      [id]
    );
    const usage = new Map(capRows.map((r) => [`${r.base_city_id}:${r.layer}`, r.n]));
    const caps = {
      1: LEGACY_LAYER_1_MAX_MEMBERS,
      2: LEGACY_LAYER_2_MAX_MEMBERS,
      3: LEGACY_LAYER_3_MAX_MEMBERS,
    };

    await client.query(
      `DELETE FROM region_memberships WHERE base_city_id = $1 OR member_city_id = $1`,
      [id]
    );

    const rows = [{ base_city_id: id, member_city_id: id, distance_km: 0, layer: 0 }];
    for (const m of asBase) {
      rows.push({ base_city_id: id, ...m });
      const other = cities.find((c) => c.id === m.member_city_id);
      let layer = LAYER_EXTENDED;
      if (other && sameState(other, city)) {
        const legacy = classifyLegacyLayer(m.distance_km);
        if (legacy && (usage.get(`${other.id}:${legacy}`) || 0) < caps[legacy]) layer = legacy;
      }
      rows.push({
        base_city_id: m.member_city_id,
        member_city_id: id,
        distance_km: m.distance_km,
        layer,
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
