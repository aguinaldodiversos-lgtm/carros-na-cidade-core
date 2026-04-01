import { getBackendApiBaseUrl } from "@/lib/env/backend-api";

type SubmitVehicleLeadInput = {
  adId: string;
  buyerName: string;
  buyerPhone: string;
};

type LeadApiResponse = {
  success?: boolean;
  message?: string;
  data?: unknown;
  error?: string;
};

function getApiBaseUrl() {
  return getBackendApiBaseUrl();
}

export async function submitVehicleLead(input: SubmitVehicleLeadInput) {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error("API pública indisponível para envio de lead.");
  }

  const response = await fetch(`${apiBase}/api/leads/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      adId: input.adId,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as LeadApiResponse;
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Não foi possível enviar o lead.");
  }

  return payload;
}
