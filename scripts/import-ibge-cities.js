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
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
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
      headers: {
        Accept: "application/json",
      },
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
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS unaccent;
  `);

  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id BIGSERIAL PRIMARY KEY,
      ibge_code BIGINT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      state CHAR(2) NOT NULL,
      state_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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

async function upsertCity(client, city) {
  const sql = `
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
    DO UPDATE SET
      name = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      slug = EXCLUDED.slug,
      state = EXCLUDED.state,
      state_name = EXCLUDED.state_name,
      updated_at = NOW()
  `;

  const values = [
    city.ibge_code,
    city.name,
    city.normalized_name,
    city.slug,
    city.state,
    city.state_name,
  ];

  await client.query(sql, values);
}

async function importCities() {
  const pool = createPool();
  const client = await pool.connect();

  let totalStates = 0;
  let totalCitiesProcessed = 0;

  try {
    console.log("[cities:import] Iniciando sincronização com IBGE...");

    await ensureCitiesTable(client);

    const states = await fetchStates();
    totalStates = Array.isArray(states) ? states.length : 0;

    if (!totalStates) {
      throw new Error("Nenhum estado foi retornado pela API do IBGE.");
    }

    console.log(`[cities:import] ${totalStates} estados encontrados.`);

    await client.query("BEGIN");

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

      for (const city of cities) {
        const cityName = String(city.nome || "").trim();
        const ibgeCode = Number(city.id);

        if (!cityName || !Number.isFinite(ibgeCode) || ibgeCode <= 0) {
          console.warn("[cities:import] Cidade inválida ignorada:", city);
          continue;
        }

        await upsertCity(client, {
          ibge_code: ibgeCode,
          name: cityName,
          normalized_name: normalizeText(cityName),
          slug: slugifyCity(cityName, uf),
          state: uf,
          state_name: stateName,
        });

        totalCitiesProcessed += 1;
      }

      console.log(
        `[cities:import] ${uf}: ${cities.length} municípios processados.`
      );
    }

    await client.query("COMMIT");

    const countResult = await client.query(`SELECT COUNT(*)::int AS total FROM cities`);
    const totalInDatabase = countResult.rows?.[0]?.total ?? 0;

    console.log(
      `[cities:import] Importação concluída com sucesso. Estados: ${totalStates}. Registros processados: ${totalCitiesProcessed}. Total atual na tabela cities: ${totalInDatabase}.`
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("[cities:import] Falha na importação:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

importCities();
