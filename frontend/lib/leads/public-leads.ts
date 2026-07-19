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
  const value = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  return value.replace(/\/+$/, "");
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

/* ----------------------------------------------------------------------------
 * Registro de "lead enviado" no clique de WhatsApp (versão mínima, sem PII).
 *
 * Dispara em fire-and-forget (sendBeacon → fallback fetch keepalive) para
 * `POST /api/leads/whatsapp-click`. NUNCA bloqueia nem atrasa a abertura do
 * `wa.me`: a âncora abre a conversa normalmente; este registro é paralelo e
 * secundário. Qualquer falha (rede, CORS, storage) é engolida.
 *
 * Dedup CLIENT-SIDE por anúncio: uma janela de 30 min por `adId`, guardada em
 * localStorage. Os dois botões de WhatsApp (card lateral + simulador)
 * COMPARTILHAM a mesma janela — dois cliques no mesmo anúncio dentro de 30 min
 * = 1 lead. Não deduplicamos no servidor de propósito: exigiria gravar IP/
 * identificador (PII sob LGPD), contra a premissa "sem captura". Tradeoff
 * aceito: é por-navegador (aba anônima / storage limpo reabrem a janela).
 * -------------------------------------------------------------------------- */

const WA_LEAD_DEDUP_PREFIX = "cnc:wa-lead:";
const WA_LEAD_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutos

function normalizeAdId(adId: string | number): string {
  if (typeof adId === "number") {
    return Number.isFinite(adId) && adId > 0 ? String(adId) : "";
  }
  return String(adId || "").trim();
}

function wasRecentlyRegistered(adId: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const raw = window.localStorage.getItem(`${WA_LEAD_DEDUP_PREFIX}${adId}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < WA_LEAD_DEDUP_WINDOW_MS;
  } catch {
    return false;
  }
}

function markRegistered(adId: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(`${WA_LEAD_DEDUP_PREFIX}${adId}`, String(Date.now()));
  } catch {
    // storage indisponível (modo privado/cheio) — segue sem dedup
  }
}

function getWhatsappClickUrl(): string {
  const apiBase = getApiBaseUrl();
  return apiBase ? `${apiBase}/api/leads/whatsapp-click` : "/api/leads/whatsapp-click";
}

function sendWhatsappClickBeacon(url: string, adId: string): void {
  const body = JSON.stringify({ adId });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
    ) {
      return;
    }
  } catch {
    // cai para o fetch abaixo
  }

  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  } catch {
    // best effort only — o WhatsApp já abriu de qualquer forma
  }
}

/**
 * Registra o contato de WhatsApp para o anúncio. Chamado no `onClick` dos
 * botões de WhatsApp, ANTES/ao lado da navegação para o `wa.me`. Retorna void
 * (fire-and-forget). Respeita o dedup de 30 min por anúncio.
 */
export function registerWhatsappContact(adId: string | number): void {
  const normalized = normalizeAdId(adId);
  if (!normalized) return;
  if (wasRecentlyRegistered(normalized)) return;

  markRegistered(normalized);
  sendWhatsappClickBeacon(getWhatsappClickUrl(), normalized);
}
