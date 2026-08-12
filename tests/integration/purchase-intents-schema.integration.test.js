import dotenv from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import { ADVERTISER_IS_OPERATIONAL } from "../../src/modules/purchase-intents/purchase-intents.repository.js";
import { ADVERTISER_STATUS } from "../../src/shared/constants/status.js";

/**
 * Schema REAL de `purchase_intents`, contra um PostgreSQL de verdade.
 *
 * Os testes unitários provam que o SERVIÇO se comporta. Eles não podem provar
 * que o BANCO recusa uma linha torta — o fake implementa a regra e depois
 * concorda consigo mesmo. Aqui a garantia é exercitada onde ela mora:
 *
 *   • a tabela existe com as colunas conceituais da fase;
 *   • FK de `buyer_user_id` para `users` com CASCADE;
 *   • FK de `city_id` para `cities`, e ela IMPEDE cidade inexistente;
 *   • NENHUMA FK para ads / advertisers / plans / payments / leads / messages
 *     — a Fase 2 cria só a procura, e uma ponte acidental para estoque seria
 *     justamente a Fase 3 vazando para cá;
 *   • os dois índices de leitura existem, e o da cidade é PARCIAL;
 *   • os CHECKs de vocabulário e o CHECK de FORMA recusam de verdade;
 *   • apagar o usuário leva as procuras junto.
 *
 * Banco temporário por caso, criado e destruído no próprio teste. Não toca
 * banco de desenvolvimento nem de produção.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up && npx vitest run tests/integration/purchase-intents-schema.integration.test.js
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
  return `pintent_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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

async function createUser(pool, email) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'Teste') RETURNING id`,
    [email]
  );
  return rows[0].id;
}

async function createCity(pool, slug) {
  const { rows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', $1) RETURNING id`,
    [slug]
  );
  return rows[0].id;
}

/** INSERT completo no modo 'specific_model'. Os testes sobrescrevem o que precisam. */
function insertIntentSql(overrides = {}) {
  const row = {
    intent_type: "specific_model",
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    body_type: null,
    transmission: "automatico",
    max_price: 95000,
    purchase_timeframe: "within_30_days",
    status: "active",
    ...overrides,
  };

  return {
    text: `
      INSERT INTO purchase_intents (
        buyer_user_id, city_id, intent_type,
        brand, brand_slug, model, model_slug,
        body_type, transmission, max_price, purchase_timeframe,
        status, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() + INTERVAL '30 days')
      RETURNING id
    `,
    values: (userId, cityId) => [
      userId,
      cityId,
      row.intent_type,
      row.brand,
      row.brand_slug,
      row.model,
      row.model_slug,
      row.body_type,
      row.transmission,
      row.max_price,
      row.purchase_timeframe,
      row.status,
    ],
  };
}

async function listColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
      ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return rows;
}

afterAll(async () => {
  await adminPool.end().catch(() => {});
});

