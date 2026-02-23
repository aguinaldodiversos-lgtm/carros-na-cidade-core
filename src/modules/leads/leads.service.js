import { pool } from "../../infrastructure/database/db.js";
import { addWhatsAppJob } from "../../queues/whatsapp.queue.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export async function createLead({ adId, buyerName, buyerPhone }) {
  const adResult = await pool.query(
    `SELECT id, user_id, city_id, title, whatsapp_number
     FROM ads
     WHERE id = $1 AND status = 'active'`,
    [adId]
  );

  if (adResult.rows.length === 0) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  const ad = adResult.rows[0];

  /* ===============================
     1️⃣ Salvar Lead
  =============================== */

  const leadResult = await pool.query(
    `
    INSERT INTO leads
    (ad_id, seller_id, city_id, buyer_name, buyer_phone)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
    `,
    [
      ad.id,
      ad.user_id,
      ad.city_id,
      buyerName,
      buyerPhone || null,
    ]
  );

  /* ===============================
     2️⃣ Atualizar Métrica Cidade
  =============================== */

  await pool.query(
    `
    UPDATE city_metrics
    SET total_leads = COALESCE(total_leads,0) + 1
    WHERE city_id = $1
    `,
    [ad.city_id]
  );

  /* ===============================
     3️⃣ Atualizar Score Vendedor
  =============================== */

  await pool.query(
    `
    INSERT INTO seller_scores (seller_id, total_leads)
    VALUES ($1, 1)
    ON CONFLICT (seller_id)
    DO UPDATE SET
      total_leads = seller_scores.total_leads + 1,
      updated_at = NOW()
    `,
    [ad.user_id]
  );

  /* ===============================
     4️⃣ Enviar WhatsApp via Queue
  =============================== */

  const message = `Olá! Tenho interesse no ${ad.title} anunciado no Carros na Cidade. Ainda está disponível?`;

  await addWhatsAppJob({
    phone: ad.whatsapp_number,
    lead: message,
  });

  return leadResult.rows[0];
}
