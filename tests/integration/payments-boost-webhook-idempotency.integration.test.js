import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * Homologação pré-lançamento — GRUPO G (PAY-03, PAY-04, PAY-05, PAY-06,
 * PAY-08, PAY-09, PAY-11) contra BANCO REAL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * `tests/payments/boost-7d-flow.test.js` cobre bem o checkout e o SQL do
 * `applyBoostApproval` — e diz, no cabeçalho, exatamente o que NÃO cobre:
 *
 *     "Idempotência completa do webhook (FOR UPDATE + payment_resource_id
 *      UNIQUE + check status) requer DB real e é coberta pelo runbook em
 *      staging."
 *
 * Runbook em staging não é teste automatizado. E a lacuna é cara: o SQL do
 * boost SOMA prazo (`highlight_until + N days`) em vez de trocar. Se a guarda
 * de duplicidade falhar, o Mercado Pago reenviando a MESMA notificação — algo
 * que ele faz por projeto — entrega 14 dias de destaque por 7 pagos, e ninguém
 * percebe até um lojista reclamar. A guarda REAL é a combinação
 * `SELECT … FOR UPDATE` + `!alreadyApproved` dentro de
 * `handleWebhookNotification`; com uma conexão fingida não há lock nenhum, e um
 * código sem transação passaria no mock.
 *
 * O Mercado Pago não é chamado: `MP_ACCESS_TOKEN` é definido para forçar o
 * caminho de produção do `fetchPaymentStatus` e o `fetch` global é substituído
 * por um duplo que devolve o status que cada cenário precisa. Nenhuma cobrança,
 * nenhuma credencial real, nenhum tráfego de rede.
 *
 * Rodar (Docker de pé):
 *   npm run integration:db:up
 *   npx vitest run tests/integration/payments-boost-webhook-idempotency.integration.test.js
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
const dbName = `boostidem_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

function makeDatabaseUrl(name) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
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
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

// ORDEM CRÍTICA: tanto o pool de `db.js` quanto MP_ACCESS_TOKEN em
// `payments.service.js` são resolvidos no LOAD do módulo. Definir depois do
// import não teria efeito — e o serviço cairia no atalho "sem token = sempre
// approved", que apagaria justamente os cenários pending/rejected.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";
process.env.DISABLE_REDIS = "true";
process.env.MP_ACCESS_TOKEN = "TEST-token-de-integracao-sem-valor-real";
// MP_WEBHOOK_SECRET fica AUSENTE de propósito: a verificação de assinatura já
// tem cobertura dedicada em tests/payments/webhook-signature.test.js, e exigi-la
// aqui só acrescentaria ruído de HMAC ao cenário de idempotência.
delete process.env.MP_WEBHOOK_SECRET;

const payments = await import("../../src/modules/payments/payments.service.js");
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- duplo do Mercado Pago --------------------------------------------------

const realFetch = globalThis.fetch;
let mpStatus = "approved";

globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("/v1/payments/")) {
    const id = href.split("/v1/payments/")[1];
    return new Response(
      JSON.stringify({
        id,
        status: mpStatus,
        transaction_amount: 39.9,
        metadata: {},
        external_reference: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(url, init);
};

// --- fixtures ---------------------------------------------------------------

let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}_${runTag}_${seq}`;
}

