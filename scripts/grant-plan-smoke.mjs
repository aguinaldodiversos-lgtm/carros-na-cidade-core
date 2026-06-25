#!/usr/bin/env node
/**
 * Smoke da CONCESSÃO MANUAL de plano (cortesia/teste) — Fase admin plan-grant.
 *
 * Executa um teste REAL de ponta a ponta contra o banco apontado por
 * DATABASE_URL: concede 1 mês (default) de um plano a um anunciante e valida
 * os invariantes da feature:
 *   - o detalhe do anunciante carrega (prova o fix do JOIN integer=text);
 *   - cria 1 user_subscription source='admin_grant' status='active';
 *   - sincroniza users.plan_id;
 *   - NÃO cria nenhum registro em payments;
 *   - registra admin_actions.action='grant_advertiser_plan'.
 *
 * É uma escrita real (concede de verdade). Reversível pelo botão "Revogar
 * plano" no painel ou regravando outra concessão.
 *
 * Uso (raiz do backend):
 *   node scripts/grant-plan-smoke.mjs [advertiserId] [planId] [months]
 *
 * Sem argumentos: escolhe o anunciante mais recente com usuário vinculado e
 * o primeiro plano ativo compatível com o documento dele; concede 1 mês.
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import { getAdvertiserById } from "../src/modules/admin/advertisers/admin-advertisers.service.js";
import { grantAdvertiserPlan } from "../src/modules/admin/advertisers/advertiser-plan-grant.service.js";

const [, , argAdvertiserId, argPlanId, argMonths] = process.argv;
const months = Number(argMonths) || 1;

function line() {
  console.log("".padEnd(70, "─"));
}

async function pickAdvertiser() {
  if (argAdvertiserId) {
    const r = await pool.query(
      `SELECT adv.id, adv.name, adv.user_id, u.document_type
       FROM advertisers adv JOIN users u ON u.id = adv.user_id
       WHERE adv.id = $1 LIMIT 1`,
      [argAdvertiserId]
    );
    if (!r.rows[0]) throw new Error(`Anunciante #${argAdvertiserId} não encontrado (ou sem usuário).`);
    return r.rows[0];
  }
  const r = await pool.query(
    `SELECT adv.id, adv.name, adv.user_id, u.document_type
     FROM advertisers adv JOIN users u ON u.id = adv.user_id
     WHERE adv.user_id IS NOT NULL
     ORDER BY adv.created_at DESC NULLS LAST
     LIMIT 1`
  );
  if (!r.rows[0]) throw new Error("Nenhum anunciante com usuário vinculado encontrado.");
  return r.rows[0];
}

async function pickPlan(documentType) {
  if (argPlanId) return argPlanId;
  const type = String(documentType || "").toUpperCase() === "CNPJ" ? "CNPJ" : "CPF";
  const r = await pool.query(
    `SELECT id FROM subscription_plans
     WHERE is_active = true AND type = $1
     ORDER BY (billing_model <> 'free') DESC, sort_order ASC
     LIMIT 1`,
    [type]
  );
  if (!r.rows[0]) throw new Error(`Nenhum plano ativo do tipo ${type}.`);
  return r.rows[0].id;
}

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/:[^:@/]+@/, ":****@");
  console.log(`[grant-smoke] DATABASE_URL = ${host || "(não definido)"}`);
  line();

  const admin = await pool.query(
    `SELECT id, name FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
  );
  if (!admin.rows[0]) throw new Error("Nenhum usuário admin no banco para constar como concedente.");
  const adminId = String(admin.rows[0].id);

  const advertiser = await pickAdvertiser();
  const planId = await pickPlan(advertiser.document_type);
  console.log(`Admin concedente : #${adminId} ${admin.rows[0].name || ""}`);
  console.log(`Anunciante       : #${advertiser.id} ${advertiser.name} (doc=${advertiser.document_type})`);
  console.log(`Plano            : ${planId}`);
  console.log(`Duração          : ${months} mês(es)`);
  line();

  // BEFORE — prova que o detalhe carrega (fix do JOIN) e captura baseline.
  const before = await getAdvertiserById(String(advertiser.id));
  console.log(`[ANTES] plano efetivo: ${before.effective_plan_name || before.plan} (origem: ${before.plan_origin_label})`);

  const paymentsBefore = await pool.query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE user_id = $1`,
    [String(advertiser.user_id)]
  );

  // GRANT
  const grant = await grantAdvertiserPlan(adminId, String(advertiser.id), {
    planId,
    durationMonths: months,
    reasonType: "trial",
    reasonNote: `Smoke de concessão — ${months} mês(es) grátis (validação automatizada).`,
  });
  line();
  console.log(`[GRANT] ${grant.plan_name} concedido até ${grant.expires_at} (${grant.days_remaining} dias).`);

  // AFTER — bloco de concessão visível no detalhe.
  const after = await getAdvertiserById(String(advertiser.id));
  console.log(
    `[DEPOIS] plano efetivo: ${after.effective_plan_name} | origem: ${after.plan_origin_label} | expira: ${after.plan_grant?.expires_at} | dias: ${after.plan_grant?.days_remaining} | por: ${after.plan_grant?.granted_by_name || after.plan_grant?.granted_by_admin_id}`
  );
  line();

  // Invariantes
  const sub = await pool.query(
    `SELECT plan_id, status, source, expires_at, granted_by_admin_id
     FROM user_subscriptions
     WHERE user_id = $1 AND source = 'admin_grant' AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [String(advertiser.user_id)]
  );
  const usr = await pool.query(`SELECT plan_id FROM users WHERE id = $1`, [advertiser.user_id]);
  const paymentsAfter = await pool.query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE user_id = $1`,
    [String(advertiser.user_id)]
  );
  const audit = await pool.query(
    `SELECT COUNT(*)::int AS n FROM admin_actions
     WHERE action = 'grant_advertiser_plan' AND target_id = $1`,
    [String(advertiser.id)]
  );

  const checks = [
    ["user_subscription ativa (admin_grant)", sub.rows[0]?.status === "active" && sub.rows[0]?.source === "admin_grant"],
    ["users.plan_id sincronizado", usr.rows[0]?.plan_id === planId],
    ["expires_at definido (não-nulo)", Boolean(sub.rows[0]?.expires_at)],
    ["NENHUM payment novo criado", paymentsAfter.rows[0].n === paymentsBefore.rows[0].n],
    ["admin_actions registrou a concessão", audit.rows[0].n > 0],
  ];

  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) allOk = false;
  }
  line();
  console.log(allOk ? "RESULTADO: PASS ✅" : "RESULTADO: FALHA ❌");
  if (!allOk) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  console.error("[grant-smoke] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
