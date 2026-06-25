#!/usr/bin/env node
/**
 * Sweep GLOBAL de expiração de planos concedidos manualmente (admin_grant).
 *
 * Contexto: não há cron de expiração no projeto. O plano efetivo é
 * `users.plan_id` (lido por account.service.resolveCurrentPlan), que NÃO checa
 * expiry sozinho. O detalhe do anunciante já faz o sweep lazy por usuário ao
 * ser aberto; este script faz o mesmo de forma GLOBAL para normalizar quem
 * ninguém abriu — ideal para rodar diariamente via cron/scheduler.
 *
 * O que faz (idempotente, seguro para reexecução):
 *   - marca como 'expired' as concessões manuais ativas com expires_at <= NOW();
 *   - para cada usuário cujo users.plan_id ainda aponta para a concessão
 *     vencida, reverte para a assinatura paga vigente (se houver) ou para o
 *     plano gratuito do tipo de documento.
 *
 * Uso (raiz do backend):
 *   node scripts/expire-admin-grants.mjs
 *
 * Reutiliza o mesmo pool/SSL do app — herda a config do ambiente.
 */
import "dotenv/config";
import { closeDatabasePool } from "../src/infrastructure/database/db.js";
import { expireDueGrants } from "../src/modules/admin/advertisers/admin-advertisers.repository.js";

async function main() {
  const expired = await expireDueGrants({ userId: null });

  if (!expired.length) {
    console.log("[expire-admin-grants] Nenhuma concessão vencida. Nada a fazer.");
    return;
  }

  const byUser = new Map();
  for (const row of expired) {
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + 1);
  }

  console.log(
    `[expire-admin-grants] Expiradas ${expired.length} concessão(ões) de ${byUser.size} usuário(s):`
  );
  for (const [userId, count] of byUser.entries()) {
    console.log(`  user ${userId}: ${count} concessão(ões) → plano efetivo revertido`);
  }
}

try {
  await main();
} catch (err) {
  console.error("[expire-admin-grants] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
