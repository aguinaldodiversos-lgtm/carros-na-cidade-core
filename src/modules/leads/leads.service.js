import { pool } from "../../infrastructure/database/db.js";
import { addWhatsAppJob } from "../../queues/whatsapp.queue.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits || null;
}

function validateCreateLeadInput({ adId, buyerName, buyerPhone }) {
  if (!adId || Number.isNaN(Number(adId))) {
    throw new AppError("ID do anúncio inválido", 400);
  }

  if (!buyerName || String(buyerName).trim().length < 2) {
    throw new AppError("Nome do comprador é obrigatório", 400);
  }

  const normalizedPhone = normalizePhone(buyerPhone);

  return {
    adId: Number(adId),
    buyerName: String(buyerName).trim(),
    buyerPhone: normalizedPhone,
  };
}

async function enqueueLeadNotification({ ad, lead }) {
  if (!ad?.whatsapp_number) {
    logger.warn(
      {
        adId: ad?.id,
        sellerId: ad?.seller_user_id,
        leadId: lead?.id,
      },
      "[leads.service] Anúncio sem whatsapp_number; notificação não enfileirada"
    );
    return null;
  }

  const message = `Olá! Tenho interesse no ${ad.title} anunciado no Carros na Cidade. Ainda está disponível?`;

  const normalizedSellerPhone = normalizePhone(ad.whatsapp_number);

  if (!normalizedSellerPhone) {
    logger.warn(
      {
        adId: ad?.id,
        sellerId: ad?.seller_user_id,
        leadId: lead?.id,
      },
      "[leads.service] whatsapp_number inválido; notificação não enfileirada"
    );
    return null;
  }

  try {
    const job = await addWhatsAppJob(
      "send-message",
      {
        leadId: lead.id,
        adId: ad.id,
        sellerId: ad.seller_user_id,
        cityId: ad.city_id,
        phone: normalizedSellerPhone,
        message,
        channel: "whatsapp",
        origin: "leads.service",
        createdAt: new Date().toISOString(),
      },
      {
        jobId: `lead:${lead.id}:ad:${ad.id}:seller:${ad.seller_user_id}`,
      }
    );

    logger.info(
      {
        leadId: lead.id,
        adId: ad.id,
        sellerId: ad.seller_user_id,
        jobId: job?.id,
      },
      "[leads.service] Notificação WhatsApp enfileirada com sucesso"
    );

    return job;
  } catch (error) {
    logger.error(
      {
        error,
        leadId: lead.id,
        adId: ad.id,
        sellerId: ad.seller_user_id,
      },
      "[leads.service] Falha ao enfileirar notificação WhatsApp"
    );

    return null;
  }
}

/**
 * Registra um "lead enviado" a partir de um clique em botão de WhatsApp na
 * página do veículo (versão mínima, SEM captura de dado pessoal do visitante).
 *
 * Diferente de `createLead` (formulário de contato):
 *   - Não recebe nem grava nome/telefone do comprador (`buyer_name`/`buyer_phone`
 *     ficam NULL — o visitante está abrindo o WhatsApp por conta própria).
 *   - `source = 'whatsapp'` para diferenciar do lead de formulário ('form').
 *   - NÃO enfileira notificação WhatsApp ao lojista (o próprio visitante já
 *     está iniciando a conversa via `wa.me`; notificar seria ruído/duplicidade).
 *   - NÃO toca em `seller_scores`/`city_metrics` — o card "Leads recebidos" do
 *     painel conta linhas de `leads` por `seller_id` (getLeadCountsForOwner),
 *     então uma única linha já faz o número subir. Mantém a gravação leve.
 *
 * É um único INSERT ... SELECT: resolve anúncio ativo + vendedor e grava numa
 * ida ao banco. Se o anúncio não existir, não estiver ativo ou não tiver
 * vendedor vinculado, nada é inserido (retorna `{ registered: false }`) — o
 * chamador é fire-and-forget e ignora o corpo da resposta de qualquer forma.
 */
export async function recordWhatsappLead(input) {
  const adId = Number(input?.adId);

  if (!adId || Number.isNaN(adId)) {
    throw new AppError("ID do anúncio inválido", 400);
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO leads (ad_id, seller_id, city_id, source)
      SELECT a.id, adv.user_id, a.city_id, 'whatsapp'
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.id = $1
        AND a.status = 'active'
        AND adv.user_id IS NOT NULL
      RETURNING id
      `,
      [adId]
    );

    const registered = result.rowCount > 0;

    if (registered) {
      logger.info(
        { leadId: result.rows[0].id, adId, source: "whatsapp" },
        "[leads.service] Lead de WhatsApp registrado"
      );
    } else {
      logger.debug(
        { adId },
        "[leads.service] Clique de WhatsApp sem lead (anúncio inativo/sem vendedor)"
      );
    }

    return { registered };
  } catch (error) {
    logger.error({ error, adId }, "[leads.service] Erro ao registrar lead de WhatsApp");
    throw new AppError("Erro ao registrar contato", 500);
  }
}

export async function createLead(input) {
  const { adId, buyerName, buyerPhone } = validateCreateLeadInput(input);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // O telefone do vendedor vem SEMPRE do advertiser — a tabela `ads` não tem
    // coluna `whatsapp_number` (o `SELECT a.whatsapp_number` anterior quebrava a
    // transação com "column a.whatsapp_number does not exist" → 500, e nenhum
    // lead era gravado). Alinhado ao mesmo COALESCE usado no serializer público
    // (ads.repository.js) e no botão de WhatsApp do front — fonte de verdade única.
    const adResult = await client.query(
      `
      SELECT
        a.id,
        a.city_id,
        a.title,
        COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number,
        a.status,
        adv.user_id AS seller_user_id
      FROM ads a
      LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.id = $1
      FOR UPDATE OF a
      `,
      [adId]
    );

    if (adResult.rows.length === 0) {
      throw new AppError("Anúncio não encontrado", 404);
    }

    const ad = adResult.rows[0];

    if (ad.status !== "active") {
      throw new AppError("Anúncio não está ativo", 400);
    }

    if (ad.seller_user_id == null) {
      throw new AppError("Anúncio sem vendedor vinculado", 400);
    }

    const leadResult = await client.query(
      `
      INSERT INTO leads (
        ad_id,
        seller_id,
        city_id,
        buyer_name,
        buyer_phone
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [ad.id, ad.seller_user_id, ad.city_id, buyerName, buyerPhone]
    );

    const lead = leadResult.rows[0];

    await client.query(
      `
      INSERT INTO city_metrics (city_id, total_leads, updated_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        total_leads = COALESCE(city_metrics.total_leads, 0) + 1,
        updated_at = NOW()
      `,
      [ad.city_id]
    );

    await client.query(
      `
      INSERT INTO seller_scores (seller_id, total_leads, updated_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (seller_id)
      DO UPDATE SET
        total_leads = seller_scores.total_leads + 1,
        updated_at = NOW()
      `,
      [ad.seller_user_id]
    );

    await client.query("COMMIT");

    logger.info(
      {
        leadId: lead.id,
        adId: ad.id,
        sellerId: ad.seller_user_id,
        cityId: ad.city_id,
      },
      "[leads.service] Lead criado com sucesso"
    );

    await enqueueLeadNotification({ ad, lead });

    return lead;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error instanceof AppError) {
      throw error;
    }

    logger.error({ error, adId, buyerName }, "[leads.service] Erro ao criar lead");

    throw new AppError("Erro ao criar lead", 500);
  } finally {
    client.release();
  }
}
