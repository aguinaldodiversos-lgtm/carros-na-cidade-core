import { logger } from "../../../shared/logger.js";

export async function sendWithMockProvider({ phone, message, metadata = {} }) {
  logger.info(
    {
      phone,
      metadata,
    },
    "[whatsapp.provider:mock] Simulação de envio"
  );

  return {
    success: true,
    provider: "mock",
    messageId: `mock-${Date.now()}`,
    deliveredAt: new Date().toISOString(),
    phone,
    message,
  };
}
