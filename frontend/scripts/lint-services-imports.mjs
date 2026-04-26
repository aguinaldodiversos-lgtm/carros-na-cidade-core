#!/usr/bin/env node
/**
 * lint-services-imports.mjs
 *
 * PR B — Guardrail de CI (DIAGNOSTICO_REDESIGN.md §15 + PROJECT_RULES.md).
 *
 * Falha se houver NOVOS imports de `services/` em arquivos modificados ou
 * criados após a data deste guardrail (2026-04-24). Imports existentes são
 * tolerados para permitir migração progressiva (PRs 0.4B → 0.4D).
 *
 * Modos:
 *   --strict        : qualquer import de services/ é erro (ativar após 0.4D)
 *   --baseline=path : compara contra baseline e só falha em novos imports
 *   (default)       : conta imports existentes e mostra como warning
 *
 * Uso:
 *   node frontend/scripts/lint-services-imports.mjs
 *   node frontend/scripts/lint-services-imports.mjs --strict
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(__dirname, "..");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      args[k] = rest.length ? rest.join("=") : true;
    }
  }
  return args;
}

const args = parseArgs();
const STRICT = Boolean(args.strict);
const BASELINE_PATH = args.baseline ? resolve(args.baseline) : null;
const UPDATE_BASELINE = Boolean(args["update-baseline"]);

// Diretórios a varrer
const SCAN_DIRS = ["app", "components", "lib", "hooks"];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findServiceImports(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  // Padrões aceitos:
  //   import ... from '../services/...'
  //   import ... from "@/services/..."
  //   import ... from "services/..."  (alguns aliases)
  //   const x = require('@/services/...')
  const re = /(?:from|require\()\s*["'](?:\.\.\/)*(?:@\/)?services\/([a-zA-Z0-9_-]+)["']/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      hits.push({ line: i + 1, target: m[1], snippet: lines[i].trim().slice(0, 200) });
    }
  }
  return hits;
}

async function main() {
  const allFiles = [];
  for (const subdir of SCAN_DIRS) {
    allFiles.push(...(await walk(resolve(FRONTEND_ROOT, subdir))));
  }

  const violations = [];
  for (const file of allFiles) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const hits = findServiceImports(content);
    for (const hit of hits) {
      violations.push({
        file: relative(FRONTEND_ROOT, file).replace(/\\/g, "/"),
        ...hit,
      });
    }
  }

  console.log(`🔎 Verificando imports de services/ em ${allFiles.length} arquivos`);

  // Atualizar baseline?
  if (UPDATE_BASELINE && BASELINE_PATH) {
    const baseline = violations.map((v) => `${v.file}:${v.line}:${v.target}`).sort();
    await writeFile(BASELINE_PATH, baseline.join("\n") + "\n", "utf8");
    console.log(`✅ Baseline atualizada (${baseline.length} entradas) em ${BASELINE_PATH}`);
    process.exit(0);
  }

  // Modo strict: qualquer import é erro
  if (STRICT) {
    if (violations.length === 0) {
      console.log("✅ Zero imports de services/ — pasta pode ser deletada.");
      process.exit(0);
    }
    console.error(`❌ ${violations.length} import(s) de services/ ainda existem (modo strict):`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} → services/${v.target}`);
      console.error(`    ${v.snippet}`);
    }
    process.exit(1);
  }

  // Modo baseline: comparar com lista permitida
  if (BASELINE_PATH) {
    let baseline = new Set();
    try {
      const text = await readFile(BASELINE_PATH, "utf8");
      baseline = new Set(text.split(/\r?\n/).filter(Boolean));
    } catch {
      console.warn(
        `⚠️  Baseline não encontrado em ${BASELINE_PATH}. Use --update-baseline para criar.`
      );
    }
    const newViolations = violations.filter(
      (v) => !baseline.has(`${v.file}:${v.line}:${v.target}`)
    );
    if (newViolations.length === 0) {
      console.log(`✅ Nenhum NOVO import de services/ (baseline tem ${baseline.size} entradas).`);
      process.exit(0);
    }
    console.error(`❌ ${newViolations.length} NOVO(S) import(s) de services/:`);
    for (const v of newViolations) {
      console.error(`  ${v.file}:${v.line} → services/${v.target}`);
      console.error(`    ${v.snippet}`);
    }
    console.error(
      `\nRegra (PROJECT_RULES.md): novas integrações vão para lib/, não services/.\n` +
        `Para registrar uma migração legítima, atualize o baseline com --update-baseline.`
    );
    process.exit(1);
  }

  // Modo padrão: apenas reportar contagem
  console.log(`ℹ️  ${violations.length} import(s) de services/ existentes (modo informativo).`);
  console.log(`   Use --baseline=path para detectar adições novas.`);
  console.log(`   Use --strict após 0.4D para falhar em qualquer import remanescente.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(2);
});
