#!/usr/bin/env node
/**
 * Snapshot de PRODUÇÃO → Postgres LOCAL (F0 — governança do Search Policy Engine).
 *
 * O que faz, nesta ordem:
 *   1. `pg_dump` (formato custom) da origem, rodando DENTRO de um container
 *      `postgres:18` — a máquina não tem pg_dump instalado e produção é PG 18,
 *      então a major precisa casar.
 *   2. `pg_restore --clean --if-exists` no container `carros-postgres-snapshot`
 *      (docker-compose.snapshot.yml, porta 5434).
 *   3. Imprime contagens de conferência.
 *
 * Garantias:
 *   • A origem só recebe `pg_dump` (leitura). Nenhum comando de escrita é
 *     emitido contra ela.
 *   • O destino é FIXO: localhost:5434 / carros_na_cidade_snapshot. Qualquer
 *     tentativa de apontar o restore para outro host é recusada.
 *   • O arquivo de dump vai para `.local/snapshots/` (gitignored). Ele contém
 *     dados pessoais de usuários reais — não copiar para fora da máquina.
 *
 * Uso:
 *   node scripts/db/snapshot-prod-to-local.mjs            # lê DATABASE_URL1 do .env
 *   SNAPSHOT_SOURCE_URL=postgresql://... node scripts/db/snapshot-prod-to-local.mjs
 *   node scripts/db/snapshot-prod-to-local.mjs --restore-only .local/snapshots/<arquivo>.dump
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTAINER = "carros-postgres-snapshot";
const TARGET_DB = "carros_na_cidade_snapshot";
const TARGET_USER = "postgres";
const DUMP_IMAGE = "postgres:18";

const args = process.argv.slice(2);
const restoreOnlyIdx = args.indexOf("--restore-only");

function fail(msg) {
  console.error(`[snapshot] ${msg}`);
  process.exit(1);
}

function readEnvVar(name) {
  if (process.env[name]) return process.env[name].trim();
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return "";
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function maskUrl(url) {
  return url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.slice(0, 3).join(" ")}… saiu com ${r.status}`);
}

// Pré-condições ---------------------------------------------------------------
const ps = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], { encoding: "utf8" });
if (ps.status !== 0 || ps.stdout.trim() !== "true") {
  fail(`container ${CONTAINER} não está rodando. Suba com: docker compose -f docker-compose.snapshot.yml up -d`);
}

const dumpDir = path.join(root, ".local", "snapshots");
mkdirSync(dumpDir, { recursive: true });

let dumpFile;
if (restoreOnlyIdx >= 0) {
  dumpFile = path.resolve(root, args[restoreOnlyIdx + 1] || "");
  if (!existsSync(dumpFile)) fail(`arquivo de dump não encontrado: ${dumpFile}`);
} else {
  // 1. pg_dump ------------------------------------------------------------------
  let source = readEnvVar("SNAPSHOT_SOURCE_URL") || readEnvVar("DATABASE_URL1");
  if (!source) fail("defina SNAPSHOT_SOURCE_URL ou DATABASE_URL1 (no .env).");
  const host = new URL(source).hostname;
  if (/^(localhost|127\.0\.0\.1)$/.test(host)) {
    fail("a origem aponta para localhost — o snapshot é de PRODUÇÃO. Verifique DATABASE_URL1.");
  }
  if (!/[?&]sslmode=/.test(source)) source += (source.includes("?") ? "&" : "?") + "sslmode=require";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  dumpFile = path.join(dumpDir, `prod-${stamp}.dump`);
  console.log(`[snapshot] origem: ${maskUrl(source)}`);
  console.log(`[snapshot] pg_dump (${DUMP_IMAGE}) → ${path.relative(root, dumpFile)}`);

  const fd = openSync(dumpFile, "w");
  const dump = spawnSync(
    "docker",
    [
      "run", "--rm", "-e", "PGSRC", DUMP_IMAGE,
      "pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--dbname", "$PGSRC",
    ].map((a) => (a === "$PGSRC" ? source : a)),
    { env: { ...process.env, PGSRC: source }, stdio: ["ignore", fd, "inherit"] }
  );
  closeSync(fd);
  if (dump.status !== 0) fail(`pg_dump saiu com ${dump.status}`);
  console.log(`[snapshot] dump: ${(statSync(dumpFile).size / 1024 / 1024).toFixed(1)} MB`);
}

// 2. pg_restore ---------------------------------------------------------------
console.log(`[snapshot] pg_restore → ${CONTAINER}/${TARGET_DB} (localhost:5434)`);
const inFd = openSync(dumpFile, "r");
const restore = spawnSync(
  "docker",
  [
    "exec", "-i", CONTAINER,
    "pg_restore", "-U", TARGET_USER, "-d", TARGET_DB,
    "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error",
  ],
  { stdio: [inFd, "inherit", "inherit"] }
);
closeSync(inFd);
if (restore.status !== 0) fail(`pg_restore saiu com ${restore.status}`);

// 3. Conferência --------------------------------------------------------------
const check = `
SELECT 'ads ativos' k, COUNT(*)::text v FROM ads WHERE status='active'
UNION ALL SELECT 'ads total', COUNT(*)::text FROM ads
UNION ALL SELECT 'cities', COUNT(*)::text FROM cities
UNION ALL SELECT 'region_memberships', COUNT(*)::text FROM region_memberships
UNION ALL SELECT 'schema_migrations', COUNT(*)::text FROM schema_migrations
UNION ALL SELECT 'users', COUNT(*)::text FROM users;`;
run("docker", ["exec", CONTAINER, "psql", "-U", TARGET_USER, "-d", TARGET_DB, "-c", check]);
console.log(`[snapshot] pronto. DATABASE_URL=postgresql://postgres:postgres@localhost:5434/${TARGET_DB}`);
