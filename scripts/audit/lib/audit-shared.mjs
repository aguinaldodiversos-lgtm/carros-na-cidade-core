/**
 * Helpers compartilhados pelos scripts de auditoria de qualidade de dados.
 *
 * Princípios:
 *   - Read-only por contrato. Nenhuma função aqui escreve no DB.
 *   - Redaction explícita: emails/telefones/CPFs do payload viram tokens
 *     genéricos antes de qualquer CSV/JSON. PII fora do output é regra
 *     LGPD (relatório pode acabar em GitHub PR).
 *   - Output dual: console summary + arquivo JSON/CSV em `reports/audit/`.
 *
 * Os scripts chamadores devem importar daqui e nunca redefinir esses
 * comportamentos — assim o contrato fica consistente entre os 3 audits.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_LIMIT = 1000;
const DEFAULT_REPORT_DIR = "./reports/audit";

/**
 * Identifier seguro de coluna/tabela Postgres — só letras, dígitos e
 * underscore, começando com letra ou underscore. Defesa contra SQL
 * injection no caso (improvável mas possível) de alguém estender a lista
 * de colunas requested com input externo.
 */
const SAFE_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i;

/**
 * Parse seguro de argv para flags `--name=value` e booleans `--flag`.
 *
 * Não usa `process.exit` para erros — devolve `{ ok: false, error }`
 * e o caller decide. Isso facilita testes unitários no futuro.
 */
