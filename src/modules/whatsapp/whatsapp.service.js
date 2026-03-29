import { logger } from "../../shared/logger.js";
import { validateWhatsAppJobData } from "./whatsapp.validators.js";
import { getWhatsAppProvider } from "./providers/index.js";
import * as dealerLeadsRepo from "../dealer-acquisition/dealer-leads.repository.js";

export async function sendWhatsAppMessage(payload) {
  const data = validateWhatsAppJobData(payload);
  const provider = getWhatsAppProvider();

  const result = await provider.sendMessage({
    phone: data.phone,
    message: data.message,
    metadata: {
      leadId: data.leadId ?? null,
      adId: data.adId ?? null,
      sellerId: data.sellerId ?? null,
      cityId: data.cityId ?? null,
      dealerLeadId: data.dealerLeadId ?? null,
      origin: data.origin ?? null,
      channel: data.channel ?? "whatsapp",
      createdAt: data.createdAt ?? null,
    },
  });

  logger.info(
    {
      provider: provider.name,
      leadId: data.leadId ?? null,
      adId: data.adId ?? null,
      sellerId: data.sellerId ?? null,
      providerMessageId: result?.messageId ?? null,
      dealerLeadId: data.dealerLeadId ?? null,
    },
    "[whatsapp.service] Mensagem enviada com sucesso"
  );

  if (data.dealerLeadId) {
    try {
      const recorded = await dealerLeadsRepo.markOutboundSent(data.dealerLeadId, {
        providerMessageId: result?.messageId ?? null,
        body: data.message,
      });
      if (recorded && data.cityId) {
        await dealerLeadsRepo.bumpCityDealerMetrics(data.cityId, {
          pipeline: 0,
          outreach: 1,
        });
      }
    } catch (err) {
      logger.error(
        { err: err?.message || String(err), dealerLeadId: data.dealerLeadId },
        "[whatsapp.service] Falha ao registrar outreach em dealer_leads"
      );
    }
  }

  return result;
}

export async function processWhatsAppJob(job) {
  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    },
    "[whatsapp.service] Processando job"
  );

  switch (job.name) {
    case "send-message":
      return sendWhatsAppMessage(job.data);

    default:
      throw new Error(`Tipo de job não suportado: ${job.name}`);
  }
}
