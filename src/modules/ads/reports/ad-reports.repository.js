import db from "../../../infrastructure/database/db.js";

/**
 * Persiste uma denúncia. Caller já validou reason/description e calculou
 * `reporter_ip_hash` (sha256 do IP). Retorna a row criada.
 */
export async function insertReport({
  ad_id,
  reporter_user_id,
  reporter_ip_hash,
  reason,
  description,
}) {
  const { rows } = await db.query(
    `
    INSERT INTO ad_reports (ad_id, reporter_user_id, reporter_ip_hash, reason, description)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, ad_id, reason, status, created_at
    `,
    [ad_id, reporter_user_id || null, reporter_ip_hash || null, reason, description || null]
  );
  return rows[0];
}

/**
 * Conta quantas denúncias o mesmo IP já fez (em qualquer anúncio) na
 * janela. Usado para rate limit defensivo.
 */
export async function countRecentByIpHash(reporter_ip_hash, windowSeconds) {
  if (!reporter_ip_hash) return 0;
  const { rows } = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM ad_reports
    WHERE reporter_ip_hash = $1
      AND created_at > NOW() - ($2 || ' seconds')::interval
    `,
    [reporter_ip_hash, String(windowSeconds)]
  );
  return rows[0]?.total || 0;
}

/**
 * Conta quantas denúncias o mesmo IP fez no MESMO anúncio. Permite
 * limite mais agressivo por par IP×anúncio.
 */
export async function countRecentByIpHashAndAd(reporter_ip_hash, ad_id, windowSeconds) {
  if (!reporter_ip_hash) return 0;
  const { rows } = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM ad_reports
    WHERE reporter_ip_hash = $1
      AND ad_id = $2
      AND created_at > NOW() - ($3 || ' seconds')::interval
    `,
    [reporter_ip_hash, ad_id, String(windowSeconds)]
  );
  return rows[0]?.total || 0;
}

/**
 * Verifica se o anúncio existe e está ativo. Denúncia em anúncio
 * inexistente/removido é descartada com 404 (sem cair em 500).
 */
export async function adExistsForReport(ad_id) {
  const { rows } = await db.query(
    `SELECT id, status FROM ads WHERE id = $1 LIMIT 1`,
    [ad_id]
  );
  const row = rows[0];
  if (!row) return false;
  // Permite denúncia em pending_review/active. Bloqueamos só status
  // claramente removido (deleted) — anúncio rejected ainda pode estar
  // visível em admin e ser denunciado.
  return row.status !== "deleted";
}

/**
 * Lista denúncias de um anúncio. Uso interno (admin). Não devolve
 * reporter_ip_hash bruto — admin acessa por endpoint dedicado.
 */
export async function listByAdId(ad_id, { limit = 50 } = {}) {
  const { rows } = await db.query(
    `
    SELECT id, ad_id, reason, description, status, created_at
    FROM ad_reports
    WHERE ad_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [ad_id, limit]
  );
  return rows;
}