export function parseAuditArgs(argv) {
  const out = {
    limit: DEFAULT_LIMIT,
    outputDir: DEFAULT_REPORT_DIR,
    outputFormat: "json",
    statusFilter: "active",
    sinceDays: null,
    sampleOnly: false,
    silent: false,
    printSchema: false,
  };

  for (const raw of argv) {
    if (raw === "--sample") {
      out.sampleOnly = true;
      out.limit = 100;
    } else if (raw === "--silent") {
      out.silent = true;
    } else if (raw === "--all-statuses") {
      out.statusFilter = null;
    } else if (raw === "--print-schema") {
      // Diagnóstico: imprime colunas detectadas no DB e sai sem extrair
      // dados de anúncio. Útil quando o schema de produção diverge da
      // assunção do script (causa do incidente PR5 → PR6: coluna
      // `version` inexistente).
      out.printSchema = true;
    } else if (raw.startsWith("--limit=")) {
      const n = Number(raw.split("=")[1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
    } else if (raw.startsWith("--out=") || raw.startsWith("--output-dir=")) {
      out.outputDir = raw.split("=").slice(1).join("=").trim() || DEFAULT_REPORT_DIR;
    } else if (raw.startsWith("--format=")) {
      const f = raw.split("=")[1]?.toLowerCase();
      if (f === "csv" || f === "json") out.outputFormat = f;
    } else if (raw.startsWith("--status=")) {
      out.statusFilter = raw.split("=").slice(1).join("=").trim();
    } else if (raw.startsWith("--since-days=")) {
      const n = Number(raw.split("=")[1]);
      if (Number.isFinite(n) && n > 0) out.sinceDays = Math.floor(n);
    }
  }

  // Hard cap defensivo — relatórios não devem extrair o banco inteiro.
  if (out.limit > 50_000) out.limit = 50_000;

  return out;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

/**
 * Mascara PII em strings. Usar antes de escrever em CSV/JSON.
 */
export function redactPii(value) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  return value
    .replace(EMAIL_RE, "<email-redacted>")
    .replace(CPF_RE, "<cpf-redacted>")
    .replace(CNPJ_RE, "<cnpj-redacted>")
    .replace(PHONE_RE, "<phone-redacted>");
}

/**
 * Aplica redactPii em todas as strings dentro de um objeto, recursivamente.
 * Limites: max 50 propriedades por nível, profundidade 5.
 */
export function redactPiiDeep(obj, depth = 0) {
  if (depth > 5) return obj;
  if (obj == null) return obj;
  if (typeof obj === "string") return redactPii(obj);
  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map((item) => redactPiiDeep(item, depth + 1));
  }
  if (typeof obj === "object") {
    const result = {};
    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      if (count++ >= 50) break;
      result[key] = redactPiiDeep(value, depth + 1);
    }
    return result;
  }
  return obj;
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Grava relatório JSON com metadados de auditoria. Retorna o path absoluto.
 */
export function writeJsonReport({ outputDir, name, summary, findings }) {
  const file = resolve(outputDir, `${name}-${timestamp()}.json`);
  ensureDir(file);
  const payload = {
    audit: name,
    generatedAt: new Date().toISOString(),
    summary,
    findings: findings.map((f) => redactPiiDeep(f)),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Grava CSV com headers derivados das chaves do primeiro objeto.
 * PII já é redactada via redactPiiDeep antes da escrita.
 */
export function writeCsvReport({ outputDir, name, rows }) {
  const file = resolve(outputDir, `${name}-${timestamp()}.csv`);
  ensureDir(file);
  if (rows.length === 0) {
    writeFileSync(file, "no_findings\n", "utf8");
    return file;
  }
  const redacted = rows.map((r) => redactPiiDeep(r));
  const headers = Array.from(
    redacted.reduce((acc, row) => {
      for (const k of Object.keys(row)) acc.add(k);
      return acc;
    }, new Set())
  );
  const lines = [headers.join(",")];
  for (const row of redacted) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

/**
 * Formata sumário em ASCII tabular para console (não-silencioso).
 */
export function printSummary({ title, summary }) {
  /* eslint-disable no-console */
  console.log("");
  console.log(`=== ${title} ===`);
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k.padEnd(28, " ")}: ${v}`);
  }
  /* eslint-enable no-console */
}

/**
 * Trunca string longa para preview sem extrapolar PII. Útil em logs.
 */
export function truncate(value, max = 80) {
  const s = redactPii(value == null ? "" : String(value));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Lê as colunas existentes de uma tabela em `public` via
 * `information_schema.columns`. Devolve um `Set<string>` (lowercase, sem
 * mutation no caller).
 *
 * Por que existe:
 *   PR5 assumiu coluna `version` em `ads` que não existe em produção. O
 *   script quebrou com 'column "version" does not exist'. A solução é
 *   introspectar o schema antes de montar o SELECT, e omitir colunas
 *   ausentes (com warning explícito, não silenciosamente).
 */
export async function fetchExistingColumns(poolLike, tableName) {
  if (!poolLike || typeof poolLike.query !== "function") {
    throw new Error("fetchExistingColumns: pool inválido (espera-se objeto com .query)");
  }
  if (!SAFE_IDENTIFIER_RE.test(String(tableName || ""))) {
    throw new Error(`fetchExistingColumns: nome de tabela inválido '${tableName}'`);
  }
  const result = await poolLike.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => String(row.column_name).toLowerCase()));
}

/**
 * Filtra uma lista REQUESTED de colunas pelo conjunto AVAILABLE. Devolve
 * `{ present, missing }` ambos ordenados. Defende contra identifier
 * unsafe (SAFE_IDENTIFIER_RE) — qualquer entrada que não bata o pattern
 * é descartada silenciosamente e contada em `unsafe` (sem entrar em
 * present nem em missing).
 */
export function buildSafeColumnList(available, requested) {
  if (!(available instanceof Set)) {
    throw new Error("buildSafeColumnList: 'available' precisa ser Set");
  }
  if (!Array.isArray(requested)) {
    throw new Error("buildSafeColumnList: 'requested' precisa ser array");
  }

  const present = [];
  const missing = [];
  const unsafe = [];

  for (const raw of requested) {
    const col = String(raw || "").trim().toLowerCase();
    if (!col) continue;
    if (!SAFE_IDENTIFIER_RE.test(col)) {
      unsafe.push(raw);
      continue;
    }
    if (available.has(col)) {
      present.push(col);
    } else {
      missing.push(col);
    }
  }

  return { present, missing, unsafe };
}

/**
 * Prefixa uma lista de colunas com um alias de tabela (ex.: "a." ou "c.").
 * Não muda o conteúdo de present/missing — apenas formata.
 */
export function withAlias(columns, alias) {
  if (!alias) return [...columns];
  if (!SAFE_IDENTIFIER_RE.test(alias)) {
    throw new Error(`withAlias: alias inválido '${alias}'`);
  }
  return columns.map((c) => `${alias}.${c}`);
}

/**
 * Mostra um diagnóstico de schema com colunas detectadas vs colunas
 * pedidas pelo script. Usado por `--print-schema` quando o operador quer
 * confirmar o que o script vai consultar antes de uma corrida real.
 */
export function printSchemaDiagnostic({ table, available, requested }) {
  const { present, missing, unsafe } = buildSafeColumnList(available, requested);
  /* eslint-disable no-console */
  console.log("");
  console.log(`=== Schema diagnostic: ${table} ===`);
  console.log(`  Colunas detectadas (${available.size}):`);
  console.log(`    ${[...available].sort().join(", ")}`);
  console.log(`  Colunas pedidas pelo script (${requested.length}):`);
  console.log(`    ${requested.join(", ")}`);
  console.log(`  PRESENT (${present.length}): ${present.join(", ") || "(nenhuma)"}`);
  console.log(`  MISSING (${missing.length}): ${missing.join(", ") || "(nenhuma)"}`);
  if (unsafe.length > 0) {
    console.log(`  UNSAFE/ignored (${unsafe.length}): ${unsafe.join(", ")}`);
  }
  /* eslint-enable no-console */
  return { present, missing, unsafe };
}

export const __INTERNAL__ = {
  DEFAULT_LIMIT,
  DEFAULT_REPORT_DIR,
  EMAIL_RE,
  PHONE_RE,
  CPF_RE,
  CNPJ_RE,
  SAFE_IDENTIFIER_RE,
};
