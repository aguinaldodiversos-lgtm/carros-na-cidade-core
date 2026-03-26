import pg from "pg";

const { Pool } = pg;

const IBGE_BASE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/'/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugifyCity(name, state) {
  return `${normalizeText(name).replace(/\s+/g, "-")}-${state.toLowerCase()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IBGE request failed (${response.status}) for ${url}: ${text}`);
  }

  return response.json();
}

async function fetchStates() {
  return fetchJson(`${IBGE_BASE_URL}/estados?orderBy=nome`);
}

async function fetchCitiesByUf(uf) {
  return fetchJson(
    `${IBGE_BASE_URL}/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`
  );
}

async function upsertCity(client, city) {
  const query = `
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

  await client.query(query, values);
}

async function run() {
  const client = await pool.connect();

  try {
    console.log("[IBGE] Iniciando importação de cidades...");
    const states = await fetchStates();

    console.log(`[IBGE] ${states.length} estados encontrados.`);

    await client.query("BEGIN");

    let totalImported = 0;

    for (const state of states) {
      const uf = String(state.sigla || "").trim().toUpperCase();
      const stateName = String(state.nome || "").trim();

      if (!uf || !stateName) {
        console.warn("[IBGE] Estado inválido ignorado:", state);
        continue;
      }

      console.log(`[IBGE] Buscando municípios de ${uf}...`);
      const cities = await fetchCitiesByUf(uf);

      for (const city of cities) {
        const cityName = String(city.nome || "").trim();
        const ibgeCode = Number(city.id);

        if (!cityName || !ibgeCode) {
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

        totalImported += 1;
      }

      console.log(`[IBGE] ${uf}: ${cities.length} municípios processados.`);
    }

    await client.query("COMMIT");
    console.log(`[IBGE] Importação concluída com sucesso. Total processado: ${totalImported}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[IBGE] Falha na importação:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
