/**
 * Cliente e vocabulário do envio de veículos (Fase 3).
 *
 * Espelho de `src/modules/purchase-intents/purchase-intent-offers.constants.js`
 * — manter em sincronia. O backend é a fonte de verdade de tudo que decide:
 * compatibilidade, posse do anúncio, limite de 3 e disponibilidade. O que está
 * aqui existe para RENDERIZAR e para dar resposta imediata ao clique.
 *
 * Em particular, `already_sent` e `limit` são informação de tela, não
 * autorização: o POST revalida os dois no servidor.
 */

// --- Vocabulário ------------------------------------------------------------

/** `null` quando algum dos lados não tem valor numérico legível. */
export type BudgetRelation = "within_budget" | "above_budget" | null;

/** Espelho de PURCHASE_INTENT_OFFER_MAX_PER_DEALER. */
export const PURCHASE_INTENT_OFFER_MAX_PER_DEALER = 3;

export const BUDGET_RELATION_LABEL: Record<"within_budget" | "above_budget", string> = {
  within_budget: "Dentro do orçamento",
  above_budget: "Acima do orçamento",
};

/** O comprador lê "seu orçamento"; o lojista lê "o orçamento". */
export const BUYER_BUDGET_RELATION_LABEL: Record<"within_budget" | "above_budget", string> = {
  within_budget: "Dentro do seu orçamento",
  above_budget: "Acima do seu orçamento",
};

export const BUDGET_RELATION_CLASS: Record<"within_budget" | "above_budget", string> = {
  within_budget: "border-[#a7e3c0] bg-[#f0fbf4] text-[#15803d]",
  above_budget: "border-[#fcd9a8] bg-[#fff7ed] text-[#b45309]",
};

// --- Tipos de dado ----------------------------------------------------------

/** Card do estoque do lojista, na tela da oportunidade. */
export type MatchingAd = {
  ad_id: number | string;
  slug: string | null;
  title: string | null;
  /** "Honda HR-V" — marca canônica + modelo comercial, derivados no backend. */
  vehicle_name: string;
  brand: string | null;
  year: number | null;
  mileage: number | null;
  transmission: string | null;
  /** NUMERIC do Postgres chega como string. */
  price: string | null;
  main_image: string | null;
  budget_relation: BudgetRelation;
  already_sent: boolean;
};

export type MatchingAdsPage = {
  matching_ads: MatchingAd[];
  limit: {
    max_per_dealer: number;
    used: number;
    remaining: number;
  };
};

/**
 * Card do veículo recebido, na tela do comprador.
 *
 * `vehicle` carrega o estado ATUAL do anúncio — preço, foto e km são lidos de
 * `ads` a cada request, nunca de uma cópia guardada no envio.
 *
 * Não existe campo de contato: nem telefone, nem WhatsApp, nem e-mail. O
 * produto desta fase termina no card; a conversa é da próxima.
 */
export type ReceivedOffer = {
  offer_id: number | string;
  sent_at: string;
  budget_relation: BudgetRelation;
  vehicle: {
    id: number | string;
    slug: string | null;
    title: string | null;
    vehicle_name: string;
    brand: string | null;
    year: number | null;
    mileage: number | null;
    transmission: string | null;
    price: string | null;
    main_image: string | null;
    city: { name: string; state: string } | null;
    /** `ads.status = active` E loja operacional, no momento da leitura. */
    available: boolean;
  };
  dealer: {
    name: string | null;
  };
};

export type ReceivedOffersPage = {
  offers: ReceivedOffer[];
};

export type SendOfferResult = {
  offer: { id: number | string | null; ad_id: number | string; sent_at: string | null };
  created: boolean;
  already_sent?: boolean;
};

// --- Fetch ------------------------------------------------------------------

function extractMessage(payload: unknown, fallbackStatus: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return `Erro ${fallbackStatus}`;
}

async function offersFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) throw new Error(extractMessage(json, res.status));
  return json as T;
}

const BUYER_BASE = "/api/account/purchase-intents";
const DEALER_BASE = "/api/account/opportunities/purchase-intents";

/** Estoque compatível do próprio lojista para uma oportunidade. */
export async function fetchMatchingAds(intentId: number): Promise<MatchingAdsPage> {
  const page = await offersFetch<MatchingAdsPage>(`${DEALER_BASE}/${intentId}/matching-ads`);
  return {
    // Coerção defensiva: um payload inesperado não pode derrubar a tela da
    // oportunidade, que é o conteúdo principal.
    matching_ads: Array.isArray(page?.matching_ads) ? page.matching_ads : [],
    limit: {
      max_per_dealer: page?.limit?.max_per_dealer ?? PURCHASE_INTENT_OFFER_MAX_PER_DEALER,
      used: page?.limit?.used ?? 0,
      remaining: page?.limit?.remaining ?? PURCHASE_INTENT_OFFER_MAX_PER_DEALER,
    },
  };
}

/**
 * Envia um veículo. O corpo carrega SÓ `ad_id` — quem envia sai da sessão e
 * para quem sai da procura, os dois resolvidos no servidor.
 */
export async function sendVehicleToBuyer(
  intentId: number,
  adId: number | string
): Promise<SendOfferResult> {
  return offersFetch<SendOfferResult>(`${DEALER_BASE}/${intentId}/offers`, {
    method: "POST",
    body: JSON.stringify({ ad_id: adId }),
  });
}

/** Veículos que as lojas enviaram para uma procura DO PRÓPRIO comprador. */
export async function fetchReceivedOffers(intentId: number): Promise<ReceivedOffersPage> {
  const page = await offersFetch<ReceivedOffersPage>(`${BUYER_BASE}/${intentId}/offers`);
  return { offers: Array.isArray(page?.offers) ? page.offers : [] };
}

// --- Apresentação -----------------------------------------------------------

/**
 * Preço em BRL, sem centavos. "R$ 98.900".
 *
 * Diferente de `formatMaxPrice` (que prefixa "Até"): aqui o valor é o preço
 * EXATO do anúncio, não um teto.
 */
export function formatVehiclePrice(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "Preço sob consulta";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

/** "72.000 km". Vazio quando não há valor — km 0 é informação, não ausência. */
export function formatMileage(value: number | string | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return `${new Intl.NumberFormat("pt-BR").format(Math.round(numeric))} km`;
}

/**
 * Linha de atributos do card: ano · km · câmbio.
 *
 * Junta só o que existe. Um separador solto ("2020 · · Automático") denuncia
 * dado faltando de um jeito que parece defeito da tela.
 */
export function vehicleAttributes(vehicle: {
  year?: number | null;
  mileage?: number | string | null;
  transmission?: string | null;
}): string[] {
  const parts: string[] = [];
  if (vehicle.year) parts.push(String(vehicle.year));

  const mileage = formatMileage(vehicle.mileage);
  if (mileage) parts.push(mileage);

  if (vehicle.transmission) {
    const labels: Record<string, string> = {
      automatico: "Automático",
      manual: "Manual",
      cvt: "CVT",
    };
    parts.push(labels[vehicle.transmission] || vehicle.transmission);
  }

  return parts;
}

/** Rota pública do anúncio. Só usada quando `available` é true. */
export function vehicleHref(slug: string | null | undefined): string | null {
  const value = String(slug ?? "").trim();
  return value ? `/veiculo/${value}` : null;
}

/** "2 opções recebidas" / "1 opção recebida". */
export function formatOfferCount(total: number): string {
  return total === 1 ? "1 opção recebida" : `${total} opções recebidas`;
}
