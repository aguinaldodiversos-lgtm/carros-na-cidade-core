import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const IBGE_BASE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades";
const REQUEST_TIMEOUT_MS = 30000;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value.trim();
}

function createPool() {
  const connectionString = requiredEnv("DATABASE_URL");

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
  });
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`´^~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugifyCity(name, state) {
  const base = normalizeText(name)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base}-${String(state).toLowerCase()}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Falha ao consultar IBGE (${response.status}) em ${url}: ${text}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout ao consultar IBGE: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStates() {
  return fetchJson(`${IBGE_BASE_URL}/estados?orderBy=nome`);
}

async function fetchCitiesByUf(uf) {
  return fetchJson(
    `${IBGE_BASE_URL}/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`
  );
}

async function ensureCitiesTable(client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id BIGSERIAL PRIMARY KEY,
      ibge_code BIGINT,
      name TEXT NOT NULL,
      normalized_name TEXT,
      slug TEXT,
      state CHAR(2) NOT NULL,
      state_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS ibge_code BIGINT;
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS normalized_name TEXT;
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS slug TEXT;
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS state_name TEXT;
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    ALTER TABLE cities
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await client.query(`
    UPDATE cities
    SET normalized_name = lower(trim(name))
    WHERE normalized_name IS NULL
      AND name IS NOT NULL;
  `);

  await client.query(`
    UPDATE cities
    SET slug = lower(
      regexp_replace(
        regexp_replace(trim(name), '\\s+', '-', 'g'),
        '[^a-zA-Z0-9\\-]',
        '',
        'g'
      )
    ) || '-' || lower(state)
    WHERE slug IS NULL
      AND name IS NOT NULL
      AND state IS NOT NULL;
  `);

  await client.query(`
    UPDATE cities
    SET state_name = state
    WHERE state_name IS NULL
      AND state IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cities_state
      ON cities (state);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cities_state_name
      ON cities (state, name);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cities_normalized_name
      ON cities (normalized_name);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cities_normalized_name_trgm
      ON cities
      USING gin (normalized_name gin_trgm_ops);
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_ibge_code_not_null
      ON cities (ibge_code)
      WHERE ibge_code IS NOT NULL;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_slug_not_null
      ON cities (slug)
      WHERE slug IS NOT NULL;
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    DROP TRIGGER IF EXISTS trg_cities_updated_at ON cities;
  `);

  await client.query(`
    CREATE TRIGGER trg_cities_updated_at
    BEFORE UPDATE ON cities
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
}

async function findExistingCityByIbgeCode(client, ibgeCode) {
  const result = await client.query(
    `
      SELECT id, ibge_code, name, state, slug
      FROM cities
      WHERE ibge_code = $1
      LIMIT 1
    `,
    [ibgeCode]
  );

  return result.rows[0] || null;
}

async function findExistingCityByNameAndState(client, name, state) {
  const normalizedName = normalizeText(name);

  const result = await client.query(
    `
      SELECT id, ibge_code, name, state, slug
      FROM cities
      WHERE state = $1
        AND (
          normalized_name = $2
          OR lower(unaccent(name)) = $2
        )
      ORDER BY id ASC
      LIMIT 1
    `,
    [state, normalizedName]
  );

  return result.rows[0] || null;
}

async function updateExistingCity(client, cityId, payload) {
  await client.query(
    `
      UPDATE cities
      SET
        ibge_code = COALESCE(ibge_code, $2),
        name = $3,
        normalized_name = $4,
        slug = $5,
        state = $6,
        state_name = $7,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      cityId,
      payload.ibge_code,
      payload.name,
      payload.normalized_name,
      payload.slug,
      payload.state,
      payload.state_name,
    ]
  );
}

async function insertCity(client, payload) {
  await client.query(
    `
      INSERT INTO cities (
        ibge_code,
        name,
        normalized_name,
        slug,
        state,
        state_name
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (ibge_code)
      WHERE ibge_code IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        normalized_name = EXCLUDED.normalized_name,
        slug = EXCLUDED.slug,
        state = EXCLUDED.state,
        state_name = EXCLUDED.state_name,
        updated_at = NOW()
    `,
    [
      payload.ibge_code,
      payload.name,
      payload.normalized_name,
      payload.slug,
      payload.state,
      payload.state_name,
    ]
  );
}

async function upsertCitySafely(client, payload) {
  const existingByIbge = await findExistingCityByIbgeCode(client, payload.ibge_code);

  if (existingByIbge) {
    await updateExistingCity(client, existingByIbge.id, payload);
    return "updated_by_ibge";
  }

  const existingByNameState = await findExistingCityByNameAndState(
    client,
    payload.name,
    payload.state
  );

  if (existingByNameState) {
    await updateExistingCity(client, existingByNameState.id, payload);
    return "updated_by_name_state";
  }

  await insertCity(client, payload);
  return "inserted";
}

async function countCities(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM cities`
  );
  return result.rows?.[0]?.total ?? 0;
}

async function importCities() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    console.log("[cities:import] Iniciando sincronização com IBGE...");
    await ensureCitiesTable(client);

    const states = await fetchStates();

    if (!Array.isArray(states) || states.length === 0) {
      throw new Error("Nenhum estado retornado pela API do IBGE.");
    }

    console.log(`[cities:import] ${states.length} estados encontrados.`);

    let totalProcessed = 0;
    let totalInserted = 0;
    let totalUpdatedByIbge = 0;
    let totalUpdatedByNameState = 0;

    for (const state of states) {
      const uf = String(state.sigla || "").trim().toUpperCase();
      const stateName = String(state.nome || "").trim();

      if (!uf || uf.length !== 2 || !stateName) {
        console.warn("[cities:import] Estado inválido ignorado:", state);
        continue;
      }

      console.log(`[cities:import] Buscando municípios de ${uf}...`);
      const cities = await fetchCitiesByUf(uf);

      if (!Array.isArray(cities)) {
        console.warn(`[cities:import] Resposta inesperada para UF ${uf}.`);
        continue;
      }

      let processedInState = 0;

      for (const city of cities) {
        const cityName = String(city.nome || "").trim();
        const ibgeCode = Number(city.id);

        if (!cityName || !Number.isFinite(ibgeCode) || ibgeCode <= 0) {
          continue;
        }

        const payload = {
          ibge_code: ibgeCode,
          name: cityName,
          normalized_name: normalizeText(cityName),
          slug: slugifyCity(cityName, uf),
          state: uf,
          state_name: stateName,
        };

        const action = await upsertCitySafely(client, payload);

        totalProcessed += 1;
        processedInState += 1;

        if (action === "inserted") totalInserted += 1;
        if (action === "updated_by_ibge") totalUpdatedByIbge += 1;
        if (action === "updated_by_name_state") totalUpdatedByNameState += 1;
      }

      console.log(
        `[cities:import] ${uf}: ${processedInState} municípios processados.`
      );
    }

    const totalInDatabase = await countCities(client);

    console.log("[cities:import] Importação concluída com sucesso.");
    console.log(`[cities:import] Processados: ${totalProcessed}`);
    console.log(`[cities:import] Inseridos: ${totalInserted}`);
    console.log(`[cities:import] Atualizados por ibge_code: ${totalUpdatedByIbge}`);
    console.log(
      `[cities:import] Atualizados por name+state: ${totalUpdatedByNameState}`
    );
    console.log(`[cities:import] Total atual na tabela cities: ${totalInDatabase}`);
  } catch (error) {
    console.error("[cities:import] Falha na importação:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

importCities();
