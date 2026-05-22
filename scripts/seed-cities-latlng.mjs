#!/usr/bin/env node
/**
 * Popula cities.latitude e cities.longitude a partir da API pública do IBGE.
 *
 * Estratégia:
 *   1. Busca todos os municípios do IBGE com coordenadas
 *      (GET https://servicodados.ibge.gov.br/api/v2/malhas/municipios?formato=application/json)
 *   2. Junta pelo ibge_code (cities.ibge_code = municipio.id).
 *   3. UPDATE em batch de 500 por vez (menor pressão no Postgres).
 *   4. Imprime resumo: atualizados, não encontrados, sem coordenada no IBGE.
 *
 * Pré-requisito: migration 028 aplicada (colunas lat/lng já existem desde 021).
 *
 * Uso:
 *   DATABASE_URL1=<url> node scripts/seed-cities-latlng.mjs
 *   ou simplesmente:
 *   npm run seed:latlng          (se o script for adicionado ao package.json)
 *
 * Idempotente: só atualiza linhas onde ibge_code bate. Cidades sem ibge_code
 * são puladas. Re-executar sobrescreve com o mesmo valor — seguro.
 *
 * Após rodar este script com sucesso:
 *   npm run regions:build        ← reconstrói region_memberships com vizinhança real
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// ─── API do IBGE ──────────────────────────────────────────────────────────────
// O endpoint /localidades/municipios retorna o array completo de municípios
// com campos: id (código IBGE 7 dígitos), nome, microrregiao, etc.
// As coordenadas do centroide estão em um endpoint separado:
//   /api/v2/malhas/municipios — GeoJSON, muito pesado.
//
// Alternativa mais leve: /api/v1/localidades/municipios
// Retorna id, nome, mesorregiao.UF.sigla. Sem coordenadas diretamente.
//
// Melhor fonte de coordenadas com ibge_code: IBGE lugares
//   GET https://servicodados.ibge.gov.br/api/v1/localidades/municipios
//   (não tem coordenadas nativas)
//
// Estratégia adotada: IBGE municipalities-geolocation API oficial:
//   https://brasilapi.com.br/api/ibge/municipios/v1/{uf}?providers=dados-abertos-br,gov,wikipedia
// ou o dataset de centróides disponível em:
//   https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv
//
// Usamos o CSV do kelvins/municipios-brasileiros que tem:
//   codigo_ibge, nome, latitude, longitude, capital, codigo_uf
// É um dataset mantido com dados do IBGE/OpenStreetMap — ~5 MB, estável.
// ─────────────────────────────────────────────────────────────────────────────

const MUNICIPIOS_CSV_URL =
  "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";

const BATCH_SIZE = 500;

async function fetchCsvAsText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return res.text();
}

/**
 * Parse mínimo de CSV: primeira linha = headers, demais = dados.
 * Suporta vírgula como separador e aspas duplas ao redor dos campos.
 */
function parseCsv(raw) {
  const lines = raw.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

/**
 * UPDATE em batch via unnest para evitar round-trips por linha.
 * Só toca linhas com ibge_code correspondente — nunca full-table update.
 */
async function batchUpdate(client, batch) {
  if (!batch.length) return 0;

  // batch = [{ ibge_code, latitude, longitude }, ...]
  const codes = batch.map((r) => r.ibge_code);
  const lats = batch.map((r) => r.latitude);
  const lngs = batch.map((r) => r.longitude);

  const result = await client.query(
    `
    UPDATE cities SET
      latitude  = data.lat,
      longitude = data.lng,
      updated_at = NOW()
    FROM (
      SELECT
        unnest($1::bigint[]) AS ibge_code,
        unnest($2::numeric[]) AS lat,
        unnest($3::numeric[]) AS lng
    ) AS data
    WHERE cities.ibge_code = data.ibge_code
    `,
    [codes, lats, lngs]
  );
  return result.rowCount ?? 0;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL1 || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL1 ou DATABASE_URL não definido.");
    process.exitCode = 1;
    return;
  }

  const useSSL =
    dbUrl.includes("render.com") || dbUrl.includes("neon") || dbUrl.includes("supabase");

  const client = new Client({
    connectionString: dbUrl,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    console.log("[seed:latlng] Baixando dataset de municípios (kelvins/municipios-brasileiros)...");
    const csv = await fetchCsvAsText(MUNICIPIOS_CSV_URL);
    const rows = parseCsv(csv);
    console.log(`[seed:latlng] ${rows.length} municípios no dataset.`);

    // Prepara mapa codigo_ibge → { lat, lng }
    const ibgeMap = new Map();
    let semCoordenada = 0;
    for (const row of rows) {
      const code = parseInt(row.codigo_ibge || row.ibge_code || "", 10);
      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      if (!code || isNaN(lat) || isNaN(lng)) {
        semCoordenada++;
        continue;
      }
      ibgeMap.set(code, { latitude: lat, longitude: lng });
    }
    console.log(
      `[seed:latlng] ${ibgeMap.size} com coordenadas válidas; ${semCoordenada} sem coordenada.`
    );

    // Lê ibge_codes do banco
    const { rows: dbCities } = await client.query(
      `SELECT id, ibge_code FROM cities WHERE ibge_code IS NOT NULL`
    );
    console.log(`[seed:latlng] ${dbCities.length} cidades com ibge_code no banco.`);

    // Monta batch
    const toUpdate = [];
    let semMatch = 0;
    for (const city of dbCities) {
      const code = Number(city.ibge_code);
      const coords = ibgeMap.get(code);
      if (!coords) {
        semMatch++;
        continue;
      }
      toUpdate.push({ ibge_code: code, latitude: coords.latitude, longitude: coords.longitude });
    }
    console.log(
      `[seed:latlng] ${toUpdate.length} cidades para atualizar; ${semMatch} sem match no dataset IBGE.`
    );

    if (!toUpdate.length) {
      console.log("[seed:latlng] Nada a atualizar. Verifique se ibge_code está populado no banco.");
      return;
    }

    // Executa em batches
    let totalUpdated = 0;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const count = await batchUpdate(client, batch);
      totalUpdated += count;
      process.stdout.write(
        `\r[seed:latlng] Batch ${Math.ceil((i + 1) / BATCH_SIZE)}/${Math.ceil(toUpdate.length / BATCH_SIZE)} — ${totalUpdated} atualizadas`
      );
    }
    console.log(); // newline após o progress

    console.log(`[seed:latlng] OK — ${totalUpdated} cidades com lat/lng atualizado.`);
    if (totalUpdated < toUpdate.length) {
      console.warn(
        `[seed:latlng] ATENÇÃO: ${toUpdate.length - totalUpdated} registros não foram atualizados ` +
          `(ibge_code pode não estar na tabela cities ou lat/lng inalterado).`
      );
    }

    console.log("\n[seed:latlng] Próximo passo: npm run regions:build");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed:latlng] Falha:", err?.message || err);
  process.exitCode = 1;
});
