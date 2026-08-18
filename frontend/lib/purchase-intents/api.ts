/**
 * Cliente e vocabulário das procuras (Fase 2 — Compradores ativos).
 *
 * Espelho de `src/modules/purchase-intents/purchase-intents.constants.js` —
 * manter em sincronia. O backend é a fonte de verdade da validação; o que está
 * aqui existe para dar resposta imediata no formulário e para renderizar
 * rótulos. Nada que este arquivo aceite passa a valer se o backend recusar.
 */

// --- Vocabulário ------------------------------------------------------------

export type PurchaseIntentType = "specific_model" | "open_category";
export type PurchaseIntentStatus = "active" | "closed";
/** Estado exibido: `expired` é derivado de `expires_at`, não é coluna. */
export type PurchaseIntentDisplayStatus = "active" | "closed" | "expired";
export type PurchaseTimeframe = "as_soon_as_possible" | "within_7_days" | "within_30_days";

export const PURCHASE_TIMEFRAME_OPTIONS: ReadonlyArray<{
  value: PurchaseTimeframe;
  label: string;
}> = [
  { value: "as_soon_as_possible", label: "O quanto antes" },
  { value: "within_7_days", label: "Em até 7 dias" },
  { value: "within_30_days", label: "Em até 30 dias" },
];

export const PURCHASE_TIMEFRAME_LABEL: Record<PurchaseTimeframe, string> = {
  as_soon_as_possible: "O quanto antes",
  within_7_days: "Em até 7 dias",
  within_30_days: "Em até 30 dias",
};

/**
 * Câmbio. `value` é o slug CANÔNICO gravado no banco — sem acento. O rótulo
 * acentuado só existe na tela; mandar "Automático" como valor faria a procura
 * nunca casar com um anúncio gravado como "automatico".
 */
export const TRANSMISSION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "automatico", label: "Automático" },
  { value: "manual", label: "Manual" },
  { value: "cvt", label: "CVT" },
];

export const TRANSMISSION_LABEL: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  cvt: "CVT",
};

export const BODY_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "hatch", label: "Hatch" },
  { value: "sedan", label: "Sedã" },
  { value: "suv", label: "SUV" },
  { value: "picape", label: "Picape" },
  { value: "coupe", label: "Coupé" },
  { value: "minivan", label: "Minivan" },
  { value: "wagon", label: "Perua" },
];

export const BODY_TYPE_LABEL: Record<string, string> = {
  hatch: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  picape: "Picape",
  coupe: "Coupé",
  minivan: "Minivan",
  wagon: "Perua",
};

/** Espelho de PURCHASE_INTENT_LIMITS no backend. */
export const PURCHASE_INTENT_LIMITS = {
  MAX_PRICE_MIN: 1000,
  MAX_PRICE_MAX: 9999999.99,
} as const;

export const PURCHASE_INTENT_ACTIVE_DAYS = 30;

// --- Tipos de dado ----------------------------------------------------------

export type PurchaseIntentCity = {
  name: string;
  state: string;
  slug: string;
};

/** Procura como o DONO a vê. */
export type PurchaseIntent = {
  id: number;
  intent_type: PurchaseIntentType;
  brand: string | null;
  brand_slug: string | null;
  model: string | null;
  model_slug: string | null;
  body_type: string | null;
  transmission: string;
  /** NUMERIC do Postgres chega como string. */
  max_price: string;
  purchase_timeframe: PurchaseTimeframe;
  status: PurchaseIntentStatus;
  display_status: PurchaseIntentDisplayStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  city: PurchaseIntentCity;
};

/**
 * Oportunidade como o LOJISTA a vê.
 *
 * O tipo é deliberadamente mais pobre que `PurchaseIntent`: não existe campo de
 * identidade do comprador porque o backend não envia nenhum. Se alguém um dia
 * adicionar um, o tipo aqui precisa mudar junto — e a revisão vê.
 */
export type DealerOpportunity = {
  id: number;
  intent_type: PurchaseIntentType;
  brand: string | null;
  model: string | null;
  body_type: string | null;
  transmission: string;
  max_price: string;
  purchase_timeframe: PurchaseTimeframe;
  created_at: string;
  expires_at: string;
  city: PurchaseIntentCity;
};

/**
 * Página tipada para o hook de paginação.
 *
 * O campo é `items`; o payload do backend continua chamando a lista de
 * `purchase_intents`. A tradução acontece nos fetchers abaixo — é o trabalho
 * de fronteira que esta lib já faz, e é o que permite UMA máquina de paginação
 * servir listas de produtos diferentes (ver `lib/account/use-cursor-pagination`).
 */
export type PurchaseIntentPage = {
  items: PurchaseIntent[];
  next_cursor: string | null;
  limit: number;
};

export type DealerOpportunityPage = {
  items: DealerOpportunity[];
  next_cursor: string | null;
  limit: number;
};

export type NewPurchaseIntentPayload = {
  intent_type: PurchaseIntentType;
  brand?: string;
  model?: string;
  body_type?: string;
  transmission: string;
  max_price: number;
  purchase_timeframe: PurchaseTimeframe;
  city_id: number;
};

// --- Fetch -----------------------------------------------------------------

