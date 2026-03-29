import express from "express";
import { recordInboundByPhone } from "./dealer-leads.repository.js";
import { normalizeBrazilPhoneDigits } from "../../shared/utils/brPhone.js";
import { logger } from "../../shared/logger.js";

const router = express.Router();

/**
 * Webhook genérico para respostas de WhatsApp (Meta Cloud API, provedor intermediário, etc.).
 * Configure o mesmo segredo em DEALER_WHATSAPP_WEBHOOK_SECRET.
 *
 * Body JSON: { "from": "+5511999990000", "text": "sim" }
 */
router.post("/whatsapp", async (req, res) => {
  const expected = process.env.DEALER_WHATSAPP_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers["x-webhook-secret"] || req.headers["x-dealer-webhook-secret"];
    if (got !== expected) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  }

  const from = req.body?.from ?? req.body?.phone ?? req.body?.wa_id;
  const text = req.body?.text ?? req.body?.body ?? req.body?.message ?? "";

  const phone = normalizeBrazilPhoneDigits(from);
  if (!phone) {
    return res.status(400).json({ success: false, message: "Telefone inválido" });
  }

  try {
    const leadId = await recordInboundByPhone(phone, String(text));
    return res.status(200).json({ success: true, leadId });
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, "[dealer-inbound] falha");
    return res.status(500).json({ success: false, message: "Erro ao registrar" });
  }
});

export default router;
