#!/usr/bin/env node
/**
 * lint-public-fetch.mjs
 *
 * PR B — Guardrail de CI (DIAGNOSTICO_REDESIGN.md §8.4 Contrato SSR).
 *
 * Falha se algum Server Component público em frontend/app/**\/page.tsx
 * usar `fetch(...)` cru para o backend, em vez de `ssrResilientFetch`
 * ou wrapper equivalente.
 *
 * Aplicação: páginas SSR/ISR não podem ter cold start descoberto.
 *
 * Uso:
 *   node frontend/scripts/lint-public-fetch.mjs
 *   exit 0 = ok | exit 1 = violação | exit 2 = erro
 *
 * Como ignorar: comentário `// lint-public-fetch:allow next-line` na linha
 * imediatamente acima da chamada.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(__dirname, "..");
const APP_DIR = resolve(FRONTEND_ROOT, "app");

// Paths que NÃO são páginas públicas (route handlers, pages privadas etc.)
const PRIVATE_PATH_REGEXES = [
  /\/api\//,
  /\/admin\//,
  /\/dashboard\//,
  /\/dashboard-loja\//,
  /\/painel\//,
  /\/anunciar\/novo\//,
  /\/impulsionar\//,
  /\/pagamento\//,
  /\.test\.tsx?$/,
];

function isPublicPage(filePath) {
  const rel = relative(APP_DIR, filePath).replace(/\\/g, "/");
  if (!filePath.endsWith("page.tsx") && !filePath.endsWith("page.jsx")) return false;
  for (const re of PRIVATE_PATH_REGEXES) if (re.test(`/${rel}`)) return false;
  return true;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function findRawFetchUsages(content, filePath) {
  const lines = content.split(/\r?\n/);
  const violations = [];
  // Heurística:
  // - É "use client"? -> ignorar (client fetch é OK para interatividade)
  if (/^\s*["']use client["']/m.test(content)) return violations;

  // Se tem import de ssrResilientFetch, considerar arquivo limpo (uso correto).
  // Permitimos co-existência; o lint detecta apenas fetch cru fora de wrapper.
  // Padrão: chamada direta `fetch(` que NÃO seja `await ssrResilientFetch(`
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/lint-public-fetch:allow/.test(lines[i - 1] || "")) continue;
    // Captura `fetch(` mas não `someName.fetch(`, não `ssrResilientFetch(`
    const match = line.match(/(^|[^.\w])fetch\s*\(/);
    if (match) {
      // Excluir falsos positivos comuns
      if (/ssrResilientFetch\s*\(/.test(line)) continue;
      if (/safeFetch\s*\(/.test(line)) continue;
      violations.push({
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 200),
      });
    }
  }
  return violations;
}

async function main() {
  const allFiles = await walk(APP_DIR);
  const publicPages = allFiles.filter((f) => isPublicPage(f));
  const violations = [];
  for (const file of publicPages) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    violations.push(...findRawFetchUsages(content, file));
  }

  console.log(`🔎 Verificando ${publicPages.length} páginas públicas em ${APP_DIR}`);

  if (violations.length === 0) {
    console.log("✅ Nenhuma chamada fetch crua em Server Component público.");
    process.exit(0);
  }

  console.error(`❌ ${violations.length} violação(ões) encontrada(s):\n`);
  for (const v of violations) {
    const rel = relative(FRONTEND_ROOT, v.file);
    console.error(`  ${rel}:${v.line}`);
    console.error(`    ${v.snippet}`);
  }
  console.error(
    `\nRegra: páginas públicas SSR/ISR devem usar ssrResilientFetch (lib/net/ssr-resilient-fetch.ts).\n` +
      `Para casos legítimos (ex: fetch de URL pública sem backend), adicione comentário:\n` +
      `  // lint-public-fetch:allow next-line`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(2);
});
