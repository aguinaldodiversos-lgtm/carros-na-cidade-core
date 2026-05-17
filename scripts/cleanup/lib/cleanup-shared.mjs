/**
 * Helpers compartilhados pelos scripts de cleanup (cleanup/*.mjs).
 *
 * Princípios herdados de scripts/audit/lib/audit-shared.mjs:
 *   - Read-only por default. `--execute` + `--yes` exigidos para escrever.
 *   - Snapshot ANTES de qualquer UPDATE (rollback determinístico).
 *   - PII redactada antes de output.
 *
 * Padrão de comando (alinhado com scripts/cleanup-orphan-test-ads.mjs):
 *   node scripts/cleanup/<x>.mjs                 # dry-run (default)
 *   node scripts/cleanup/<x>.mjs --execute       # ainda dry-run (--yes faltando)
 *   node scripts/cleanup/<x>.mjs --execute --yes # aplica de fato
 *
 * Dois flags são exigidos para escrever — não basta `--execute`. Evita
 * que um paste descuidado dispare UPDATE em prod.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_AUDIT_DIR = "./reports/audit";
const DEFAULT_CLEANUP_DIR = "./reports/cleanup";

/**
 * Parse argv para flags de cleanup. Mantém shape próximo do
 * audit-shared.parseAuditArgs para consistência.
 *
 * Defaults: dryRun=true, execute=false, yes=false, reaudit=false.
 *
 * Combinação `execute && !yes` continua sendo dry-run — exige confirmação
 * dupla para evitar acidente.
 */
export function parseCleanupArgs(argv) {
  const out = {
    auditFile: "",
    auditDir: DEFAULT_AUDIT_DIR,
    snapshotFile: "",
    cleanupDir: DEFAULT_CLEANUP_DIR,
    execute: false,
    yes: false,
    reaudit: false,
    status: "archived_test",
    silent: false,
    minRemainingActive: 10,
  };

  for (const raw of argv) {
    if (raw === "--execute") out.execute = true;
    else if (raw === "--yes") out.yes = true;
    else if (raw === "--reaudit") out.reaudit = true;
    else if (raw === "--silent") out.silent = true;
    else if (raw === "--dry-run") {
      // explícito; default já é dry-run, mas aceitamos para clareza
      out.execute = false;
    } else if (raw.startsWith("--audit-file=")) {
      out.auditFile = resolve(raw.split("=").slice(1).join("=").trim());
    } else if (raw.startsWith("--audit-dir=")) {
      out.auditDir = raw.split("=").slice(1).join("=").trim() || DEFAULT_AUDIT_DIR;
    } else if (raw.startsWith("--snapshot-file=")) {
      out.snapshotFile = resolve(raw.split("=").slice(1).join("=").trim());
    } else if (raw.startsWith("--cleanup-dir=")) {
      out.cleanupDir = raw.split("=").slice(1).join("=").trim() || DEFAULT_CLEANUP_DIR;
    } else if (raw.startsWith("--status=")) {
      out.status = raw.split("=").slice(1).join("=").trim() || out.status;
    } else if (raw.startsWith("--min-remaining=")) {
      const n = Number(raw.split("=")[1]);
      if (Number.isFinite(n) && n >= 0) out.minRemainingActive = Math.floor(n);
    }
  }

  // Derivado: só escreve no banco se ambos os flags presentes.
  out.willWrite = out.execute === true && out.yes === true;

  return out;
}

/**
 * Procura o relatório mais recente de auditoria que casa com `pattern`
 * dentro de `dir`. Pattern é um prefixo (ex.: "ads-quality"). Devolve
 * caminho absoluto ou null.
 *
 * Convenção dos nomes:
 *   ads-quality-2026-05-16T03-09-50-852Z.json
 *   city-integrity-2026-05-16T00-03-38-153Z.json
 */
export function findLatestAuditReport(dir, pattern) {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) return null;

  const files = readdirSync(absDir)
    .filter((f) => f.startsWith(`${pattern}-`) && f.endsWith(".json"))
    .map((f) => ({ name: f, path: join(absDir, f) }));

  if (files.length === 0) return null;

  // Sort by name desc — timestamp ISO no nome → ordem cronológica direta.
  files.sort((a, b) => b.name.localeCompare(a.name));
  return files[0].path;
}

export function loadAuditReport(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Relatório de auditoria não encontrado: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.findings)) {
    throw new Error(
      `Relatório ${filePath} não tem campo 'findings' como array. Schema esperado: { findings: [...] }`
    );
  }
  return parsed;
}

/**
 * Filtra findings que justificam ARQUIVAMENTO automático:
 *   - kind === "test_ad_suspect"
 *   - confidence === "high"
 *
 * Outros findings (slug_bad, slug_duplicate, test-suspect medium/low)
 * NÃO entram — requerem decisão humana. Esse contrato é o coração da
 * segurança: nada é arquivado sem ter sido identificado por padrão HIGH.
 */
export function selectArchivalCandidates(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.filter(
    (f) =>
      f &&
      f.kind === "test_ad_suspect" &&
      f.confidence === "high" &&
      // Number(null) === 0 (finito!) — precisamos do null-check explícito.
      // Number(undefined) === NaN — coberto pelo isFinite.
      f.id != null &&
      Number.isFinite(Number(f.id))
  );
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Grava JSON pretty no diretório de cleanup. Devolve path absoluto.
 */
export function writeCleanupReport({ cleanupDir, name, payload }) {
  const file = resolve(cleanupDir, `${name}-${timestamp()}.json`);
  ensureDir(file);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

/**
 * Formata sumário de inventário para console.
 */
export function printInventoryReport({ title, totalActive, byState, byCity, alerts }) {
  /* eslint-disable no-console */
  console.log("");
  console.log(`=== ${title} ===`);
  console.log(`  Anúncios ativos:           ${totalActive}`);

  if (Array.isArray(byState) && byState.length > 0) {
    console.log(`  Por estado:`);
    for (const row of byState.slice(0, 27)) {
      console.log(`    ${String(row.state ?? "(null)").padEnd(6, " ")} ${row.count}`);
    }
  }

  if (Array.isArray(byCity) && byCity.length > 0) {
    console.log(`  Top cidades:`);
    for (const row of byCity.slice(0, 10)) {
      console.log(
        `    ${String(row.city_name ?? `city_id=${row.city_id}` ?? "(null)").padEnd(28, " ")} ${row.count}`
      );
    }
  }

  if (Array.isArray(alerts) && alerts.length > 0) {
    console.log("");
    console.log("  ⚠️  ALERTAS:");
    for (const alert of alerts) console.log(`    - ${alert}`);
  }
  /* eslint-enable no-console */
}

export const __INTERNAL__ = {
  DEFAULT_AUDIT_DIR,
  DEFAULT_CLEANUP_DIR,
};
