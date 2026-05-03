#!/usr/bin/env node
/**
 * Popula `cities.latitude` / `cities.longitude` para municípios brasileiros.
 *
 * Por que não usamos a IBGE Localidades API direto?
 * `https://servicodados.ibge.gov.br/api/v1/localidades/municipios` retorna
 * id, nome, microrregiao etc — mas NÃO expõe lat/long de centroide. Os scripts
 * existentes (`seed-ibge-municipios.mjs`, `import-ibge-cities.js`) confirmam:
 * eles só populam name/slug/ibge_code e nenhum lat/long.
 *
 * Para obter lat/long oficiais sem fazer 5570 chamadas a
 * `/api/v3/malhas/municipios/{id}/centroide` (uma por município), usamos um
 * dataset público e curado, derivado dos shapefiles oficiais do IBGE:
 *
 *   https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/json/municipios.json
 *
 * Esse arquivo tem ~5570 entries com `codigo_ibge`, `nome`, `latitude`,
 * `longitude`, `codigo_uf`. MIT-licenciado, atualizado periodicamente.
 *
 * O script:
 *   1. Resolve a fonte (override por CITIES_GEO_SOURCE_FILE para testes;
 *      cache local em scripts/data/ibge-municipios.json com TTL de 30 dias;
 *      caso contrário fetch da URL acima).
 *   2. Normaliza cada entry: { slug, latitude, longitude } onde slug =
 *      slugify(nome) + '-' + uf.toLowerCase(), exatamente como
 *      `seed-ibge-municipios.mjs` grava em cities.slug.
 *   3. Faz UPDATE em cities por slug.
 *      - Sem --force: WHERE latitude IS NULL OR longitude IS NULL (preserva
 *        cidades já populadas; idempotente).
 *      - Com --force: sobrescreve sempre.
 *
 * Tolerância a falhas:
 *   - Se a URL externa cair e o cache existe (mesmo stale), usa o cache.
 *   - Se nem URL nem cache disponíveis, falha com exit 1 (sem dados, sem
 *     trabalho útil — não silenciar).
 *   - Cidade no DB sem match no source: warn + skip.
 *   - Entry no source sem cidade local correspondente: info + skip.
 *
 * Uso:
 *   npm run seed:cities-geo
 *   npm run seed:cities-geo -- --force
 *
 * Pré-requisito: `cities` populado (rode `npm run seed:cities` antes,
 * que popula name/slug a partir da IBGE Localidades).
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import { slugify } from "../src/shared/utils/slugify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SOURCE_URL =
  process.env.CITIES_GEO_SOURCE_URL ||
  "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/json/municipios.json";
const DEFAULT_CACHE_PATH =
  process.env.CITIES_GEO_CACHE_PATH || join(__dirname, "data", "ibge-municipios.json");
const SOURCE_FILE_OVERRIDE = process.env.CITIES_GEO_SOURCE_FILE || null;
const CACHE_MAX_AGE_DAYS = Number(process.env.CITIES_GEO_CACHE_MAX_AGE_DAYS || 30);
const FETCH_TIMEOUT_MS = 30000;

/**
 * Mapa codigo_uf (numerico, padrao IBGE) → sigla. Mesmo conjunto do
 * `seed-ibge-municipios.mjs` (UF_IBGE), invertido para lookup por codigo.
 */
const UF_BY_CODIGO = {
  11: "RO",
  12: "AC",
  13: "AM",
  14: "RR",
  15: "PA",
  16: "AP",
  17: "TO",
  21: "MA",
  22: "PI",
  23: "CE",
  24: "RN",
  25: "PB",
  26: "PE",
  27: "AL",
  28: "SE",
  29: "BA",
  31: "MG",
  32: "ES",
  33: "RJ",
  35: "SP",
  41: "PR",
  42: "SC",
  43: "RS",
  50: "MS",
  51: "MT",
  52: "GO",
  53: "DF",
};

/**
 * Converte um numero de UF do IBGE (11-53) para sigla (RO-DF).
 * Retorna null se invalido — caller deve pular a entry.
 */
export function ufFromCodigoIbge(codigo) {
  return UF_BY_CODIGO[Number(codigo)] || null;
}

/**
 * Converte uma entry do dataset (kelvins-format) para o shape interno
 * { slug, latitude, longitude }. Retorna null se entry invalida — não
 * lança exceção (graceful degrade).
 *
 * Slug e composto exatamente como em `seed-ibge-municipios.mjs`:
 *   `${slugify(nome)}-${uf.toLowerCase()}`
 * Mantemos sincronia com a convencao oficial do projeto.
 */
export function normalizeSourceEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const nome = String(entry.nome || "").trim();
  const codigoUf = entry.codigo_uf;
  // Number(null)/Number("") === 0 (finite!) — então rejeitamos null,
  // undefined e strings vazias ANTES de coagir. Caso contrário, entries
  // sem geo viriam como (0,0) que é um ponto válido no Atlântico.
  const rawLat = entry.latitude;
  const rawLng = entry.longitude;
  if (rawLat == null || rawLng == null) return null;
  if (typeof rawLat === "string" && rawLat.trim() === "") return null;
  if (typeof rawLng === "string" && rawLng.trim() === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!nome || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const uf = ufFromCodigoIbge(codigoUf);
  if (!uf) return null;

  const slugBase = slugify(nome);
  if (!slugBase) return null;

  return {
    slug: `${slugBase}-${uf.toLowerCase()}`,
    latitude: lat,
    longitude: lng,
  };
}

