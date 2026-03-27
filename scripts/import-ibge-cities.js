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

/**
 * Chave inequívoca: UF + nome normalizado (mesmo critério do IBGE por estado).
 */
function ibgeLookupKey(uf, officialName) {
  return `${String(uf).trim().toUpperCase()}|${normalizeText(officialName)}`;
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
<<<<<<< HEAD
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
=======
      ADD COLUMN IF NOT EXISTS ibge_code BIGINT,
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS normalized_name TEXT,
      ADD COLUMN IF NOT EXISTS slug TEXT,
      ADD COLUMN IF NOT EXISTS state CHAR(2),
      ADD COLUMN IF NOT EXISTS state_name TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)
  `);

  await client.query(`
    UPDATE cities
<<<<<<< HEAD
    SET normalized_name = lower(trim(name))
    WHERE normalized_name IS NULL
      AND name IS NOT NULL;
=======
    SET created_at = COALESCE(created_at, NOW())
    WHERE created_at IS NULL;
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)
  `);

  await client.query(`
    UPDATE cities
<<<<<<< HEAD
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
=======
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
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        WHERE t.relname = 'cities'
          AND pg_table_is_visible(t.oid)
          AND i.indisunique
          AND i.indnkeyatts = 1
          AND (
            SELECT a.attname
            FROM pg_attribute a
            WHERE a.attrelid = t.oid
              AND a.attnum = i.indkey[0]
              AND NOT a.attisdropped
          ) = 'ibge_code'
      ) THEN
        ALTER TABLE cities ADD CONSTRAINT cities_ibge_code_key UNIQUE (ibge_code);
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN unique_violation THEN
        RAISE EXCEPTION
          'cities: existem linhas com ibge_code duplicado ou nulo; corrija antes de importar.';
    END
    $c$;
  `);

  await client.query(`
    DO $c$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        WHERE t.relname = 'cities'
          AND pg_table_is_visible(t.oid)
          AND i.indisunique
          AND i.indnkeyatts = 1
          AND (
            SELECT a.attname
            FROM pg_attribute a
            WHERE a.attrelid = t.oid
              AND a.attnum = i.indkey[0]
              AND NOT a.attisdropped
          ) = 'slug'
      ) THEN
        ALTER TABLE cities ADD CONSTRAINT cities_slug_key UNIQUE (slug);
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN unique_violation THEN
        RAISE EXCEPTION
          'cities: existem linhas com slug duplicado; corrija antes de importar.';
    END
    $c$;
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)
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

<<<<<<< HEAD
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
=======
/**
 * Upsert em uma única ida ao banco (sem ON CONFLICT: compatível mesmo se o planner não enxergar índice único).
 * Ordem: UPDATE por ibge_code → legado sem ibge_code (UF + nome normalizado) → INSERT se ainda não existir.
 */
async function upsertCity(client, city) {
  const params = [
    city.ibge_code,
    city.name,
    city.normalized_name,
    city.slug,
    city.state,
    city.state_name,
  ];

  await client.query(
    `
    WITH by_code AS (
      UPDATE cities
      SET
        name = $2,
        normalized_name = $3,
        slug = $4,
        state = $5,
        state_name = $6,
        updated_at = NOW()
      WHERE ibge_code = $1
      RETURNING id
    ),
    by_legacy AS (
      UPDATE cities
      SET
        ibge_code = $1,
        name = $2,
        normalized_name = $3,
        slug = $4,
        state = $5,
        state_name = $6,
        updated_at = NOW()
      WHERE id = (
        SELECT c.id
        FROM cities c
        WHERE c.ibge_code IS NULL
          AND upper(trim(c.state::text)) = upper(trim($5::text))
          AND (
            trim(
              regexp_replace(
                lower(unaccent(coalesce(c.name, ''))),
                '[[:space:]]+',
                ' ',
                'g'
              )
            ) = $3
            OR trim(coalesce(c.normalized_name::text, '')) = $3
          )
        ORDER BY c.id ASC
        LIMIT 1
      )
      AND NOT EXISTS (SELECT 1 FROM by_code)
      RETURNING id
    ),
    ins AS (
      INSERT INTO cities (ibge_code, name, normalized_name, slug, state, state_name)
      SELECT $1, $2, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM by_code)
        AND NOT EXISTS (SELECT 1 FROM by_legacy)
        AND NOT EXISTS (SELECT 1 FROM cities WHERE ibge_code = $1)
      RETURNING id
    )
    SELECT 1
    `,
    params
  );
}

/**
 * Monta mapa IBGE por UF + nome normalizado. Se a mesma chave aparecer duas vezes na API, marca ambígua.
 */
function buildIbgeLookupFromMunicipios(uf, stateName, municipios) {
  const entries = [];
  if (!Array.isArray(municipios)) {
    return entries;
  }

  for (const city of municipios) {
    const cityName = String(city.nome || "").trim();
    const ibgeCode = Number(city.id);
    if (!cityName || !Number.isFinite(ibgeCode) || ibgeCode <= 0) {
      continue;
    }
    const key = ibgeLookupKey(uf, cityName);
    entries.push({
      key,
      uf,
      stateName,
      ibge_code: ibgeCode,
      name: cityName,
      normalized_name: normalizeText(cityName),
      slug: slugifyCity(cityName, uf),
    });
  }
  return entries;
}

