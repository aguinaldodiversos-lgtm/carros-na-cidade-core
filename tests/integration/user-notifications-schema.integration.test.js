import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * Schema REAL de `user_notifications`, contra um PostgreSQL de verdade.
 *
 * Os testes unitários provam que o SERVIÇO se comporta; eles não podem provar
 * que o BANCO impede duplicidade — um mock que implementa a regra sempre
 * concorda consigo mesmo. Aqui a garantia é exercitada onde ela mora:
 *
 *   • a FK para `users` existe e é CASCADE;
 *   • o índice único (recipient_user_id, idempotency_key) existe e BLOQUEIA;
 *   • dois INSERT CONCORRENTES com a mesma chave produzem UMA linha;
 *   • a mesma chave para usuários diferentes produz DUAS (escopo por
 *     destinatário — o caso que um UNIQUE global quebraria);
 *   • os índices de listagem e de não lidas existem;
 *   • apagar o usuário leva as notificações junto.
 *
 * Banco temporário por caso, criado e destruído no próprio teste (mesmo padrão
 * de `payments-schema.integration.test.js`). Não toca banco de desenvolvimento
 * nem de produção.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up && npx vitest run tests/integration/user-notifications-schema.integration.test.js
 */

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");
const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}
const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));

function makeDbName(label) {
  return `notif_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}
function makeDatabaseUrl(dbName) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}
function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}
async function dropDatabase(dbName) {
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
}
async function withMigratedDatabase(label, callback) {
  const dbName = makeDbName(label);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
  const dbUrl = makeDatabaseUrl(dbName);

  try {
    await runMigrations(dbUrl);
    const pool = new Pool(buildPoolConfig(dbUrl));
    try {
      return await callback(pool);
    } finally {
      await pool.end().catch(() => {});
    }
  } finally {
    await dropDatabase(dbName);
  }
}

async function runMigrations(dbUrl) {
  const entryPath = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c.toString()));
    child.stderr.on("data", (c) => (output += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

/** Cria um usuário mínimo e devolve o id (as notificações precisam de FK válida). */
async function createUser(pool, email) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'Teste') RETURNING id`,
    [email]
  );
  return rows[0].id;
}

const INSERT_NOTIFICATION = `
  INSERT INTO user_notifications (
    recipient_user_id, event_type, title, body, idempotency_key
  )
  VALUES ($1, 'sale_request.bid_received', 'Nova oferta', 'Corpo', $2)
  ON CONFLICT (recipient_user_id, idempotency_key) DO NOTHING
  RETURNING id
`;

describe.sequential("integração — schema de user_notifications", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("tabela, FK CASCADE e índices esperados existem após as migrations", async () => {
    await withMigratedDatabase("schema", async (pool) => {
      const table = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications'`
      );
      expect(table.rowCount, "tabela user_notifications não foi criada").toBe(1);

      // FK real para users, com CASCADE (decisão documentada na migration).
      const fk = await pool.query(`
        SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        WHERE rel.relname = 'user_notifications' AND c.contype = 'f'
      `);
      const fkDefs = fk.rows.map((r) => r.def);
      expect(
        fkDefs.some((d) => /FOREIGN KEY \(recipient_user_id\) REFERENCES users\(id\)/i.test(d))
      ).toBe(true);
      expect(fkDefs.some((d) => /ON DELETE CASCADE/i.test(d))).toBe(true);

      // NÃO deve haver FK para ads/advertisers/plans — o domínio é independente.
      expect(fkDefs.join(" ")).not.toMatch(/REFERENCES (ads|advertisers|subscription_plans)/i);

      const indexes = await pool.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_notifications'`
      );
      const blob = indexes.rows.map((r) => r.indexdef).join(" | ");

      // Único de idempotência, escopado ao destinatário.
      expect(blob).toMatch(/UNIQUE INDEX .*recipient_user_id, idempotency_key/i);
      // Listagem paginada (recência com desempate estável).
      expect(blob).toMatch(/recipient_user_id, created_at DESC, id DESC/i);
      // Contador de não lidas (parcial).
      expect(blob).toMatch(/WHERE \(read_at IS NULL\)/i);
    });
  }, 180000);

  it("o índice único BLOQUEIA duplicidade da mesma chave para o mesmo usuário", async () => {
    await withMigratedDatabase("unique", async (pool) => {
      const userId = await createUser(pool, `notif_unique_${runTag}@test.local`);

      const first = await pool.query(INSERT_NOTIFICATION, [userId, "evento:1"]);
      const second = await pool.query(INSERT_NOTIFICATION, [userId, "evento:1"]);

      expect(first.rowCount).toBe(1);
      // ON CONFLICT DO NOTHING → segunda não insere e NÃO lança.
      expect(second.rowCount).toBe(0);

      const total = await pool.query(
        `SELECT COUNT(*)::int AS n FROM user_notifications WHERE recipient_user_id = $1`,
        [userId]
      );
      expect(total.rows[0].n).toBe(1);
    });
  }, 180000);

  it("INSERTs CONCORRENTES com a mesma chave produzem UMA linha", async () => {
    // A prova que o mock não consegue dar: sem o índice, as duas transações
    // leriam "não existe" e ambas inseririam.
    await withMigratedDatabase("race", async (pool) => {
      const userId = await createUser(pool, `notif_race_${runTag}@test.local`);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => pool.query(INSERT_NOTIFICATION, [userId, "evento:corrida"]))
      );

      const inserted = results.filter((r) => r.rowCount === 1).length;
      expect(inserted, "exatamente uma das inserções concorrentes deve vencer").toBe(1);

      const total = await pool.query(
        `SELECT COUNT(*)::int AS n FROM user_notifications WHERE recipient_user_id = $1`,
        [userId]
      );
      expect(total.rows[0].n).toBe(1);
    });
  }, 180000);

  it("a MESMA chave para usuários diferentes gera DUAS notificações", async () => {
    await withMigratedDatabase("scope", async (pool) => {
      const userA = await createUser(pool, `notif_a_${runTag}@test.local`);
      const userB = await createUser(pool, `notif_b_${runTag}@test.local`);

      const a = await pool.query(INSERT_NOTIFICATION, [userA, "sale_request:1:bid:1"]);
      const b = await pool.query(INSERT_NOTIFICATION, [userB, "sale_request:1:bid:1"]);

      expect(a.rowCount).toBe(1);
      expect(b.rowCount, "fan-out legítimo: o mesmo evento notifica dois usuários").toBe(1);
    });
  }, 180000);

  it("apagar o usuário apaga as notificações dele (CASCADE)", async () => {
    await withMigratedDatabase("cascade", async (pool) => {
      const userId = await createUser(pool, `notif_cascade_${runTag}@test.local`);
      await pool.query(INSERT_NOTIFICATION, [userId, "evento:1"]);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

      const total = await pool.query(`SELECT COUNT(*)::int AS n FROM user_notifications`);
      expect(total.rows[0].n).toBe(0);
    });
  }, 180000);

  it("defaults: payload {} e read_at NULL", async () => {
    await withMigratedDatabase("defaults", async (pool) => {
      const userId = await createUser(pool, `notif_default_${runTag}@test.local`);
      const { rows } = await pool.query(
        `
        INSERT INTO user_notifications (recipient_user_id, event_type, title, body, idempotency_key)
        VALUES ($1, 'x.y', 'T', 'B', 'k')
        RETURNING payload, read_at
        `,
        [userId]
      );

      expect(rows[0].payload).toEqual({});
      expect(rows[0].read_at).toBe(null);
    });
  }, 180000);
});