function isCacheFresh(cachePath, maxAgeDays) {
  try {
    const stat = statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < maxAgeDays * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve a fonte de dados em ordem de preferencia:
 *   1. CITIES_GEO_SOURCE_FILE (override total — usado em testes).
 *   2. Cache local fresco (< 30 dias).
 *   3. Fetch da URL externa + escreve cache.
 *   4. Cache local stale (degrade gracioso quando rede caiu).
 *
 * Retorna o array bruto de entries.
 */
async function loadRawSource() {
  if (SOURCE_FILE_OVERRIDE) {
    console.log(`[seed:cities-geo] Usando fonte via env CITIES_GEO_SOURCE_FILE=${SOURCE_FILE_OVERRIDE}`);
    const buf = await fs.readFile(SOURCE_FILE_OVERRIDE, "utf8");
    return JSON.parse(buf);
  }

  if (existsSync(DEFAULT_CACHE_PATH) && isCacheFresh(DEFAULT_CACHE_PATH, CACHE_MAX_AGE_DAYS)) {
    console.log(`[seed:cities-geo] Cache fresco em ${DEFAULT_CACHE_PATH} (< ${CACHE_MAX_AGE_DAYS} dias). Usando.`);
    const buf = await fs.readFile(DEFAULT_CACHE_PATH, "utf8");
    return JSON.parse(buf);
  }

  console.log(`[seed:cities-geo] Buscando fonte: ${DEFAULT_SOURCE_URL}`);
  try {
    const data = await fetchWithTimeout(DEFAULT_SOURCE_URL, FETCH_TIMEOUT_MS);
    if (!Array.isArray(data) || !data.length) {
      throw new Error("Resposta da fonte não é um array não-vazio.");
    }
    await fs.mkdir(dirname(DEFAULT_CACHE_PATH), { recursive: true });
    await fs.writeFile(DEFAULT_CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
    console.log(`[seed:cities-geo] Cache atualizado em ${DEFAULT_CACHE_PATH} (${data.length} entries).`);
    return data;
  } catch (err) {
    console.warn(`[seed:cities-geo] Falha ao buscar fonte: ${err?.message || err}`);
    if (existsSync(DEFAULT_CACHE_PATH)) {
      console.warn(`[seed:cities-geo] Caindo no cache stale em ${DEFAULT_CACHE_PATH}.`);
      const buf = await fs.readFile(DEFAULT_CACHE_PATH, "utf8");
      return JSON.parse(buf);
    }
    throw new Error(
      `Sem fonte e sem cache em ${DEFAULT_CACHE_PATH}. Conecte à rede ou configure CITIES_GEO_SOURCE_FILE.`
    );
  }
}

/**
 * Aplica updates idempotentes em cities. Retorna estatisticas para o
 * relatorio final do CLI.
 *
 * Algoritmo:
 *   - Constroi mapa slug → {lat, lng} a partir do source normalizado.
 *   - SELECT cities (slug, latitude, longitude); itera localmente.
 *   - Para cada cidade local sem lat/long (ou todas, com --force):
 *     se ha entry no mapa, UPDATE; senao, conta como "sem match".
 *   - Conta entries da fonte sem cidade local como "extras" (info).
 */
export async function seedCitiesGeo({ force = false, sourceEntries = null } = {}) {
  const raw = sourceEntries ?? (await loadRawSource());
  const normalized = [];
  let invalidEntries = 0;
  for (const entry of raw) {
    const norm = normalizeSourceEntry(entry);
    if (norm) normalized.push(norm);
    else invalidEntries += 1;
  }

  if (!normalized.length) {
    throw new Error("Nenhuma entry valida apos normalizacao — fonte com schema inesperado.");
  }

  const slugToGeo = new Map();
  for (const entry of normalized) {
    slugToGeo.set(entry.slug, entry);
  }

  console.log(
    `[seed:cities-geo] Source: ${raw.length} entries brutas, ${normalized.length} validas (${invalidEntries} invalidas), ${slugToGeo.size} slugs unicos.`
  );

  const { rows: cities } = await pool.query(
    `SELECT slug, latitude, longitude FROM cities WHERE slug IS NOT NULL`
  );

  let updated = 0;
  let alreadyPopulated = 0;
  let unmatched = 0;
  const matchedSlugs = new Set();

  for (const city of cities) {
    const geo = slugToGeo.get(city.slug);
    if (!geo) {
      unmatched += 1;
      continue;
    }
    matchedSlugs.add(city.slug);

    const cityHasGeo = city.latitude != null && city.longitude != null;
    if (cityHasGeo && !force) {
      alreadyPopulated += 1;
      continue;
    }

    await pool.query(
      `UPDATE cities SET latitude = $1, longitude = $2 WHERE slug = $3`,
      [geo.latitude, geo.longitude, city.slug]
    );
    updated += 1;
  }

  const extras = slugToGeo.size - matchedSlugs.size;

  console.log(`[seed:cities-geo] Resumo:`);
  console.log(`  cities no DB: ${cities.length}`);
  console.log(`  atualizadas:  ${updated}${force ? " (modo --force)" : ""}`);
  console.log(`  ja populadas: ${alreadyPopulated} (idempotencia)`);
  console.log(`  sem match na fonte: ${unmatched} (cidades locais sem lat/long da fonte)`);
  console.log(`  extras na fonte:    ${extras} (entries sem cidade local correspondente)`);

  return { updated, alreadyPopulated, unmatched, extras, totalCities: cities.length };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const force = process.argv.includes("--force");
  try {
    await seedCitiesGeo({ force });
    console.log("[seed:cities-geo] OK");
  } catch (err) {
    console.error("[seed:cities-geo] Falha:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
