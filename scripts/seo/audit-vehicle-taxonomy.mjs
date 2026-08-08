#!/usr/bin/env node
/**
 * Auditoria READ-ONLY da taxonomia automotiva (Fase 3, Etapa 2).
 *
 * Responde à pergunta P0 da fase: `ads.model` guarda o MODELO COMERCIAL
 * ("Onix") ou a DESCRIÇÃO/VERSÃO FIPE ("ONIX SEDAN Plus LT 1.0 12V Flex 4p
 * Mec.")? Sem essa resposta não é possível decidir se páginas de modelo por
 * cidade são entidades reais ou fragmentos.
 *
 * Só executa SELECT. Nenhum INSERT/UPDATE/DELETE/DDL.
 *
 * Alvo: variável de ambiente passada em `--env` (default `DATABASE_URL1`,
 * que é a produção neste projeto — `DATABASE_URL` aponta para o banco de
 * TESTE local, ver docs/database).
 *
 *   node scripts/seo/audit-vehicle-taxonomy.mjs --city atibaia-sp
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const ENV_KEY = arg("env", "DATABASE_URL1");
const CITY = arg("city", "atibaia-sp");

function readConnectionString() {
  if (process.env[ENV_KEY]) return process.env[ENV_KEY];
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${ENV_KEY}=`));
  if (!line) throw new Error(`${ENV_KEY} não encontrada no ambiente nem no .env`);
  return line.slice(ENV_KEY.length + 1).trim();
}

const client = new pg.Client({
  connectionString: readConnectionString(),
  ssl: { rejectUnauthorized: false },
});

const out = {};

async function q(label, sql, params = []) {
  const r = await client.query(sql, params);
  out[label] = r.rows;
  return r.rows;
}

await client.connect();

await q("ads_columns", `
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ads' ORDER BY ordinal_position`);

await q("status_counts", `SELECT status, COUNT(*)::int AS n FROM ads GROUP BY status ORDER BY n DESC`);

await q("cities_with_active", `
  SELECT c.slug, c.name, c.state, COUNT(*)::int AS ativos
  FROM ads a JOIN cities c ON c.id = a.city_id
  WHERE a.status='active' GROUP BY c.slug, c.name, c.state ORDER BY ativos DESC LIMIT 40`);

await q("city_rows", `
  SELECT a.id, a.brand, a.model, a.year, a.body_type, a.transmission, a.fuel_type,
         a.price::float AS price, a.below_fipe,
         a.fipe_reference_value::float AS fipe_value, a.fipe_diff_percent::float AS fipe_diff,
         a.mileage, a.advertiser_id, jsonb_array_length(COALESCE(a.images,'[]'::jsonb)) AS n_images,
         length(COALESCE(a.description,'')) AS desc_len
  FROM ads a JOIN cities c ON c.id = a.city_id
  WHERE a.status='active' AND c.slug=$1 ORDER BY a.brand, a.model`, [CITY]);

await q("brands_all_active", `
  SELECT brand, COUNT(*)::int AS n FROM ads WHERE status='active' GROUP BY brand ORDER BY n DESC`);

await q("models_all_active", `
  SELECT brand, model, COUNT(*)::int AS n FROM ads WHERE status='active'
  GROUP BY brand, model ORDER BY n DESC LIMIT 80`);

await q("model_shape", `
  SELECT COUNT(*) FILTER (WHERE model ~ ' ')::int AS com_espaco,
         COUNT(*) FILTER (WHERE model !~ ' ')::int AS sem_espaco,
         COUNT(*) FILTER (WHERE model ~ '[0-9]\\.[0-9]')::int AS com_motorizacao,
         COUNT(*) FILTER (WHERE model = upper(model))::int AS todo_maiusculo,
         COUNT(*)::int AS total
  FROM ads WHERE status='active'`);

await q("advertisers_columns", `
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='advertisers' ORDER BY ordinal_position`);

await q("city_advertisers", `
  SELECT adv.id, adv.name, adv.slug, COUNT(*)::int AS ativos
  FROM ads a JOIN cities c ON c.id=a.city_id
  LEFT JOIN advertisers adv ON adv.id=a.advertiser_id
  WHERE a.status='active' AND c.slug=$1
  GROUP BY adv.id, adv.name, adv.slug ORDER BY ativos DESC`, [CITY]);

await client.end();

if (args.includes("--json")) {
  console.log(JSON.stringify(out, null, 1));
} else {
  const line = (s) => console.log(s);
  line(`# Taxonomia — auditoria (${ENV_KEY}, cidade=${CITY})`);
  line(`\n## status\n${out.status_counts.map((r) => `${r.status}=${r.n}`).join("  ")}`);
  line(`\n## cidades com inventário ativo`);
  for (const c of out.cities_with_active) line(`  ${c.slug} | ${c.name}/${c.state} | ${c.ativos}`);
  line(`\n## formato de ads.model (ativos)\n  ${JSON.stringify(out.model_shape[0])}`);
  line(`\n## brands distintos (ativos)`);
  for (const b of out.brands_all_active) line(`  ${JSON.stringify(b.brand)} → ${b.n}`);
  line(`\n## models distintos (ativos)`);
  for (const m of out.models_all_active)
    line(`  ${JSON.stringify(m.brand)} | ${JSON.stringify(m.model)} → ${m.n}`);
  line(`\n## colunas de advertisers\n  ${out.advertisers_columns.map((c) => c.column_name).join(", ")}`);
  line(`\n## anunciantes com estoque em ${CITY}`);
  for (const a of out.city_advertisers)
    line(`  id=${a.id} | ${JSON.stringify(a.name)} | slug=${JSON.stringify(a.slug)} | ${a.ativos}`);
  line(`\n## anúncios ativos em ${CITY}`);
  for (const r of out.city_rows)
    line(
      `  #${r.id} ${r.brand} | ${r.model} | ${r.year} | ${r.body_type ?? "-"}/${r.transmission ?? "-"}/${r.fuel_type ?? "-"} | R$${r.price} | belowFipe=${r.below_fipe} fipe=${r.fipe_value ?? "-"} diff=${r.fipe_diff ?? "-"} | km=${r.mileage} imgs=${r.n_images} desc=${r.desc_len}`
    );
}
