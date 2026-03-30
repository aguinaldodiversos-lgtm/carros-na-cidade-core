#!/usr/bin/env node
/**
 * Executa a suíte ads-pipeline contra Postgres real, sem depender de adivinhar variáveis:
 * - define TEST_DATABASE_URL / DATABASE_URL (porta 5433 por padrão)
 * - define SKIP_INTEGRATION_ADS=0 antes do Vitest (evita .env com SKIP=1)
 * - dotenv no arquivo de teste usa override:false para não sobrescrever
 *
 * Uso: npm run test:integration:ads
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../tests/integration/helpers/integration-test-constants.js";

dotenv.config({ override: false });

const url =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
process.env.SKIP_INTEGRATION_ADS = "0";
process.env.RUN_INTEGRATION_ADS_TESTS = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

if (!String(process.env.JWT_SECRET || "").trim()) {
  process.env.JWT_SECRET = "vitest-integration-jwt-secret-minimum-32-characters-long";
}
if (!String(process.env.JWT_REFRESH_SECRET || "").trim()) {
  process.env.JWT_REFRESH_SECRET = "vitest-integration-refresh-secret-minimum-32-chars-long";
}

// Integração: não consumir API paga por defeito (orquestrador em modo local).
if (!String(process.env.AI_MODE || "").trim()) {
  process.env.AI_MODE = "local";
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
if (!existsSync(vitestEntry)) {
  console.error("[run-integration-ads-tests] vitest não encontrado em node_modules. Rode npm ci.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [vitestEntry, "run", "tests/integration/ads-pipeline.integration.test.js"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  }
);

child.on("exit", (code) => process.exit(code ?? 1));
