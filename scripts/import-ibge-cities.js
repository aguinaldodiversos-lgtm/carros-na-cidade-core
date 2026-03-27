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

/**
 * Lista municípios da UF no IBGE. Retentativas com backoff leve (rede/429).
 */
async function fetchCitiesByUf(uf, options = {}) {
  const maxAttempts = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 600;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchJson(
        `${IBGE_BASE_URL}/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`
      );
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * attempt;
        console.log(
          `[cities:import] ${uf}: requisição municípios falhou (tentativa ${attempt}/${maxAttempts}); nova tentativa em ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr;
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
      ADD COLUMN IF NOT EXISTS ibge_code BIGINT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS normalized_name TEXT,
      ADD COLUMN IF NOT EXISTS slug TEXT,
      ADD COLUMN IF NOT EXISTS state CHAR(2),
      ADD COLUMN IF NOT EXISTS state_name TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  `);

  await client.query(`
    UPDATE cities
    SET created_at = COALESCE(created_at, NOW())
    WHERE created_at IS NULL;
  `);

  await client.query(`
    UPDATE cities
    SET updated_at = COALESCE(updated_at, NOW())
    WHERE updated_at IS NULL;
  `);

  await client.query(`
    UPDATE cities
    SET normalized_name = trim(
      regexp_replace(lower(unaccent(coalesce(name, ''))), '[[:space:]]+', ' ', 'g')
    )
    WHERE normalized_name IS NULL OR trim(normalized_name) = '';
  `);

  await client.query(`
    UPDATE cities
    SET state_name = trim(coalesce(state::text, ''))
    WHERE state_name IS NULL OR trim(state_name) = '';
  `);

  await client.query(`
    UPDATE cities
    SET slug = trim(
      both '-' FROM regexp_replace(
        regexp_replace(
          lower(unaccent(coalesce(name, ''))),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-+',
        '-',
        'g'
      )
    ) || '-' || lower(trim(coalesce(state::text, ''))) || '-' || id::text
    WHERE (slug IS NULL OR trim(slug) = '')
      AND name IS NOT NULL
      AND trim(coalesce(name, '')) <> ''
      AND state IS NOT NULL
      AND trim(coalesce(state::text, '')) <> '';
  `);

  await client.query(`
    WITH ranked AS (
      SELECT
        id,
        slug,
        row_number() OVER (PARTITION BY slug ORDER BY id) AS rn
      FROM cities
    )
    UPDATE cities c
    SET slug = c.slug || '-' || c.id::text
    FROM ranked r
    WHERE c.id = r.id
      AND r.rn > 1;
  `);

  await client.query(`
    ALTER TABLE cities
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW();
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE ibge_code IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN ibge_code SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE name IS NULL OR trim(coalesce(name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE normalized_name IS NULL OR trim(coalesce(normalized_name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN normalized_name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE slug IS NULL OR trim(coalesce(slug::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN slug SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE state IS NULL OR trim(coalesce(state::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN state SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE state_name IS NULL OR trim(coalesce(state_name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN state_name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE created_at IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN created_at SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE updated_at IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN updated_at SET NOT NULL;
      END IF;
    END
    $c$;
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

  await client.query(`DROP TRIGGER IF EXISTS trg_cities_updated_at ON cities;`);

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
    SELECT id, ibge_code, name, state, normalized_name
    FROM cities
    WHERE ibge_code = $1
    LIMIT 1
    `,
    [ibgeCode]
  );
  return result.rows[0] || null;
}

/**
 * Candidatos por UF + nome normalizado (igual ao IBGE). Slug não entra no critério.
 * Retorna lista completa para decidir inequivocidade no JS.
 */
async function findExistingCityByNameAndState(client, state, normalizedName) {
  const result = await client.query(
    `
    SELECT id, ibge_code, name, state, normalized_name
    FROM cities
    WHERE state = $1
      AND trim(coalesce(normalized_name::text, '')) = $2
    ORDER BY id ASC
    `,
    [state, normalizedName]
  );
  return result.rows;
}

async function updateExistingCity(client, cityId, payload) {
  await client.query(
    `
    UPDATE cities
    SET
      ibge_code = $2,
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

/**
 * 1) Match por ibge_code (prioridade).
 * 2) Match por name+state só se houver exatamente 1 linha com mesmo normalized_name e ibge_code IS NULL.
 * 3) Qualquer ambiguidade (0 com nome errado, 2+ linhas, ou 1 linha com ibge_code já preenchido diferente) → INSERT.
 */
async function upsertCitySafely(client, payload) {
  const byIbge = await findExistingCityByIbgeCode(client, payload.ibge_code);
  if (byIbge) {
    await updateExistingCity(client, byIbge.id, payload);
    return "updated_by_ibge";
  }

  const candidates = await findExistingCityByNameAndState(
    client,
    payload.state,
    payload.normalized_name
  );

  if (candidates.length === 0) {
    try {
      await insertCity(client, payload);
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await findExistingCityByIbgeCode(
          client,
          payload.ibge_code
        );
        if (again) {
          await updateExistingCity(client, again.id, payload);
          return "updated_by_ibge";
        }
        throw err;
      }
      throw err;
    }
    return "inserted";
  }

  if (candidates.length > 1) {
    try {
      await insertCity(client, payload);
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await findExistingCityByIbgeCode(
          client,
          payload.ibge_code
        );
        if (again) {
          await updateExistingCity(client, again.id, payload);
          return "updated_by_ibge";
        }
        throw err;
      }
      throw err;
    }
    return "inserted";
  }

  const only = candidates[0];

  if (
    only.ibge_code != null &&
    Number(only.ibge_code) === Number(payload.ibge_code)
  ) {
    await updateExistingCity(client, only.id, payload);
    return "updated_by_ibge";
  }

  if (only.ibge_code != null && Number(only.ibge_code) !== Number(payload.ibge_code)) {
    try {
      await insertCity(client, payload);
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await findExistingCityByIbgeCode(
          client,
          payload.ibge_code
        );
        if (again) {
          await updateExistingCity(client, again.id, payload);
          return "updated_by_ibge";
        }
        throw err;
      }
      throw err;
    }
    return "inserted";
  }

  if (only.ibge_code == null) {
    await updateExistingCity(client, only.id, payload);
    return "reconciled_by_name_state";
  }

  throw new Error(
    "[cities:import] Estado inesperado em upsertCitySafely (candidato único sem ramo tratado)."
  );
}

async function countCities(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM cities`
  );
  return result.rows?.[0]?.total ?? 0;
}

