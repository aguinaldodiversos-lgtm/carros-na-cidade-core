#!/usr/bin/env node
/**
 * lint-images-sizes.mjs
 *
 * PR E — Guardrail IMG-6 da bateria de imagens
 * (DIAGNOSTICO_REDESIGN.md §8.5.1).
 *
 * Falha em duas situações:
 *
 *   A) Uso de <img ... /> cru em qualquer arquivo .tsx do frontend
 *      (devia usar <VehicleImage> ou <Image> de next/image).
 *
 *   B) Uso de <Image .../> de next/image SEM atributo `sizes`
 *      (CLS e bandwidth — todo next/image precisa de sizes).
 *
 * Exclusões:
 *   - Arquivos em components/ui/VehicleImage*.tsx (definição própria)
 *   - Arquivos *.test.tsx (testes podem usar img direto p/ asserts)
 *   - Comentário inline `// lint-images-sizes:allow next-line` permite
 *     casos legítimos.
 *
 * Estado inicial em PR E: este lint detectará violações pré-existentes
 * do projeto. O modo padrão é "warn" — reporta mas não bloqueia. Para
 * bloquear em CI, rodar com --strict (após PR F+ migrar usos).
 *
 * Uso:
 *   node frontend/scripts/lint-images-sizes.mjs
 *   node frontend/scripts/lint-images-sizes.mjs --strict
 */

import { readdir, readFile } from "node:fs/promises";
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

const SCAN_DIRS = ["app", "components", "lib", "hooks"];
const EXCLUDED_FILES = [
  /components[\\/]ui[\\/]VehicleImage(Placeholder)?\.tsx$/,
];

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
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isExcluded(filePath) {
  for (const re of EXCLUDED_FILES) if (re.test(filePath)) return true;
  return false;
}

function findRawImgUsages(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/lint-images-sizes:allow/.test(lines[i - 1] || "")) continue;
    // Detecta "<img " (com ou sem atributo). Ignora comentários.
    if (/^\s*\*/.test(lines[i])) continue;
    const m = lines[i].match(/<img\s/);
    if (m) {
      hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 200), kind: "raw-img" });
    }
  }
  return hits;
}

/**
 * Detecta `<Image ... />` (de next/image) que pode estar SEM `sizes`.
 *
 * Heurística simples: encontra a tag de abertura `<Image` e olha as
 * próximas N linhas até `>` ou `/>`. Se nenhuma tem `sizes=`, reporta.
 *
 * Limitações:
 *   - Componentes que envolvem Image podem confundir a detecção.
 *   - Spreads `{...props}` podem injetar sizes — tratamos isso como
 *     "indeterminado" (não reportamos para evitar falso positivo).
 */
function findImageWithoutSizes(content) {
  const hits = [];
  // Verifica se o arquivo importa Image de "next/image"
  if (!/from\s+["']next\/image["']/.test(content)) return hits;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/lint-images-sizes:allow/.test(lines[i - 1] || "")) continue;
    const open = lines[i].match(/<Image[\s/>]/);
    if (!open) continue;
    // Coletar até 25 linhas para encontrar o fechamento (cobre props longos)
    let j = i;
    let block = "";
    let closed = false;
    while (j < lines.length && j < i + 25) {
      block += " " + lines[j];
      // Consideramos fechado quando encontramos `/>` ou `>` final da tag de
      // abertura (heurística simples). Para detecção mais robusta usar AST.
      if (/\/?>\s*$/.test(lines[j])) {
        closed = true;
        break;
      }
      j++;
    }
    if (!closed) continue;
    if (/\.\.\.[a-zA-Z]/.test(block)) continue; // spread — indeterminado
    if (/sizes\s*=/.test(block)) continue; // tem sizes
    hits.push({ line: i + 1, snippet: lines[i].trim().slice(0, 200), kind: "image-no-sizes" });
  }
  return hits;
}

async function main() {
  const allFiles = [];
  for (const subdir of SCAN_DIRS) {
    allFiles.push(...(await walk(resolve(FRONTEND_ROOT, subdir))));
  }
  const eligible = allFiles.filter((f) => !isExcluded(f) && !/\.test\.tsx?$/.test(f));

  const violations = [];
  for (const file of eligible) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const hit of findRawImgUsages(content)) {
      violations.push({ file: relative(FRONTEND_ROOT, file).replace(/\\/g, "/"), ...hit });
    }
    for (const hit of findImageWithoutSizes(content)) {
      violations.push({ file: relative(FRONTEND_ROOT, file).replace(/\\/g, "/"), ...hit });
    }
  }

  console.log(`🔎 Verificando uso de <img>/<Image> em ${eligible.length} arquivos`);

  if (violations.length === 0) {
    console.log("✅ Sem violações de IMG-6.");
    process.exit(0);
  }

  const rawCount = violations.filter((v) => v.kind === "raw-img").length;
  const noSizesCount = violations.filter((v) => v.kind === "image-no-sizes").length;

  if (STRICT) {
    console.error(`❌ ${violations.length} violação(ões) IMG-6 (modo strict):`);
    console.error(`   - ${rawCount} <img> cru(s)`);
    console.error(`   - ${noSizesCount} <Image> sem sizes`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  [${v.kind}]`);
      console.error(`    ${v.snippet}`);
    }
    process.exit(1);
  }

  // Modo informativo (warn): reporta sem bloquear
  console.warn(`ℹ️  ${violations.length} potencial(is) violação(ões) IMG-6 (modo warn).`);
  console.warn(`   - ${rawCount} <img> cru(s) (devem virar <VehicleImage> ou <Image>)`);
  console.warn(`   - ${noSizesCount} <Image> sem sizes (CLS/bandwidth)`);
  console.warn(`   Execute com --strict para detalhes e bloquear merge.`);
  console.warn(`   Migração progressiva: PRs F+ devem reduzir esses números.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(2);
});
