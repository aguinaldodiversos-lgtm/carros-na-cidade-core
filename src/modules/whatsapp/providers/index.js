import { sendWithMockProvider } from "./mock.provider.js";

/**
 * @returns {{ name: string, sendMessage: (args: { phone: string, message: string, metadata?: Record<string, unknown> }) => Promise<unknown> }}
 */
export function getWhatsAppProvider() {
  const mode = String(process.env.WHATSAPP_PROVIDER || "mock").toLowerCase();

  if (mode === "mock" || mode === "development") {
    return {
      name: "mock",
      async sendMessage({ phone, message, metadata }) {
        return sendWithMockProvider({ phone, message, metadata });
      },
    };
  }

  // Extensão futura: Meta Cloud API, Twilio, etc.
  return {
    name: "mock",
    async sendMessage({ phone, message, metadata }) {
      return sendWithMockProvider({ phone, message, metadata });
    },
  };
}