/**
 * Reconcilia linhas legadas sem ibge_code: match inequívoco por UF + nome normalizado (uma linha legada por chave; menor id primeiro).
 */
async function reconcileLegacyCitiesWithoutIbge(client, ibgeByKey) {
  const { rows } = await client.query(`
    SELECT id, name, state
    FROM cities
    WHERE ibge_code IS NULL
    ORDER BY id ASC
  `);

  let reconciled = 0;
  const claimedKeys = new Set();

  for (const row of rows) {
    const uf = String(row.state || "")
      .trim()
      .toUpperCase();
    const rawName = String(row.name || "").trim();
    if (!uf || uf.length !== 2 || !rawName) {
      continue;
    }

    const key = ibgeLookupKey(uf, rawName);
    if (claimedKeys.has(key)) {
      continue;
    }

    const ibge = ibgeByKey.get(key);
    if (!ibge || ibge.ambiguous) {
      continue;
    }

    const taken = await client.query(
      `SELECT 1 FROM cities WHERE ibge_code = $1 AND id <> $2 LIMIT 1`,
      [ibge.ibge_code, row.id]
    );
    if (taken.rows.length > 0) {
      continue;
    }

    let update;
    try {
      update = await client.query(
        `
        UPDATE cities
        SET
          ibge_code = $1,
          name = $2,
          normalized_name = $3,
          slug = $4,
          state = $5,
          state_name = $6,
          updated_at = NOW()
        WHERE id = $7
          AND ibge_code IS NULL
        `,
        [
          ibge.ibge_code,
          ibge.name,
          ibge.normalized_name,
          ibge.slug,
          ibge.uf,
          ibge.state_name,
          row.id,
        ]
      );
    } catch (err) {
      if (err && err.code === "23505") {
        console.warn(
          `[cities:import] Reconciliação: id=${row.id} ignorado (conflito de unicidade slug/ibge).`
        );
        continue;
      }
      throw err;
    }

    if (update.rowCount > 0) {
      claimedKeys.add(key);
      reconciled += 1;
    }
  }

  if (reconciled > 0) {
    console.log(
      `[cities:import] Reconciliação: ${reconciled} cidade(s) legada(s) receberam ibge_code (match por UF + nome).`
    );
  }

  const stillNull = await client.query(
    `SELECT COUNT(*)::int AS n FROM cities WHERE ibge_code IS NULL`
  );
  const n = stillNull.rows?.[0]?.n ?? 0;
  if (n > 0) {
    console.log(
      `[cities:import] Aviso: ${n} registro(s) ainda sem ibge_code (NOT NULL não será forçado até preencher). Revise dados ou rode o import após corrigir.`
    );
  }
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)
}

async function countCities(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM cities`
  );
  return result.rows?.[0]?.total ?? 0;
}

/**
 * Após import completo, reforça NOT NULL apenas onde não há mais NULL (migração progressiva).
 */
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

<<<<<<< HEAD
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalUpdatedByIbge = 0;
    let totalUpdatedByNameState = 0;
=======
    const ibgeByKey = new Map();

    const ufPayloads = [];
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)

    for (const state of states) {
      const uf = String(state.sigla || "").trim().toUpperCase();
      const stateName = String(state.nome || "").trim();

      if (!uf || uf.length !== 2 || !stateName) {
        console.warn("[cities:import] Estado inválido ignorado:", state);
        continue;
      }

      console.log(`[cities:import] Buscando municípios de ${uf}...`);
<<<<<<< HEAD
      const cities = await fetchCitiesByUf(uf);
=======

      const municipios = await fetchCitiesByUf(uf);
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)

      if (!Array.isArray(municipios)) {
        console.warn(`[cities:import] Resposta inesperada para UF ${uf}.`);
        continue;
      }

<<<<<<< HEAD
      let processedInState = 0;
=======
      for (const entry of buildIbgeLookupFromMunicipios(
        uf,
        stateName,
        municipios
      )) {
        if (ibgeByKey.has(entry.key)) {
          const prev = ibgeByKey.get(entry.key);
          prev.ambiguous = true;
        } else {
          ibgeByKey.set(entry.key, {
            ibge_code: entry.ibge_code,
            name: entry.name,
            normalized_name: entry.normalized_name,
            slug: entry.slug,
            uf: entry.uf,
            state_name: entry.stateName,
            ambiguous: false,
          });
        }
      }

      ufPayloads.push({ uf, stateName, municipios });
    }

    await reconcileLegacyCitiesWithoutIbge(client, ibgeByKey);

    let totalProcessed = 0;

    for (const { uf, stateName, municipios } of ufPayloads) {
      if (!Array.isArray(municipios)) {
        continue;
      }

      let stateProcessed = 0;
>>>>>>> 453f5a9 (fix: corrigir footer e blog fallback)

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

    await applyDeferredNotNullConstraints(client);

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
