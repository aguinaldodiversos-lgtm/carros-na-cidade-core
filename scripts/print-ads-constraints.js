#!/usr/bin/env node
/**
 * Auditoria do contrato CHECK de `public.ads` vs código canônico.
 *
 * Lista constraints (nome + definição) e compara valores permitidos com:
 *   - src/modules/ads/ads.canonical.constants.js
 *   - normalização em ads.storage-normalize.js (mesmos slugs canônicos)
 *
 * Uso:
 *   DATABASE_URL=postgres://... npm run db:check-ads
 *   DATABASE_URL=... node scripts/print-ads-constraints.js
 *   DATABASE_URL=... node scripts/print-ads-constraints.js --strict   # exit 1 se divergência
 *
 * CI (futuro): CHECK_ADS_STRICT=1 npm run db:check-ads
 */
import pg from "pg";
import {
  CANONICAL_BODY_TYPE_SLUGS,
  CANONICAL_FUEL_TYPE_SLUGS,
  CANONICAL_TRANSMISSION_SLUGS,
} from "../src/modules/ads/ads.canonical.constants.js";

const url = process.env.DATABASE_URL;
const strict =
  process.argv.includes("--strict") ||
  ["1", "true", "yes"].includes(
    String(process.env.CHECK_ADS_STRICT || "").trim().toLowerCase()
  );

if (!url) {
  console.error(
    "[db:check-ads] Defina DATABASE_URL para inspecionar o banco (ex.: staging)."
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

/**
 * Foca o trecho que lista valores permitidos (ANY(ARRAY[...]) ou IN (...)),
 * para não misturar literais de outras colunas no mesmo CHECK.
 */
function extractValueListSegment(definition) {
  const d = String(definition);
  const arrayAny = d.match(
    /=\s*ANY\s*\(\s*\(\s*ARRAY\s*\[([\s\S]*?)\]\s*\)\s*(?:::text\[\]|::\w+\[\])/i
  );
  if (arrayAny) return arrayAny[1];
  const arrayPlain = d.match(/ARRAY\s*\[([\s\S]*?)\]\s*(?:::text\[\]|::\w+\[\])/i);
  if (arrayPlain) return arrayPlain[1];
  const inList = d.match(/\bIN\s*\(\s*([\s\S]*?)\)\s*(?:\)|$)/i);
  if (inList) return inList[1];
  return d;
}

/** Extrai literais 'slug' prováveis (CHECK em Postgres). */
function extractQuotedSlugsFromCheck(definition) {
  const segment = extractValueListSegment(definition);
  const values = new Set();
  const re = /'([a-z][a-z0-9_]*)'/gi;
  let m;
  while ((m = re.exec(segment)) !== null) {
    const v = m[1].toLowerCase();
    if (v === "null" || v === "true" || v === "false") continue;
    values.add(v);
  }
  return values;
}

function classifyConstraint(name, definition) {
  const d = `${name} ${definition}`.toLowerCase();
  if (d.includes("body_type")) return "body_type";
  if (d.includes("fuel_type")) return "fuel_type";
  if (d.includes("transmission")) return "transmission";
  return null;
}

function canonicalSetForColumn(column) {
  if (column === "body_type")
    return new Set([...CANONICAL_BODY_TYPE_SLUGS]);
  if (column === "fuel_type")
    return new Set([...CANONICAL_FUEL_TYPE_SLUGS]);
  if (column === "transmission")
    return new Set([...CANONICAL_TRANSMISSION_SLUGS]);
  return new Set();
}

function diffSets(canonical, fromDb) {
  const missingInDb = [...canonical].filter((x) => !fromDb.has(x)).sort();
  const extraInDb = [...fromDb].filter((x) => !canonical.has(x)).sort();
  return { missingInDb, extraInDb };
}

function printDivider(title) {
  console.log("");
  console.log(`── ${title} ${"─".repeat(Math.max(0, 72 - title.length))}`);
}

try {
  const { rows } = await pool.query(`
    SELECT
      c.conname AS name,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ads'
      AND c.contype = 'c'
    ORDER BY c.conname
  `);

  printDivider("public.ads — CHECK constraints (PostgreSQL)");
  console.log("");

  if (!rows.length) {
    console.warn(
      "[db:check-ads] AVISO: Nenhum CHECK em public.ads (tabela ausente ou sem constraints nomeadas)."
    );
    console.warn(
      "  Compare com docs/database/ads-schema-contract.sql e ads.canonical.constants.js."
    );
    process.exit(strict ? 1 : 0);
  }

  for (const row of rows) {
    console.log(`constraint: ${row.name}`);
    console.log(`definition: ${row.definition}`);
    console.log("");
  }

  console.log(`Total: ${rows.length} constraint(s) CHECK.`);

  printDivider("Contrato: banco vs código (ads.canonical.constants.js)");

  const tracked = ["body_type", "fuel_type", "transmission"];
  const seenColumns = new Set();
  let hasDivergence = false;

  for (const col of tracked) {
    const matching = rows.filter(
      (r) => classifyConstraint(r.name, r.definition) === col
    );

    if (matching.length === 0) {
      console.log(
        `[db:check-ads] ${col}: nenhuma CHECK correspondente encontrada (nome/definição não citam a coluna).`
      );
      console.log(
        `  Slugs esperados no código: ${[...canonicalSetForColumn(col)].sort().join(", ")}`
      );
      hasDivergence = true;
      continue;
    }

    if (matching.length > 1) {
      console.warn(
        `[db:check-ads] AVISO: ${col}: ${matching.length} CHECKs possivelmente relacionadas — usando a primeira para comparação.`
      );
    }

    const { name, definition } = matching[0];
    seenColumns.add(col);

    const fromDb = extractQuotedSlugsFromCheck(definition);
    const canonical = canonicalSetForColumn(col);
    const { missingInDb, extraInDb } = diffSets(canonical, fromDb);

    console.log("");
    console.log(`Coluna: ${col}`);
    console.log(`  Constraint: ${name}`);
    console.log(`  Valores no código (canônicos): ${[...canonical].sort().join(", ")}`);
    console.log(`  Literais extraídos do CHECK: ${[...fromDb].sort().join(", ") || "(nenhum)"}`);

    if (missingInDb.length === 0 && extraInDb.length === 0) {
      console.log(`  Status: OK — conjuntos alinhados (para slugs parseados).`);
      continue;
    }

    hasDivergence = true;
    if (missingInDb.length) {
      console.warn(
        `  [DIVERGÊNCIA] No código, mas não encontrados no CHECK (risco de rejeição no INSERT/UPDATE): ${missingInDb.join(", ")}`
      );
    }
    if (extraInDb.length) {
      console.warn(
        `  [DIVERGÊNCIA] No CHECK, mas não são slugs canônicos no código (dados legados ou contrato antigo): ${extraInDb.join(", ")}`
      );
    }
  }

  printDivider("Notas");
  console.log(
    "• Literais são extraídos por regex das definições CHECK; formatos muito customizados podem exigir revisão manual."
  );
  console.log(
    "• Normalização: ads.storage-normalize.js mapeia sinônimos → estes slugs antes de persistir."
  );
  console.log(
    "• Documentação: docs/database/ads-schema-contract.sql, docs/database/BASELINE_MIGRATIONS.md"
  );

  if (hasDivergence && strict) {
    console.error("");
    console.error(
      "[db:check-ads] Falha em modo strict (divergência ou CHECK ausente). Corrija o schema ou o código."
    );
    process.exit(1);
  }

  process.exit(0);
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
