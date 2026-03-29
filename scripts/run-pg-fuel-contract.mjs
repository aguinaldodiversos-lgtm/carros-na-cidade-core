#!/usr/bin/env node
/**
 * Roda o bloco opcional "integração PostgreSQL" em
 * tests/ads/fuel-transmission-contract.test.js (CHECK em public.ads).
 *
 * Requer Postgres acessível em DATABASE_URL / TEST_DATABASE_URL.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ override: false });

process.env.RUN_PG_ADS_CHECK_TESTS = "1";
process.env.SKIP_PG_INTEGRATION_TESTS = "0";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
if (!existsSync(vitestEntry)) {
  console.error("[run-pg-fuel-contract] vitest não encontrado. Rode npm ci.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [vitestEntry, "run", "tests/ads/fuel-transmission-contract.test.js"],
  { cwd: root, stdio: "inherit", env: { ...process.env } }
);

child.on("exit", (code) => process.exit(code ?? 1));
