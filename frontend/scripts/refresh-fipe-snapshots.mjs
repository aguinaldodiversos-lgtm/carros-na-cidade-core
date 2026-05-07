#!/usr/bin/env node
/**
 * Atualiza os snapshots estáticos da Tabela FIPE (marcas + modelos por marca).
 *
 * Por que: parallelum.com.br rate-limita/bloqueia o IP do Render free tier,
 * derrubando o wizard de anúncio em produção. Os snapshots embutidos servem
 * de fallback determinístico — listas mudam pouco (1-2x ao ano).
 *
 * Uso (rodar a partir da raiz do worktree, com rede aberta):
 *   node frontend/scripts/refresh-fipe-snapshots.mjs
 *
 * Saída:
 *   frontend/lib/fipe/fipe-brands-snapshot.ts
 *   frontend/lib/fipe/snapshots/modelos-carros.json
 *   frontend/lib/fipe/snapshots/modelos-motos.json
 *   frontend/lib/fipe/snapshots/modelos-caminhoes.json
 *
 * Não acessa banco. Não roda em CI por padrão (rate-limit + 200+ requests).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_DIR = resolve(__dirname, "..");
const SNAPSHOT_DIR = resolve(FRONTEND_DIR, "lib/fipe/snapshots");
const BRANDS_TS = resolve(FRONTEND_DIR, "lib/fipe/fipe-brands-snapshot.ts");

const BASE = "https://parallelum.com.br/fipe/api/v1";
const TYPES = ["carros", "motos", "caminhoes"];
const SLEEP_MS = 80;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function normalizeOption(item) {
  return {
    code: String(item.codigo ?? item.code ?? "").trim(),
    name: String(item.nome ?? item.name ?? "").trim(),
  };
}

async function fetchBrands(type) {
  const data = await fetchJson(`${BASE}/${type}/marcas`);
  return data
    .map(normalizeOption)
    .filter((b) => b.code && b.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function fetchModels(type, brandCode) {
  const data = await fetchJson(
    `${BASE}/${type}/marcas/${encodeURIComponent(brandCode)}/modelos`
  );
  const list = Array.isArray(data?.modelos) ? data.modelos : [];
  return list.map(normalizeOption).filter((m) => m.code && m.name);
}

async function main() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  // 1. Marcas (3 endpoints, salva como TS embutido).
  const brands = {};
  for (const type of TYPES) {
    brands[type] = await fetchBrands(type);
    console.log(`brands ${type}: ${brands[type].length}`);
    await sleep(SLEEP_MS);
  }

  const brandsHeader = `/**
 * Snapshot estático das marcas FIPE — fallback quando o provider público
 * (parallelum.com.br) está indisponível pra rede do servidor (caso real:
 * Render free tier sendo bloqueado/rate-limited por IP).
 *
 * Atualizar via:
 *   node frontend/scripts/refresh-fipe-snapshots.mjs
 *
 * Capturado em ${new Date().toISOString().slice(0, 10)}: ${brands.carros.length} marcas de carros, ${brands.motos.length} motos, ${brands.caminhoes.length} caminhões.
 */
`;
  writeFileSync(
    BRANDS_TS,
    brandsHeader +
      `export const FIPE_BRAND_SNAPSHOT = ${JSON.stringify(brands, null, 2)} as const;\n`
  );
  console.log(`wrote ${BRANDS_TS}`);

  // 2. Modelos (1 endpoint por marca, salva como JSON puro por tipo).
  for (const type of TYPES) {
    const out = {};
    let errors = 0;
    for (const brand of brands[type]) {
      try {
        const list = await fetchModels(type, brand.code);
        out[brand.code] = list;
      } catch (err) {
        errors++;
        console.error(`FAIL ${type} ${brand.code} ${brand.name}:`, err.message);
      }
      await sleep(SLEEP_MS);
    }
    const total = Object.values(out).reduce((s, a) => s + a.length, 0);
    const path = resolve(SNAPSHOT_DIR, `modelos-${type}.json`);
    writeFileSync(path, JSON.stringify(out));
    console.log(
      `models ${type}: brands=${Object.keys(out).length} models=${total} errors=${errors} → ${path}`
    );
  }
}

main().catch((err) => {
  console.error("refresh-fipe-snapshots failed:", err);
  process.exit(1);
});
