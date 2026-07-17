import { createLead, recordWhatsappLead } from "./leads.service.js";

export async function sendLead(req, res, next) {
  try {
    const { adId, buyerName, buyerPhone } = req.body;

    const lead = await createLead({
      adId,
      buyerName,
      buyerPhone,
    });

    res.json({
      success: true,
      lead,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Registra o "lead enviado" no clique de um botão de WhatsApp (sem PII).
 * Chamado em fire-and-forget pelo front (beacon) — responde rápido e nunca é
 * pré-requisito para abrir o `wa.me`. Aceita `adId` ou `ad_id` no corpo (o
 * beacon usa `sendBeacon`, então blindamos o nome da chave).
 */
export async function registerWhatsappLead(req, res, next) {
  try {
    const adId = req.body?.adId ?? req.body?.ad_id;

    const result = await recordWhatsappLead({ adId });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