async function seedAdAtivo() {
  const city = await pool.query(
    `INSERT INTO cities (name, slug, state) VALUES ('Atibaia', 'atibaia-sp', 'SP')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`
  );
  const cityId = city.rows[0].id;

  const suffix = Math.random().toString(36).slice(2, 10);
  const user = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, plan)
     VALUES ('Dono Boost', $1, 'x', 'user', 'free') RETURNING id`,
    [`boost_${suffix}@example.com`]
  );
  const userId = user.rows[0].id;

  const adv = await pool.query(
    `INSERT INTO advertisers (user_id, city_id, name, slug, email)
     VALUES ($1, $2, 'Loja Boost', $3, $4) RETURNING id`,
    [userId, cityId, `loja-boost-${suffix}`, `loja_${suffix}@example.com`]
  );

  const ad = await pool.query(
    `INSERT INTO ads (advertiser_id, title, description, price, city_id, city, state,
                      brand, model, year, mileage, status, slug, images)
     VALUES ($1, 'Honda Civic 2020 EXL', 'Carro em bom estado', 89900, $2, 'Atibaia', 'SP',
             'Honda', 'Civic 2.0 EXL', 2020, 45000, 'active', $3, '[]'::jsonb)
     RETURNING id, highlight_until, priority`,
    [adv.rows[0].id, cityId, `civic-boost-${suffix}`]
  );

  return { adId: String(ad.rows[0].id), userId: String(userId) };
}

/** Cria o payment_intent de boost como o checkout real cria. */
async function seedIntentBoost({ adId, userId, status = "pending", boostDays = 7 }) {
  const intentId = nextId("intent");
  const resourceId = nextId("mp");
  await pool.query(
    `INSERT INTO payment_intents
       (id, user_id, context, ad_id, boost_option_id, amount, checkout_resource_id,
        checkout_resource_type, status, metadata)
     VALUES ($1, $2, 'boost', $3, 'boost-7d', 39.90, $4, 'preference', $5, $6::jsonb)`,
    [
      intentId,
      userId,
      adId,
      resourceId,
      status,
      JSON.stringify({ boost_days: String(boostDays), intent_id: intentId }),
    ]
  );
  return { intentId, resourceId };
}

async function readAd(adId) {
  const { rows } = await pool.query(
    `SELECT id, status, priority, highlight_until FROM ads WHERE id = $1`,
    [adId]
  );
  return rows[0] || null;
}

async function readIntent(intentId) {
  const { rows } = await pool.query(`SELECT * FROM payment_intents WHERE id = $1`, [intentId]);
  return rows[0] || null;
}

/** Dispara o webhook como o controller dispara (assinatura já dispensada). */
function webhook(resourceId) {
  return payments.handleWebhookNotification({
    rawBody: JSON.stringify({ type: "payment", data: { id: resourceId } }),
    signature: null,
    requestId: `req_${resourceId}`,
    dataId: resourceId,
    traceRequestId: `trace_${resourceId}`,
  });
}

/** Dias de destaque a partir de agora, arredondados. */
function diasDeDestaque(highlightUntil) {
  if (!highlightUntil) return 0;
  const ms = new Date(highlightUntil).getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

afterAll(async () => {
  globalThis.fetch = realFetch;
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
  await adminPool.end().catch(() => {});
});

beforeEach(() => {
  mpStatus = "approved";
});

// ---------------------------------------------------------------------------

describe("PAY-03 / PAY-09 — pagamento aprovado ativa o benefício UMA vez", () => {
  it("o destaque passa a valer por 7 dias e o intent vira approved", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { intentId, resourceId } = await seedIntentBoost({ adId, userId });

    const res = await webhook(resourceId);

    expect(res).toMatchObject({ ok: true, context: "ad_boost", status: "approved" });

    const ad = await readAd(adId);
    expect(diasDeDestaque(ad.highlight_until)).toBe(7);
    expect((await readIntent(intentId)).status).toBe("approved");
  });

  it("o boost NÃO altera `priority` — a camada comercial vem de highlight_until", async () => {
    const { adId, userId } = await seedAdAtivo();
    const antes = await readAd(adId);
    const { resourceId } = await seedIntentBoost({ adId, userId });

    await webhook(resourceId);

    expect((await readAd(adId)).priority).toBe(antes.priority);
  });
});

describe("PAY-06 / PAY-11 — webhook duplicado é idempotente", () => {
  it("a MESMA notificação duas vezes dá 7 dias, não 14", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    await webhook(resourceId);
    const depoisDaPrimeira = (await readAd(adId)).highlight_until;

    await webhook(resourceId);
    const depoisDaSegunda = (await readAd(adId)).highlight_until;

    expect(diasDeDestaque(depoisDaSegunda)).toBe(7);
    expect(new Date(depoisDaSegunda).getTime()).toBe(new Date(depoisDaPrimeira).getTime());
  });

  it("cinco reenvios seguidos continuam valendo 7 dias", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    for (let i = 0; i < 5; i += 1) await webhook(resourceId);

    expect(diasDeDestaque((await readAd(adId)).highlight_until)).toBe(7);
  });

  it("dois reenvios SIMULTÂNEOS: o lock serializa e só um aplica", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    // Sem o FOR UPDATE, as duas transações leriam status 'pending' e ambas
    // somariam 7 dias — o caso que um mock de uma conexão só nunca produz.
    await Promise.all([webhook(resourceId), webhook(resourceId)]);

    expect(diasDeDestaque((await readAd(adId)).highlight_until)).toBe(7);
  });

  it("o cenário É discriminante: somar duas vezes daria 14 dias", async () => {
    // Teste por mutação. Se este bloco não distinguisse duplo de simples, os
    // três testes acima estariam dando confiança falsa.
    const { adId, userId } = await seedAdAtivo();
    const { intentId, resourceId } = await seedIntentBoost({ adId, userId });

    await webhook(resourceId);
    // Devolve o intent a 'pending' — é exatamente o estado que a guarda
    // `!alreadyApproved` observa. Sem ela, o reenvio somaria de novo.
    await pool.query(`UPDATE payment_intents SET status = 'pending' WHERE id = $1`, [intentId]);
    await webhook(resourceId);

    expect(diasDeDestaque((await readAd(adId)).highlight_until)).toBe(14);
  });
});

describe("PAY-04 / PAY-05 — pending, rejected e cancelled não ativam benefício", () => {
  it("pending: intent registra pending e o anúncio segue sem destaque", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { intentId, resourceId } = await seedIntentBoost({ adId, userId });
    mpStatus = "pending";

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
    expect((await readIntent(intentId)).status).toBe("pending");
  });

  it("rejected: sem destaque, intent rejeitado", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { intentId, resourceId } = await seedIntentBoost({ adId, userId });
    mpStatus = "rejected";

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
    expect((await readIntent(intentId)).status).toBe("rejected");
  });

  it("cancelled: sem destaque", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });
    mpStatus = "cancelled";

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
  });
});

describe("PAY-08 — eventos fora de ordem", () => {
  it("approved e DEPOIS pending: o destaque já concedido não é retirado", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    await webhook(resourceId);
    const concedido = (await readAd(adId)).highlight_until;

    mpStatus = "pending";
    await webhook(resourceId);

    // O benefício comercial permanece — o dono pagou e o MP confirmou.
    expect(new Date((await readAd(adId)).highlight_until).getTime()).toBe(
      new Date(concedido).getTime()
    );
  });

  it("pending e DEPOIS approved: o destaque é concedido uma única vez", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    mpStatus = "pending";
    await webhook(resourceId);
    expect((await readAd(adId)).highlight_until).toBeNull();

    mpStatus = "approved";
    await webhook(resourceId);

    expect(diasDeDestaque((await readAd(adId)).highlight_until)).toBe(7);
  });
});

describe("PAY-10 — falha do Mercado Pago não deixa benefício fantasma", () => {
  it("pagamento inexistente (404) é ACK sem tocar o anúncio", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    const anterior = globalThis.fetch;
    globalThis.fetch = async () => new Response("not found", { status: 404 });
    try {
      const res = await webhook(resourceId);
      expect(res).toMatchObject({ ok: true, ignored: true });
    } finally {
      globalThis.fetch = anterior;
    }

    expect((await readAd(adId)).highlight_until).toBeNull();
  });

  it("erro real do MP (500) propaga e NÃO concede destaque", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });

    const anterior = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 500 });
    try {
      await expect(webhook(resourceId)).rejects.toBeTruthy();
    } finally {
      globalThis.fetch = anterior;
    }

    expect((await readAd(adId)).highlight_until).toBeNull();
  });
});

describe("PAY-02 (webhook) — o benefício só cai em anúncio elegível", () => {
  it("anúncio soft-deleted não recebe destaque mesmo com pagamento aprovado", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });
    await pool.query(`UPDATE ads SET status = 'deleted' WHERE id = $1`, [adId]);

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
  });

  it("anúncio pausado (não-active) também não recebe destaque", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });
    await pool.query(`UPDATE ads SET status = 'paused' WHERE id = $1`, [adId]);

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
  });

  it("o intent perde o vínculo com o dono → sem destaque (revalidação de ownership)", async () => {
    const { adId, userId } = await seedAdAtivo();
    const { resourceId } = await seedIntentBoost({ adId, userId });
    // Outro usuário passa a ser o dono do anunciante entre o checkout e o webhook.
    const outro = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, plan)
       VALUES ('Outro', $1, 'x', 'user', 'free') RETURNING id`,
      [`outro_${Math.random().toString(36).slice(2, 10)}@example.com`]
    );
    await pool.query(
      `UPDATE advertisers SET user_id = $1 WHERE id = (SELECT advertiser_id FROM ads WHERE id = $2)`,
      [outro.rows[0].id, adId]
    );

    await webhook(resourceId);

    expect((await readAd(adId)).highlight_until).toBeNull();
  });
});
