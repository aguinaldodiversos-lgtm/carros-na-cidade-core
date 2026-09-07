#!/usr/bin/env node
/**
 * Executa a suíte de integração INTEIRA contra Postgres real.
 *
 * ── Por que este script existe (BUG-INT-01) ─────────────────────────────────
 * `scripts/run-integration-ads-tests.mjs` aponta para UM arquivo:
 * `ads-pipeline.integration.test.js`. Como o CI chamava só ele, os outros 21
 * arquivos de `tests/integration/**` nunca rodavam na pipeline — e seis deles
 * estavam quebrados há tempo indeterminado, com fixtures que não acompanharam
 * o schema (advertisers sem `city_id`/`slug`, `sale_request_offers` sem
 * `round_id`, ads `blocked` sem `blocked_reason_code`).
 *
 * Nada disso é defeito de produto. Mas 20 de 21 arquivos invisíveis ao CI é
 * uma suíte que existe no repositório e não protege nada.
 *
 * ── Quarentena declarada, não silenciosa ────────────────────────────────────
 * Dois arquivos continuam vermelhos por acharem DEFEITO REAL (registrados no
 * relatório da Fase H1.5). Eles ficam fora do conjunto bloqueante — mas com
 * nome, motivo e id do achado impressos a cada execução, e rodados à parte pelo
 * CI num passo não-bloqueante. A diferença entre quarentena e esquecimento é
 * exatamente essa visibilidade.
 *
 * Uso:
 *   node scripts/run-integration-tests.mjs                 # tudo menos a quarentena
 *   node scripts/run-integration-tests.mjs --only-quarantine
 *   node scripts/run-integration-tests.mjs --all           # inclui a quarentena
 *   node scripts/run-integration-tests.mjs <arquivo…>      # alvos explícitos
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../tests/integration/helpers/integration-test-constants.js";

dotenv.config({ override: false });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTEGRATION_DIR = path.join(root, "tests", "integration");

/**
 * Arquivos fora do conjunto bloqueante. Cada entrada precisa de MOTIVO e do id
 * do achado — sem isso vira lista de "testes chatos", que é como quarentena
 * apodrece.
 */
export const QUARANTINE = [
  {
    file: "seed-cities-geo.integration.test.js",
    bug: "BUG-REG-01",
    reason:
      "self-row (layer 0) de region_memberships só é criada pelo backfill da migration 021; " +
      "cidade inserida DEPOIS nunca ganha a linha, e build-region-memberships apenas preserva.",
  },
  {
    file: "migrations-compat.integration.test.js",
    bug: "BUG-MIG-01",
    reason:
      "migration 027 declara platform_settings.updated_by BIGINT REFERENCES users(id); " +
      "em banco legado com users.id UUID a FK não pode ser criada e o migrate aborta.",
  },
];

function listIntegrationFiles() {
  return readdirSync(INTEGRATION_DIR)
    .filter((f) => f.endsWith(".integration.test.js"))
    .sort();
}

function relative(file) {
  return `tests/integration/${file}`;
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const explicitos = args.filter((a) => !a.startsWith("--"));

const quarantinados = new Set(QUARANTINE.map((q) => q.file));
const todos = listIntegrationFiles();

let alvos;
if (explicitos.length > 0) {
  alvos = explicitos;
} else if (flags.has("--only-quarantine")) {
  alvos = QUARANTINE.map((q) => relative(q.file));
} else if (flags.has("--all")) {
  alvos = todos.map(relative);
} else {
  alvos = todos.filter((f) => !quarantinados.has(f)).map(relative);
}

if (alvos.length === 0) {
  console.error("[integration] Nenhum arquivo alvo. Verifique tests/integration/.");
  process.exit(1);
}

// Mesmo preparo de ambiente do runner de ads: sem isso um `.env` com
// SKIP_INTEGRATION_ADS=1 desliga a suíte silenciosamente.
const url =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
process.env.SKIP_INTEGRATION_ADS = "0";
process.env.RUN_INTEGRATION_ADS_TESTS = "1";
process.env.SKIP_PG_INTEGRATION_TESTS = "0";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

if (!String(process.env.JWT_SECRET || "").trim()) {
  process.env.JWT_SECRET = "vitest-integration-jwt-secret-minimum-32-characters-long";
}
if (!String(process.env.JWT_REFRESH_SECRET || "").trim()) {
  process.env.JWT_REFRESH_SECRET = "vitest-integration-refresh-secret-minimum-32-chars-long";
}
if (!String(process.env.AI_MODE || "").trim()) {
  process.env.AI_MODE = "local";
}

const alvoSanitizado = url.replace(/:\/\/[^@]*@/, "://***@");
console.log(`[integration] alvo: ${alvoSanitizado}`);
console.log(`[integration] arquivos: ${alvos.length} de ${todos.length}`);

if (!flags.has("--only-quarantine") && !flags.has("--all") && explicitos.length === 0) {
  for (const q of QUARANTINE) {
    console.log(`[integration] QUARENTENA ${q.bug} — ${q.file}\n               ${q.reason}`);
  }
}

const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
if (!existsSync(vitestEntry)) {
  console.error("[integration] vitest não encontrado em node_modules. Rode npm ci.");
  process.exit(1);
}

// `--no-file-parallelism`: os arquivos criam e derrubam bancos temporários e
// compartilham o servidor Postgres. Em paralelo eles se atropelam e produzem
// falhas que não existem — foi o que aconteceu na primeira medição da
// homologação (8 vermelhos em paralelo, 6 em série).
const child = spawn(
  process.execPath,
  [vitestEntry, "run", ...alvos, "--no-file-parallelism", "--reporter=dot"],
  { cwd: root, stdio: "inherit", env: { ...process.env } }
);

child.on("exit", (code) => process.exit(code ?? 1));