describe.sequential("integração — schema de purchase_intents", () => {
  it("cria a tabela com as colunas conceituais da fase", async () => {
    await withMigratedDatabase("cols", async (pool) => {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'purchase_intents'`
      );
      expect(rowCount).toBe(1);

      const columns = await listColumns(pool, "purchase_intents");
      const names = columns.map((c) => c.column_name);

      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "buyer_user_id",
          "city_id",
          "intent_type",
          "brand",
          "brand_slug",
          "model",
          "model_slug",
          "body_type",
          "transmission",
          "max_price",
          "purchase_timeframe",
          "status",
          "expires_at",
          "created_at",
          "updated_at",
        ])
      );

      const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));
      // Convenção monetária do projeto — a mesma de ads.price.
      expect(byName.max_price.data_type).toBe("numeric");
      expect(byName.max_price.is_nullable).toBe("NO");
      // Cidade e prazo nunca podem ficar em aberto.
      expect(byName.city_id.is_nullable).toBe("NO");
      expect(byName.expires_at.is_nullable).toBe("NO");
      expect(byName.transmission.is_nullable).toBe("NO");
      // Marca/modelo/carroceria são nulos por modo (ver CHECK de forma).
      expect(byName.brand.is_nullable).toBe("YES");
      expect(byName.body_type.is_nullable).toBe("YES");
    });
  }, 180000);

  it("tem FK para users (CASCADE) e para cities, e NENHUMA para ads/advertisers/planos", async () => {
    await withMigratedDatabase("fks", async (pool) => {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(c.oid) AS def
             FROM pg_constraint c
             JOIN pg_class rel ON rel.oid = c.conrelid
            WHERE rel.relname = 'purchase_intents' AND c.contype = 'f'`
      );
      const defs = rows.map((r) => r.def);
      const joined = defs.join(" ");

      expect(joined).toMatch(/FOREIGN KEY \(buyer_user_id\) REFERENCES users\(id\)/i);
      expect(joined).toMatch(/FOREIGN KEY \(buyer_user_id\)[^,]*ON DELETE CASCADE/i);
      expect(joined).toMatch(/FOREIGN KEY \(city_id\) REFERENCES cities\(id\)/i);

      // A procura NÃO se liga a estoque nesta fase. Uma FK para `ads` aqui
      // seria a Fase 3 entrando pela porta dos fundos.
      expect(joined).not.toMatch(
        /REFERENCES (ads|advertisers|subscription_plans|payments|leads|messages)\b/i
      );
    });
  }, 180000);

  it("a FK de cidade recusa city_id inexistente", async () => {
    await withMigratedDatabase("fkcity", async (pool) => {
      const userId = await createUser(pool, "fkcity@test.local");
      const { text, values } = insertIntentSql();

      await expect(pool.query(text, values(userId, 999999))).rejects.toMatchObject({
        code: "23503",
      });
    });
  }, 180000);

  it("cria os índices de leitura, e o da cidade é PARCIAL em status='active'", async () => {
    await withMigratedDatabase("idx", async (pool) => {
      const { rows } = await pool.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'purchase_intents'`
      );
      const defs = rows.map((r) => r.indexdef).join(" ");

      // Listagem do comprador.
      expect(defs).toMatch(/buyer_user_id, created_at DESC, id DESC/i);
      // Listagem do lojista, restrita às ativas.
      expect(defs).toMatch(/city_id, expires_at, created_at DESC, id DESC/i);
      expect(defs).toMatch(/WHERE \(status = 'active'::text\)/i);
    });
  }, 180000);

  it("os CHECKs de vocabulário recusam valores fora da lista", async () => {
    await withMigratedDatabase("checks", async (pool) => {
      const userId = await createUser(pool, "checks@test.local");
      const cityId = await createCity(pool, "atibaia-checks");

      const cases = [
        ["intent_type", { intent_type: "qualquer_coisa" }],
        ["status", { status: "negotiating" }],
        ["purchase_timeframe", { purchase_timeframe: "algum_dia" }],
        ["max_price", { max_price: 0 }],
      ];

      for (const [label, overrides] of cases) {
        const { text, values } = insertIntentSql(overrides);
        await expect(
          pool.query(text, values(userId, cityId)),
          `esperava CHECK recusar ${label}`
        ).rejects.toMatchObject({ code: "23514" });
      }
    });
  }, 180000);

  it("o CHECK de FORMA impede linha meio-preenchida nos dois modos", async () => {
    // É o invariante de que a Fase 3 vai depender: 'specific_model' tem par
    // marca+modelo e não tem carroceria; 'open_category' é o inverso exato.
    await withMigratedDatabase("shape", async (pool) => {
      const userId = await createUser(pool, "shape@test.local");
      const cityId = await createCity(pool, "atibaia-shape");

      const invalid = [
        ["specific sem modelo", { model: null, model_slug: null }],
        ["specific com carroceria", { body_type: "suv" }],
        [
          "open com marca",
          {
            intent_type: "open_category",
            body_type: "suv",
            brand: "Volkswagen",
            brand_slug: "volkswagen",
            model: null,
            model_slug: null,
          },
        ],
        [
          "open sem carroceria",
          {
            intent_type: "open_category",
            body_type: null,
            brand: null,
            brand_slug: null,
            model: null,
            model_slug: null,
          },
        ],
      ];

      for (const [label, overrides] of invalid) {
        const { text, values } = insertIntentSql(overrides);
        await expect(
          pool.query(text, values(userId, cityId)),
          `esperava CHECK recusar: ${label}`
        ).rejects.toMatchObject({ code: "23514" });
      }

      // E as duas formas VÁLIDAS passam.
      const specific = insertIntentSql();
      await expect(
        pool.query(specific.text, specific.values(userId, cityId))
      ).resolves.toBeTruthy();

      const open = insertIntentSql({
        intent_type: "open_category",
        brand: null,
        brand_slug: null,
        model: null,
        model_slug: null,
        body_type: "suv",
      });
      await expect(pool.query(open.text, open.values(userId, cityId))).resolves.toBeTruthy();
    });
  }, 180000);

  it("apagar o usuário leva as procuras junto (CASCADE)", async () => {
    await withMigratedDatabase("cascade", async (pool) => {
      const userId = await createUser(pool, "cascade@test.local");
      const cityId = await createCity(pool, "atibaia-cascade");

      const { text, values } = insertIntentSql();
      await pool.query(text, values(userId, cityId));

      const before = await pool.query(`SELECT COUNT(*)::int AS n FROM purchase_intents`);
      expect(before.rows[0].n).toBe(1);

      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

      const after = await pool.query(`SELECT COUNT(*)::int AS n FROM purchase_intents`);
      expect(after.rows[0].n).toBe(0);
    });
  }, 180000);

  it("o índice parcial serve a consulta do lojista (mesma cidade, ativa, não vencida)", async () => {
    await withMigratedDatabase("query", async (pool) => {
      const buyer = await createUser(pool, "buyer-query@test.local");
      const cityA = await createCity(pool, "atibaia-query");
      const cityB = await createCity(pool, "braganca-query");

      const base = insertIntentSql();
      // Ativa em A — deve aparecer.
      await pool.query(base.text, base.values(buyer, cityA));
      // Ativa em B — outra cidade.
      await pool.query(base.text, base.values(buyer, cityB));
      // Encerrada em A.
      const closed = insertIntentSql({ status: "closed" });
      await pool.query(closed.text, closed.values(buyer, cityA));
      // Vencida em A (expires_at no passado).
      await pool.query(
        `
          INSERT INTO purchase_intents (
            buyer_user_id, city_id, intent_type, brand, brand_slug, model, model_slug,
            transmission, max_price, purchase_timeframe, status, expires_at
          )
          VALUES ($1, $2, 'specific_model', 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
                  'automatico', 95000, 'within_30_days', 'active', NOW() - INTERVAL '1 day')
          `,
        [buyer, cityA]
      );

      const { rows } = await pool.query(
        `SELECT id FROM purchase_intents
            WHERE city_id = $1 AND status = 'active' AND expires_at > NOW()
            ORDER BY created_at DESC, id DESC`,
        [cityA]
      );
      expect(rows).toHaveLength(1);
    });
  }, 180000);

  it("o predicado de advertiser operacional trata NULL e '' como ativo no Postgres real", async () => {
    // A semântica de COALESCE/NULLIF/BTRIM com NULL de verdade não pode ser
    // provada pelo fake — ele concordaria consigo mesmo. E o predicado é
    // IMPORTADO do repository, não copiado, então não há como divergir dele.
    await withMigratedDatabase("advstatus", async (pool) => {
      const cityId = await createCity(pool, "atibaia-advstatus");

      // Num banco NOVO, `advertisers.status` nasce NOT NULL (o CREATE da 003
      // vence e o `ADD COLUMN IF NOT EXISTS` posterior é no-op) — então o caso
      // NULL é impossível de inserir aqui. Ele só existe em banco LEGADO, onde
      // a tabela precedeu a coluna e o ALTER a adicionou nullable.
      //
      // Reproduzimos essa forma de propósito, como `migrations-compat` faz com
      // `seedLegacyPartialSchema`. Sem isto, o ramo do COALESCE ficaria sem
      // cobertura exatamente no banco em que ele importa.
      await pool.query(`ALTER TABLE advertisers ALTER COLUMN status DROP NOT NULL`);

      async function makeAdvertiser(label, status) {
        const user = await createUser(pool, `${label}@advstatus.test`);
        await pool.query(
          `INSERT INTO advertisers (user_id, city_id, name, slug, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [user, cityId, label, `${label}-slug`, status]
        );
        return String(user);
      }

      const ativoNulo = await makeAdvertiser("ativonulo", null);
      const ativoVazio = await makeAdvertiser("ativovazio", "   ");
      const ativoExplicito = await makeAdvertiser("ativoexplicito", ADVERTISER_STATUS.ACTIVE);
      const suspenso = await makeAdvertiser("suspenso", ADVERTISER_STATUS.SUSPENDED);
      const bloqueado = await makeAdvertiser("bloqueado", ADVERTISER_STATUS.BLOCKED);

      const { rows } = await pool.query(
        `SELECT adv.user_id
           FROM advertisers adv
          WHERE adv.city_id = $1
            AND ${ADVERTISER_IS_OPERATIONAL}`,
        [cityId, ADVERTISER_STATUS.ACTIVE]
      );
      const operacionais = rows.map((row) => String(row.user_id)).sort();

      expect(operacionais).toEqual([ativoNulo, ativoVazio, ativoExplicito].sort());
      expect(operacionais).not.toContain(suspenso);
      expect(operacionais).not.toContain(bloqueado);
    });
  }, 180000);
});
