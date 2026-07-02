/**
 * inspect-subscription.mjs
 *
 * READ-ONLY. Mostra as assinaturas de um usuário em `user_subscriptions`
 * (e o plano efetivo em `users.plan_id`). Serve para saber, ANTES do teste
 * de cancelamento da Fase A, se a assinatura tem identificador do Mercado
 * Pago (provider_preapproval_id / payment_id) — sem o qual o cancel retorna
 * 500 — e se está dentro do período (expires_at futuro).
 *
 * Como rodar (user 127 é o default):
 *
 *   PowerShell (Windows):
 *     $env:DATABASE_URL="postgres://...cole_aqui..."; node scripts/inspect-subscription.mjs 127
 *
 *   Bash / Git Bash:
 *     DATABASE_URL="postgres://..." node scripts/inspect-subscription.mjs 127
 *
 * Dica: use a "External Database URL" do Render (host termina em .render.com).
 * NÃO altera nada — só executa SELECTs.
 */

import pg from "pg";

const { Pool } = pg;

function die(msg) {
  console.error(`\n[inspect-subscription] ${msg}\n`);
  process.exit(1);
}

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  die('Defina DATABASE_URL. Ex.: $env:DATABASE_URL="postgres://..."; node scripts/inspect-subscription.mjs 127');
}

const userId = String(process.argv[2] || "127").trim();

const isLocal = DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  statement_timeout: 15000,
  connectionTimeoutMillis: 15000,
});

const SUBS_SQL = `
  SELECT
    us.plan_id,
    us.status,
    us.source,
    us.provider_preapproval_id,
    us.payment_id,
    us.cancel_at_period_end,
    us.expires_at,
    (us.expires_at IS NOT NULL AND us.expires_at > NOW()) AS within_period,
    us.created_at,
    p.name AS plan_name
  FROM user_subscriptions us
  LEFT JOIN subscription_plans p ON p.id = us.plan_id
  WHERE us.user_id = $1
  ORDER BY us.created_at DESC;
`;

const USER_SQL = `SELECT id, name, plan_id FROM users WHERE id = $1;`;

function printRows(rows) {
  if (!rows.length) {
    console.log("  (nenhuma assinatura)");
    return;
  }
  for (const [i, r] of rows.entries()) {
    const mpRef = r.provider_preapproval_id || r.payment_id || null;
    console.log(`  #${i + 1} plano=${r.plan_name || r.plan_id} status=${r.status} source=${r.source ?? "—"}`);
    console.log(`      mpRef=${mpRef ?? "AUSENTE (cancel daria 500)"}  cancel_at_period_end=${r.cancel_at_period_end}`);
    console.log(`      expires_at=${r.expires_at ?? "—"}  dentro_do_periodo=${r.within_period}`);
    console.log(`      created_at=${r.created_at}`);
  }
}

async function main() {
  const masked = DATABASE_URL.replace(/:[^:@/]+@/, ":****@");
  console.log(`\n[inspect-subscription] Conectando a: ${masked}`);
  console.log(`[inspect-subscription] Usuário: ${userId} — SOMENTE LEITURA\n`);

  try {
    const user = await pool.query(USER_SQL, [userId]);
    if (!user.rows.length) {
      console.log(`  users.id=${userId} não encontrado.`);
    } else {
      const u = user.rows[0];
      console.log(`═══ users ═══`);
      console.log(`  id=${u.id} name=${u.name} plan_id(efetivo)=${u.plan_id ?? "—"}\n`);
    }

    const subs = await pool.query(SUBS_SQL, [userId]);
    console.log(`═══ user_subscriptions (${subs.rows.length}) ═══`);
    printRows(subs.rows);
    console.log("");
  } catch (err) {
    die(`Falha na consulta: ${err.message}`);
  } finally {
    await pool.end();
  }
}

main();
