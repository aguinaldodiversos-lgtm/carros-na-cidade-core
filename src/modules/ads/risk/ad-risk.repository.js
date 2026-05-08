/**
 * Persistência dos resultados do adRiskService:
 *   • snapshot em `ads` (risk_score, risk_level, risk_reasons, fipe_*)
 *   • detalhamento por sinal em `ad_risk_signals`
 *   • eventos de moderação em `ad_moderation_events`
 *
 * Todas as operações são idempotentes para o caso de retry — exceto inserts
 * em `ad_risk_signals` / `ad_moderation_events`, que aceitam histórico
 * completo (cada cálculo gera novas linhas).
 */

import db from "../../../infrastructure/database/db.js";

/**
 * Persiste o snapshot do score no `ads` (campos novos da migration 025).
 * Não muda `status` aqui — quem orquestra é o pipeline.
 */
export async function persistAdRiskSnapshot(adId, riskResult) {
  const reasons = Array.isArray(riskResult?.reasons) ? riskResult.reasons : [];
  await db.query(
    `
    UPDATE ads
    SET
      risk_score = $2,
      risk_level = $3,
      risk_reasons = $4::jsonb,
      fipe_reference_value = $5,
      fipe_diff_percent = $6,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      adId,
      Number(riskResult?.riskScore || 0),
      String(riskResult?.riskLevel || "low"),
      JSON.stringify(reasons),
      riskResult?.fipeReferenceValue ?? null,
      riskResult?.fipeDiffPercent ?? null,
    ]
  );
}

/**
 * Insere cada sinal individual em `ad_risk_signals`. Lote simples — uma
 * INSERT por sinal mantém implementação direta (volumes baixos por anúncio).
 */
export async function persistAdRiskSignals(adId, reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return;
  for (const r of reasons) {
    await db.query(
      `
      INSERT INTO ad_risk_signals (ad_id, signal_code, severity, score_delta, message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        adId,
        String(r.code || "UNKNOWN"),
        String(r.severity || "low"),
        Number(r.scoreDelta || 0),
        r.message ?? null,
        JSON.stringify(r.metadata ?? {}),
      ]
    );
  }
}

/**
 * Registra evento de moderação (transição/decisão).
 *
 * @param {object} evt
 * @param {string|number} evt.adId
 * @param {string} evt.eventType   — ver `MODERATION_EVENT` em ad-risk.thresholds.js
 * @param {string|null} [evt.actorUserId]
 * @param {"admin"|"system"|"owner"|null} [evt.actorRole]
 * @param {string|null} [evt.fromStatus]
 * @param {string|null} [evt.toStatus]
 * @param {string|null} [evt.reason]
 * @param {object} [evt.metadata]
 */
export async function recordModerationEvent(evt) {
  await db.query(
    `
    INSERT INTO ad_moderation_events
      (ad_id, event_type, actor_user_id, actor_role, from_status, to_status, reason, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      evt.adId,
      String(evt.eventType),
      evt.actorUserId != null ? String(evt.actorUserId) : null,
      evt.actorRole ?? "system",
      evt.fromStatus ?? null,
      evt.toStatus ?? null,
      evt.reason ?? null,
      JSON.stringify(evt.metadata ?? {}),
    ]
  );
}

/**
 * Consulta agregada para o painel admin: anúncio + score + motivos +
 * eventos recentes (limit 20). Usado por GET /api/admin/moderation/ads/:id.
 */
export async function fetchModerationDetail(adId) {
  const adResult = await db.query(
    `
    SELECT
      a.id, a.title, a.description, a.brand, a.model, a.year, a.mileage,
      a.price, a.images, a.city, a.state, a.city_id, a.advertiser_id,
      a.status, a.risk_score, a.risk_level, a.risk_reasons,
      a.reviewed_at, a.reviewed_by, a.rejection_reason, a.correction_requested_reason,
      a.fipe_reference_value, a.fipe_diff_percent,
      a.created_at, a.updated_at,
      adv.user_id AS advertiser_user_id,
      adv.name AS advertiser_name,
      adv.company_name AS advertiser_company
    FROM ads a
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [adId]
  );

  const ad = adResult.rows[0] || null;
  if (!ad) return null;

  const signals = await db.query(
    `
    SELECT id, signal_code, severity, score_delta, message, metadata, created_at
    FROM ad_risk_signals
    WHERE ad_id = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [adId]
  );

  const events = await db.query(
    `
    SELECT id, event_type, actor_user_id, actor_role, from_status, to_status,
           reason, metadata, created_at
    FROM ad_moderation_events
    WHERE ad_id = $1
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [adId]
  );

  return { ad, signals: signals.rows, events: events.rows };
}

/**
 * Lookup defensivo para o sinal `PHONE_REUSED_ACROSS_ACCOUNTS`. Conta
 * quantos `users.id` distintos compartilham o sufixo de telefone informado
 * (últimos 11 dígitos), excluindo o próprio user. Tolerante a falha — o
 * caller deve tratar erro como "skip do sinal".
 */
export async function countDistinctOwnersForPhone({ phone, userId }) {
  if (!phone) return 0;
  const tail = String(phone).replace(/\D/g, "").slice(-11);
  if (tail.length < 10) return 0;

  const result = await db.query(
    `
    SELECT COUNT(DISTINCT id)::int AS total
    FROM users
    WHERE
      ($1::text IS NULL OR id::text <> $1::text)
      AND (
        regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') LIKE $2
        OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $2
      )
    `,
    [userId != null ? String(userId) : null, `%${tail}`]
  );

  return Number(result.rows[0]?.total || 0);
}
