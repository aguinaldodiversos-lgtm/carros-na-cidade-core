import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

async function tableExists(name) {
  const r = await pool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
    `,
    [name]
  );
  return r.rowCount > 0;
}

/**
 * Upsert quando já existe place_id ou mesmo telefone na cidade.
 */
export async function upsertDealerLeadFromGoogle(params) {
  const cityId = Number(params.cityId);
  const phone = String(params.phone).trim();
  const placeId = params.googlePlaceId || null;
  const name = params.name || null;

  const existing = await pool.query(
    `
    SELECT id FROM dealer_leads
    WHERE city_id = $1
      AND (
        ($2::text IS NOT NULL AND google_place_id = $2)
        OR phone = $3
      )
    LIMIT 1
    `,
    [cityId, placeId, phone]
  );

  if (existing.rows[0]) {
    return { id: existing.rows[0].id, inserted: false };
  }

  try {
    const ins = await pool.query(
      `
      INSERT INTO dealer_leads (
        city_id,
        lead_name,
        phone,
        lead_phone,
        google_place_id,
        source,
        lead_price_range,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $3, $4, 'google_places', 'pipeline', NOW(), NOW())
      RETURNING id
      `,
      [cityId, name, phone, placeId]
    );

    return { id: ins.rows[0].id, inserted: true };
  } catch (err) {
    if (err?.code === "23505") {
      const again = await pool.query(
        `
        SELECT id FROM dealer_leads
        WHERE city_id = $1
          AND (
            ($2::text IS NOT NULL AND google_place_id = $2)
            OR phone = $3
          )
        LIMIT 1
        `,
        [cityId, placeId, phone]
      );
      if (again.rows[0]) {
        return { id: again.rows[0].id, inserted: false };
      }
    }
    throw err;
  }
}

export async function insertInteraction(row) {
  const rawPayload =
    row.raw === undefined || row.raw === null
      ? null
      : JSON.stringify(row.raw);

  await pool.query(
    `
    INSERT INTO dealer_lead_interactions (
      dealer_lead_id,
      channel,
      direction,
      status,
      body,
      provider_message_id,
      raw,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
    `,
    [
      row.dealerLeadId,
      row.channel || "whatsapp",
      row.direction || "outbound",
      row.status || "queued",
      row.body || null,
      row.providerMessageId || null,
      rawPayload,
    ]
  );
}

export async function markOutboundSent(dealerLeadId, { providerMessageId, body }) {
  const updated = await pool.query(
    `
    UPDATE dealer_leads
    SET
      contacted = TRUE,
      whatsapp_sent_at = COALESCE(whatsapp_sent_at, NOW()),
      last_outreach_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
      AND whatsapp_sent_at IS NULL
    RETURNING id
    `,
    [dealerLeadId]
  );

  if (updated.rowCount === 0) {
    return false;
  }

  await insertInteraction({
    dealerLeadId,
    direction: "outbound",
    status: "sent",
    body,
    providerMessageId,
    channel: "whatsapp",
  });

  return true;
}

export async function shouldSkipOutreach(leadId) {
  const r = await pool.query(
    `
    SELECT whatsapp_sent_at, contacted
    FROM dealer_leads
    WHERE id = $1
    LIMIT 1
    `,
    [leadId]
  );

  const row = r.rows[0];
  if (!row) return true;
  return Boolean(row.whatsapp_sent_at || row.contacted);
}

export async function recordInboundByPhone(phoneDigits, body) {
  const r = await pool.query(
    `
    SELECT id FROM dealer_leads
    WHERE phone = $1
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [phoneDigits]
  );

  const leadId = r.rows[0]?.id;
  if (!leadId) {
    logger.warn({ phoneDigits }, "[dealer-leads] inbound sem lead correspondente");
    return null;
  }

  await insertInteraction({
    dealerLeadId: leadId,
    direction: "inbound",
    status: "received",
    body,
    channel: "whatsapp",
  });

  await pool.query(
    `UPDATE dealer_leads SET updated_at = NOW() WHERE id = $1`,
    [leadId]
  );

  return leadId;
}

export async function bumpCityDealerMetrics(cityId, { pipeline = 0, outreach = 0 }) {
  if (!(await tableExists("city_metrics"))) {
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO city_metrics (
        city_id,
        dealer_pipeline_leads,
        dealer_outreach_sent,
        updated_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        dealer_pipeline_leads = COALESCE(city_metrics.dealer_pipeline_leads, 0) + EXCLUDED.dealer_pipeline_leads,
        dealer_outreach_sent = COALESCE(city_metrics.dealer_outreach_sent, 0) + EXCLUDED.dealer_outreach_sent,
        updated_at = NOW()
      `,
      [cityId, pipeline, outreach]
    );
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), cityId },
      "[dealer-leads] city_metrics não atualizado (colunas ausentes ou linha inexistente)"
    );
  }
}