function extractMessage(payload: unknown, fallbackStatus: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return `Erro ${fallbackStatus}`;
}

async function bffFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  // Uma query string ("?cursor=…") é colada direto na base. Sem esta ramificação
  // ela viraria `/?cursor=…` e a request iria para a rota com barra final —
  // caminho diferente do endpoint de listagem.
  const suffix = !path ? "" : path.startsWith("?") ? path : `/${path.replace(/^\//, "")}`;
  const res = await fetch(`${base}${suffix}`, {
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

// --- Comprador --------------------------------------------------------------

/**
 * O cursor é OPACO: vem de `next_cursor` da página anterior e volta sem ser
 * interpretado. O cliente nunca o constrói — se construísse, passaria a depender
 * do formato interno (base64 de `"<createdAtISO>|<id>"`), que é justamente o que
 * o backend esconde.
 */
function cursorQuery(cursor?: string | null): string {
  return cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
}

export async function fetchMyPurchaseIntents(cursor?: string | null): Promise<PurchaseIntentPage> {
  const page = await bffFetch<{ purchase_intents?: PurchaseIntent[]; next_cursor?: string | null; limit?: number }>(
    BUYER_BASE,
    cursorQuery(cursor)
  );
  return {
    // Coerção defensiva: a listagem não pode quebrar a página por causa de um
    // payload inesperado.
    items: Array.isArray(page?.purchase_intents) ? page.purchase_intents : [],
    next_cursor: page?.next_cursor ?? null,
    limit: page?.limit ?? 20,
  };
}

export async function fetchMyPurchaseIntent(id: number): Promise<PurchaseIntent> {
  const payload = await bffFetch<{ purchase_intent: PurchaseIntent }>(BUYER_BASE, String(id));
  return payload.purchase_intent;
}

export async function createPurchaseIntent(
  payload: NewPurchaseIntentPayload
): Promise<PurchaseIntent> {
  const result = await bffFetch<{ purchase_intent: PurchaseIntent }>(BUYER_BASE, "", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.purchase_intent;
}

export async function closePurchaseIntent(id: number): Promise<PurchaseIntent> {
  const result = await bffFetch<{ purchase_intent: PurchaseIntent }>(BUYER_BASE, `${id}/close`, {
    method: "PATCH",
  });
  return result.purchase_intent;
}

// --- Lojista ----------------------------------------------------------------

export async function fetchDealerOpportunities(
  cursor?: string | null
): Promise<DealerOpportunityPage> {
  const page = await bffFetch<{ purchase_intents?: DealerOpportunity[]; next_cursor?: string | null; limit?: number }>(
    DEALER_BASE,
    cursorQuery(cursor)
  );
  return {
    items: Array.isArray(page?.purchase_intents) ? page.purchase_intents : [],
    next_cursor: page?.next_cursor ?? null,
    limit: page?.limit ?? 20,
  };
}

export async function fetchDealerOpportunity(id: number): Promise<DealerOpportunity> {
  const payload = await bffFetch<{ purchase_intent: DealerOpportunity }>(DEALER_BASE, String(id));
  return payload.purchase_intent;
}

// --- Apresentação -----------------------------------------------------------

/**
 * Resumo do veículo procurado, em uma linha.
 *
 * Serve os dois lados (comprador e lojista) porque descreve só o VEÍCULO —
 * nunca quem procura. É o mesmo texto que aparece no card e no detalhe.
 */
export function describeVehicle(intent: {
  intent_type: PurchaseIntentType;
  brand?: string | null;
  model?: string | null;
  body_type?: string | null;
}): string {
  if (intent.intent_type === "specific_model") {
    return [intent.brand, intent.model].filter(Boolean).join(" ");
  }
  const body = intent.body_type ? BODY_TYPE_LABEL[intent.body_type] || intent.body_type : "";
  return body;
}

/** `max_price` chega como string (NUMERIC). "Até R$ 95.000". */
export function formatMaxPrice(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "Sem orçamento definido";
  return `Até ${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric)}`;
}

export function formatCity(city: PurchaseIntentCity | null | undefined): string {
  if (!city?.name) return "";
  return city.state ? `${city.name} - ${city.state}` : city.name;
}

export const DISPLAY_STATUS_LABEL: Record<PurchaseIntentDisplayStatus, string> = {
  active: "Ativa",
  closed: "Encerrada",
  expired: "Expirada",
};

/** Classes do badge de status. Mesmo par borda/fundo usado no resto do painel. */
export const DISPLAY_STATUS_CLASS: Record<PurchaseIntentDisplayStatus, string> = {
  active: "border-[#a7e3c0] bg-[#f0fbf4] text-[#15803d]",
  closed: "border-[#cfd8e8] bg-[#f3f4f6] text-[#475569]",
  expired: "border-[#fcd9a8] bg-[#fff7ed] text-[#b45309]",
};

/**
 * Data curta pt-BR. Recebe `now` explicitamente em vez de chamar `Date.now()`
 * por dentro, para que o teste não precise de fake timer.
 */
export function formatPublishedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (days <= 0) return "Publicado hoje";
  if (days === 1) return "Publicado ontem";
  if (days < 30) return `Publicado há ${days} dias`;
  return `Publicado em ${date.toLocaleDateString("pt-BR")}`;
}
