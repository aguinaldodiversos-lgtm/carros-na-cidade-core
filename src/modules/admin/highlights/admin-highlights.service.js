import * as repo from "./admin-highlights.repository.js";

/**
 * Listagem de destaques para a aba "Destaques" do /admin/comercial.
 *
 * Operações de MUTATION (aplicar/estender/remover) já existem no módulo
 * admin-ads (PATCH /api/admin/ads/:id/highlight, com grantManualBoost
 * para days+ e setAdHighlight para clear). NÃO duplicar lógica aqui —
 * o frontend desta aba apenas REUSA aqueles endpoints quando o admin
 * clica em ação, mantendo o audit trail consistente com `target_type='ad'`.
 */

const ALLOWED_MODES = new Set(["active", "expiring", "expired"]);

export async function listHighlights({
  mode,
  city,
  advertiser_id,
  ad_id,
  expiring_days,
  limit,
  offset,
}) {
  const safeMode = ALLOWED_MODES.has(String(mode)) ? mode : "active";
  return repo.list({
    mode: safeMode,
    city: typeof city === "string" && city.trim() ? city.trim() : undefined,
    advertiser_id: advertiser_id ? Number(advertiser_id) : undefined,
    ad_id: ad_id ? Number(ad_id) : undefined,
    expiring_days: Number(expiring_days) || 3,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0,
  });
}

export async function getHighlightsSummary({ expiring_days } = {}) {
  return repo.summary({ expiring_days: Number(expiring_days) || 3 });
}
