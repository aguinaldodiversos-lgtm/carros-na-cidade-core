/**
 * reset-test-subscription.mjs
 *
 * Restaura a assinatura de teste para "active" APÓS um teste de cancelamento
 * (Opção A da Fase A): re-ativa a linha local e garante o plano efetivo em
 * users.plan_id. NÃO fala com o Mercado Pago — o preapproval no MP, se foi
 * cancelado de verdade, permanece cancelado (o MP não permite "descancelar";
 * para E2E repetível gere uma nova assinatura pelo checkout sandbox).
 *
 * ⚠️ ESCRITA. Exige confirmação explícita com --yes para evitar rodar por engano.
 *
 * Como rodar (defaults: user 127, plano cnpj-store-start):
 *
 *   PowerShell (Windows):
 *     $env:DATABASE_URL="postgres://..."; node scripts/reset-test-subscription.mjs --yes
 *     $env:DATABASE_URL="postgres://..."; node scripts/reset-test-subscription.mjs 127 cnpj-store-start --yes
 *
 *   Bash / Git Bash:
 *     DATABASE_URL="postgres://..." node scripts/reset-test-subscription.mjs --yes
 *
 * Sem --yes, apenas mostra o que FARIA (dry-run) e sai.
 */

import pg from "pg";

const { Pool } = pg;

function die(msg) {
  console.error(`\n[reset-test-subscription] ${msg}\n`);
  process.exit(1);
}

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  die('Defina DATABASE_URL. Ex.: $env:DATABASE_URL="postgres://..."; node scripts/reset-test-subscription.mjs --yes');
}

const args = process.argv.slice(2);
const confirm = args.includes("--yes");
const positional = args.filter((a) => !a.startsWith("--"));
const userId = String(positional[0] || "127").trim();
const planId = String(positional[1] || "cnpj-store-start").trim();

const isLocal = DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  statement_timeout: 15000,
  connectionTimeoutMillis: 15000,
});

const SUB_UPDATE = `
  UPDATE user_subscriptions
  SET status = 'active', cancel_at_period_end = false, updated_at = NOW()
  WHERE user_id = $1 AND plan_id = $2
  RETURNING plan_id, status, cancel_at_period_end, expires_at;
`;

const USER_UPDATE = `
  UPDATE users SET plan_id = $2 WHERE id = $1
  RETURNING id, plan_id;
`;

async function main() {
  const masked = DATABASE_URL.replace(/:[^:@/]+@/, ":****@");
  console.log(`\n[reset-test-subscription] Conectando a: ${masked}`);
  console.log(`[reset-test-subscription] user=${userId} plano=${planId}`);

  if (!confirm) {
    console.log("\n  DRY-RUN (sem --yes). FARIA:");
    console.log(`    UPDATE user_subscriptions SET status='active', cancel_at_period_end=false`);
    console.log(`      WHERE user_id=${userId} AND plan_id=${planId}`);
    console.log(`    UPDATE users SET plan_id=${planId} WHERE id=${userId}`);
    console.log("\n  Adicione --yes para executar de verdade.\n");
    await pool.end();
    return;
  }

  try {
    const sub = await pool.query(SUB_UPDATE, [userId, planId]);
    console.log(`\n  user_subscriptions: ${sub.rowCount} linha(s) reativada(s).`);
    for (const r of sub.rows) {
      console.log(`    plano=${r.plan_id} status=${r.status} cancel_at_period_end=${r.cancel_at_period_end} expires_at=${r.expires_at ?? "—"}`);
    }
    if (sub.rowCount === 0) {
      console.log("    (nenhuma linha — não havia assinatura desse plano para esse usuário)");
    }

    const usr = await pool.query(USER_UPDATE, [userId, planId]);
    if (usr.rows.length) {
      console.log(`  users: id=${usr.rows[0].id} plan_id=${usr.rows[0].plan_id}`);
    } else {
      console.log(`  users: id=${userId} não encontrado (plan_id não atualizado).`);
    }
    console.log("\n  Pronto. Reveja com scripts/inspect-subscription.mjs.\n");
  } catch (err) {
    die(`Falha ao resetar: ${err.message}`);
  } finally {
    await pool.end();
  }
}

main();