async function applyDeferredNotNullConstraints(client) {
  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE ibge_code IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN ibge_code SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE name IS NULL OR trim(coalesce(name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE normalized_name IS NULL OR trim(coalesce(normalized_name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN normalized_name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE slug IS NULL OR trim(coalesce(slug::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN slug SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE state IS NULL OR trim(coalesce(state::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN state SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM cities
        WHERE state_name IS NULL OR trim(coalesce(state_name::text, '')) = ''
      ) THEN
        ALTER TABLE cities ALTER COLUMN state_name SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE created_at IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN created_at SET NOT NULL;
      END IF;
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cities WHERE updated_at IS NULL) THEN
        ALTER TABLE cities ALTER COLUMN updated_at SET NOT NULL;
      END IF;
    END
    $c$;
  `);
}

function formatImportError(err) {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  return String(err);
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

    console.log(`[cities:import] ${states.length} UFs listadas pelo IBGE.`);

    let totalProcessedIbge = 0;
    let totalInserted = 0;
    let totalUpdatedByIbge = 0;
    let totalReconciledByNameState = 0;

    /** @type {string[]} */
    const ufsOk = [];
    /** @type {{ uf: string; error: string }[]} */
    const ufsFailed = [];

    for (const state of states) {
      const uf = String(state.sigla || "").trim().toUpperCase();
      const stateName = String(state.nome || "").trim();

      if (!uf || uf.length !== 2 || !stateName) {
        console.log("[cities:import] Estado inválido ignorado:", state);
        continue;
      }

      console.log(`[cities:import] Iniciando UF ${uf}`);

      try {
        const municipios = await fetchCitiesByUf(uf);

        if (!Array.isArray(municipios)) {
          throw new Error(
            `Resposta IBGE inesperada para municípios (esperado array, recebido ${typeof municipios})`
          );
        }

        let processedInState = 0;
        let insertedInState = 0;
        let updatedByIbgeInState = 0;
        let reconciledInState = 0;

        for (const city of municipios) {
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

          totalProcessedIbge += 1;
          processedInState += 1;

          if (action === "inserted") {
            totalInserted += 1;
            insertedInState += 1;
          } else if (action === "updated_by_ibge") {
            totalUpdatedByIbge += 1;
            updatedByIbgeInState += 1;
          } else if (action === "reconciled_by_name_state") {
            totalReconciledByNameState += 1;
            reconciledInState += 1;
          }
        }

        ufsOk.push(uf);

        console.log(
          `[cities:import] ${uf}: ${processedInState} processadas | inseridos=${insertedInState} | atualizados_ibge=${updatedByIbgeInState} | reconciliados_nome_uf=${reconciledInState}`
        );
      } catch (err) {
        const msg = formatImportError(err);
        console.error(`[cities:import] ERRO em ${uf}: ${msg}`);
        ufsFailed.push({ uf, error: msg });
      }
    }

    try {
      await applyDeferredNotNullConstraints(client);
    } catch (err) {
      console.error(
        `[cities:import] Aviso: applyDeferredNotNullConstraints falhou (dados parciais preservados): ${formatImportError(err)}`
      );
    }

    const totalInDatabase = await countCities(client);
    const totalUpdated =
      totalUpdatedByIbge + totalReconciledByNameState;
    const ufsTentadas = ufsOk.length + ufsFailed.length;

    console.log("[cities:import] --- Resumo final ---");
    console.log(`[cities:import] UFs tentadas: ${ufsTentadas}`);
    console.log(`[cities:import] UFs com sucesso: ${ufsOk.length}`);
    console.log(`[cities:import] UFs com falha: ${ufsFailed.length}`);
    if (ufsFailed.length > 0) {
      for (const f of ufsFailed) {
        console.log(
          `[cities:import]   falha ${f.uf}: ${f.error.split("\n")[0]}`
        );
      }
    }
    console.log(
      `[cities:import] Municípios processados (soma IBGE nas UFs OK): ${totalProcessedIbge}`
    );
    console.log(`[cities:import] Total cidades inseridas: ${totalInserted}`);
    console.log(`[cities:import] Total cidades atualizadas: ${totalUpdated}`);
    console.log(
      `[cities:import] Detalhe atualizações — por ibge_code=${totalUpdatedByIbge} | reconciliadas nome+UF=${totalReconciledByNameState}`
    );
    console.log(`[cities:import] Total na tabela cities: ${totalInDatabase}`);

    if (ufsFailed.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("[cities:import] Falha fatal (antes ou durante setup):", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

importCities();
