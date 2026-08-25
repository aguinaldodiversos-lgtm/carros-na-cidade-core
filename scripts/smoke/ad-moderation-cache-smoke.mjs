/**
 * Smoke da invalidação de cache da moderação administrativa (Fase 4.10A).
 *
 * PROVA INVALIDAÇÃO, NÃO EXPIRAÇÃO
 * --------------------------------
 * Cada leitura pública acontece IMEDIATAMENTE depois da resposta
 * administrativa. Não há `sleep` esperando TTL em lugar nenhum: se a
 * invalidação não disparar, o anúncio ainda estará no catálogo e o smoke
 * falha.
 *
 * POR QUE UM SCRIPT, E NÃO O PLAYWRIGHT
 * -------------------------------------
 * Esta prova precisa rodar contra `next build` + `next start`, porque o Data
 * Cache do Next se comporta diferente em `next dev`. Só que sob
 * NODE_ENV=production o cookie de sessão é `Secure` e não persiste em HTTP
 * puro — o que impede o Playwright de autenticar como admin nesse ambiente.
 * Este script contorna isso chamando o service diretamente (o mesmo que a rota
 * admin chama) e lendo o catálogo por HTTP, sem depender de cookie.
 *
 * COMO RODAR
 *   1. Postgres de teste no ar, migrations aplicadas
 *   2. backend:  RUN_WORKERS=false DISABLE_REDIS=true PORT=4000 \
 *                FRONTEND_URL=http://127.0.0.1:3000 \
 *                REVALIDATE_TOKEN=<token> node src/index.js
 *   3. frontend: cd frontend && npx next build && \
 *                REVALIDATE_TOKEN=<token> PORT=3000 npx next start
 *   4. node scripts/smoke/ad-moderation-cache-smoke.mjs
 *
 * Variáveis: AD_ID, AD_SLUG, CATALOG_URL, FRONTEND_URL, REVALIDATE_TOKEN.
 */

const AD_ID = Number(process.env.SMOKE_AD_ID || 1);
const AD_SLUG = process.env.SMOKE_AD_SLUG || "honda-hr-v-ex-2020-atibaia-sp-e2e-1";
const FRONTEND = (process.env.FRONTEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const CATALOG_PATH = process.env.SMOKE_CATALOG_PATH || "/carros-em/atibaia-sp";

// UA de navegador: o backend tem bot-blocker por User-Agent (curl é recusado).
const UA = { "User-Agent": "Mozilla/5.0 (smoke) ad-moderation-cache" };

const { blockAd, unblockAd } = await import(
  "../../src/modules/admin/ads/admin-ad-block.service.js"
);
const { query, closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FALHA"} ${label} (esperado=${expected}, obtido=${actual})`);
}

async function catalogHasAd() {
  const res = await fetch(`${FRONTEND}${CATALOG_PATH}`, { headers: UA, cache: "no-store" });
  return (await res.text()).includes(`/veiculo/${AD_SLUG}`);
}

async function detailStatus() {
  const res = await fetch(`${FRONTEND}/veiculo/${AD_SLUG}`, { headers: UA, redirect: "manual" });
  return res.status;
}

/** Restaura o anúncio a um status conhecido, limpando o estado administrativo. */
async function resetTo(status) {
  await query(
    `UPDATE ads SET status = $2,
            blocked_reason_code = NULL, blocked_previous_status = NULL,
            blocked_at = NULL, blocked_reason = NULL, blocked_by_user_id = NULL
      WHERE id = $1`,
    [AD_ID, status]
  );
}

try {
  console.log(`alvo: ${FRONTEND}${CATALOG_PATH} — anúncio ${AD_ID} (${AD_SLUG})\n`);

  // --- A. BLOCK: some na primeira leitura ---------------------------------
  await resetTo("active");
  let warm = false;
  for (let i = 0; i < 20 && !warm; i += 1) {
    warm = await catalogHasAd();
    if (!warm) await new Promise((r) => setTimeout(r, 3000));
  }
  check("A. cache aquecido com o anúncio", warm, true);

  const tBlock = Date.now();
  const blocked = await blockAd("smoke-admin", AD_ID, { reasonCode: "suspected_fraud" });
  check("A. bloqueio aplicado", blocked.changed, true);
  check("A. revalidação aceita pelo Next", blocked.revalidated?.ok, true);

  const presentAfterBlock = await catalogHasAd();
  console.log(`     block → leitura: ${Date.now() - tBlock}ms`);
  check("A. anúncio fora do catálogo na PRIMEIRA leitura", presentAfterBlock, false);
  check("A. detalhe responde 404", await detailStatus(), 404);

  // --- B. UNBLOCK previous=active: volta na primeira leitura --------------
  const tUnblock = Date.now();
  const unblocked = await unblockAd("smoke-admin", AD_ID, {});
  check("B. restaurado para active", unblocked.ad.status, "active");
  const backAfterUnblock = await catalogHasAd();
  console.log(`     unblock → leitura: ${Date.now() - tUnblock}ms`);
  check("B. anúncio de volta na PRIMEIRA leitura", backAfterUnblock, true);

  // --- C. UNBLOCK previous=paused: revalidar não é publicar ---------------
  await resetTo("paused");
  await blockAd("smoke-admin", AD_ID, { reasonCode: "invalid_photos" });
  const restoredPaused = await unblockAd("smoke-admin", AD_ID, {});
  check("C. restaurado para paused", restoredPaused.ad.status, "paused");
  check("C. continua fora do catálogo", await catalogHasAd(), false);

  // --- limpeza ------------------------------------------------------------
  await resetTo("active");
  await query(`DELETE FROM ad_moderation_events WHERE ad_id = $1`, [AD_ID]);
  await query(`DELETE FROM admin_actions WHERE target_type = 'ad' AND target_id = $1`, [
    String(AD_ID),
  ]);

  console.log(`\n${failures === 0 ? "SMOKE VERDE" : `SMOKE VERMELHO — ${failures} falha(s)`}`);
} finally {
  await closeDatabasePool().catch(() => {});
}

process.exit(failures === 0 ? 0 : 1);
