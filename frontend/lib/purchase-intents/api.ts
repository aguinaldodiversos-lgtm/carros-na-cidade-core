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
  sort: DealerOpportunitySort;
  /** `null` = o servidor não mandou contagem. Ver `fetchDealerOpportunities`. */
  summary: { total: number | null };
};

// --- Feed do lojista: filtros e ordenação (Fase 4.11C) ----------------------

/**
 * Espelho de `DEALER_OPPORTUNITY_SORTS` no backend.
 *
 * As quatro são resolvidas no SERVIDOR. Ordenar no cliente produziria uma ordem
 * que mente sobre o conjunto: "maior orçamento" mostraria o maior da PRIMEIRA
 * página, não o da cidade.
 */
export type DealerOpportunitySort = "recent" | "oldest" | "budget_desc" | "budget_asc";

export const DEALER_SORT_OPTIONS: ReadonlyArray<{
  value: DealerOpportunitySort;
  label: string;
}> = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigas" },
  { value: "budget_desc", label: "Maior orçamento" },
  { value: "budget_asc", label: "Menor orçamento" },
];

/**
 * Os filtros do feed. As chaves são os NOMES DA QUERY STRING — o objeto vira
 * `URLSearchParams` sem tradução, então um filtro só existe aqui se o backend
 * souber lê-lo.
 *
 * NÃO existe `city_id`: a cidade é resolvida no servidor a partir da loja, e a
 * tela a mostra como texto fixo. Também não existe combustível nem faixa de ano
 * — `purchase_intents` não tem essas colunas, e um `<select>` que não filtra
 * nada é um controle morto com aparência de funcional.
 */
export type DealerOpportunityFilters = {
  intent_type: PurchaseIntentType | null;
  brand: string | null;
  body_type: string | null;
  transmission: string | null;
  purchase_timeframe: PurchaseTimeframe | null;
  budget_min: string | null;
  budget_max: string | null;
};

export const EMPTY_DEALER_FILTERS: DealerOpportunityFilters = {
  intent_type: null,
  brand: null,
  body_type: null,
  transmission: null,
  purchase_timeframe: null,
  budget_min: null,
  budget_max: null,
};

export function countActiveDealerFilters(filters: DealerOpportunityFilters): number {
  return Object.values(filters).filter((value) => value != null && String(value).trim() !== "")
    .length;
}

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

/**
 * Query string do feed do lojista.
 *
 * Só entram chaves com valor: `?transmission=` (vazio) chegaria ao backend como
 * um filtro em branco e, na validação estrita da Fase 4.11C, seria apenas
 * ignorado — mas mandar chave morta faz a URL crescer e confunde quem lê o
 * network. `sort=recent` também é omitido por ser o padrão do servidor.
 */
export function buildDealerFeedQuery(options: {
  filters: DealerOpportunityFilters;
  sort: DealerOpportunitySort;
  cursor?: string | null;
}): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(options.filters)) {
    if (value != null && String(value).trim() !== "") query.set(key, String(value));
  }

  if (options.sort && options.sort !== "recent") query.set("sort", options.sort);
  if (options.cursor) query.set("cursor", options.cursor);

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function fetchDealerOpportunities(
  options: {
    filters?: DealerOpportunityFilters;
    sort?: DealerOpportunitySort;
    cursor?: string | null;
  } = {}
): Promise<DealerOpportunityPage> {
  const sort = options.sort ?? "recent";
  const filters = options.filters ?? EMPTY_DEALER_FILTERS;

  const page = await bffFetch<{
    purchase_intents?: DealerOpportunity[];
    next_cursor?: string | null;
    limit?: number;
    sort?: DealerOpportunitySort;
    summary?: { total?: number };
  }>(DEALER_BASE, buildDealerFeedQuery({ filters, sort, cursor: options.cursor }));

  return {
    items: Array.isArray(page?.purchase_intents) ? page.purchase_intents : [],
    next_cursor: page?.next_cursor ?? null,
    limit: page?.limit ?? 20,
    sort: page?.sort ?? sort,
    /*
      `total` NÃO cai para `items.length` quando o payload vier sem ele.

      O cabeçalho anuncia "N oportunidades ativas"; usar o tamanho da página
      diria "20" para uma cidade com 53 procuras — um número errado com cara de
      certo. `null` faz o cabeçalho OMITIR a contagem, que é a leitura honesta de
      "o servidor não disse".
    */
    summary: { total: typeof page?.summary?.total === "number" ? page.summary.total : null },
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

// ════════════════════════════════════════════════════════════════════════════
// CARD DE COMPRADOR ATIVO (Fase 4.11C)
// ════════════════════════════════════════════════════════════════════════════

/**
 * A ETIQUETA DE MODO — e por que são DUAS, não três.
 *
 * A referência visual desta fase mostra três tipos de procura: "Compra
 * específica", "Categoria aberta" e "Cabe no bolso" (orçamento/parcela).
 *
 * O domínio tem DOIS modos. `PURCHASE_INTENT_TYPE` é um CHECK de dois valores
 * (`specific_model`, `open_category`), e `purchase_intents` não tem coluna de
 * entrada, parcela nem prazo de financiamento. Não existe procura "cabe no
 * bolso" para etiquetar.
 *
 * Inventar a terceira etiqueta a partir do texto — "se o título não tem modelo,
 * chama de cabe no bolso" — daria ao lojista uma classificação que nenhum
 * comprador declarou. A etiqueta sai do CAMPO `intent_type`, e de mais nada.
 *
 * Criar o terceiro modo de verdade é trabalho de produto: campo novo no
 * formulário do comprador, migration e CHECK. Não cabe numa fase de layout.
 */
export const INTENT_MODE_BADGE: Record<
  PurchaseIntentType,
  { label: string; className: string }
> = {
  specific_model: {
    label: "Compra específica",
    className: "border-[#cfe0fb] bg-[#eff5ff] text-[#0e62d8]",
  },
  open_category: {
    label: "Categoria aberta",
    className: "border-[#a7e3c0] bg-[#f0fbf4] text-[#15803d]",
  },
};

/**
 * Título do card.
 *
 * `specific_model` → "Volkswagen Gol": marca e modelo, como o comprador
 * declarou. Sem ano (a procura não tem faixa de ano) e sem versão inventada.
 *
 * `open_category` → "SUV até R$ 90.000": a carroceria mais o teto, que juntos
 * são a procura inteira. Só "SUV" deixaria o card sem o dado que decide se vale
 * a abordagem.
 *
 * Nunca devolve string vazia: um card sem título seria um retângulo mudo.
 */
export function describeOpportunityTitle(opportunity: {
  intent_type: PurchaseIntentType;
  brand?: string | null;
  model?: string | null;
  body_type?: string | null;
  max_price?: string | number | null;
}): string {
  if (opportunity.intent_type === "specific_model") {
    const named = [opportunity.brand, opportunity.model].filter(Boolean).join(" ").trim();
    return named || "Modelo específico";
  }

  const body = opportunity.body_type
    ? BODY_TYPE_LABEL[opportunity.body_type] || opportunity.body_type
    : "";
  const budget = formatMoney(opportunity.max_price);

  if (body && budget) return `${body} até ${budget}`;
  return body || "Categoria aberta";
}

/**
 * Os critérios DECLARADOS, em uma linha.
 *
 * Monta um array e junta com "•" no fim — nunca concatena com separador fixo.
 * A diferença aparece quando um campo é nulo: `"" + " • " + "Manual"` renderiza
 * "• Manual", um marcador órfão que parece defeito. Aqui um campo ausente
 * simplesmente não entra na lista, e uma lista vazia devolve "" (a linha inteira
 * some, em vez de virar "Não informado • Não informado").
 *
 * `transmission` é NOT NULL no banco; a guarda existe porque o card também
 * renderiza payloads de teste e de fixture, e um `undefined` na tela é pior do
 * que uma linha a menos.
 */
export function describeOpportunityCriteria(opportunity: {
  transmission?: string | null;
  purchase_timeframe?: PurchaseTimeframe | null;
}): string {
  const parts: string[] = [];

  if (opportunity.transmission) {
    parts.push(TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission);
  }
  if (opportunity.purchase_timeframe && PURCHASE_TIMEFRAME_LABEL[opportunity.purchase_timeframe]) {
    parts.push(PURCHASE_TIMEFRAME_LABEL[opportunity.purchase_timeframe]);
  }

  return parts.join(" • ");
}

/** "R$ 95.000", sem prefixo. `""` quando não há valor utilizável. */
export function formatMoney(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

/**
 * O orçamento partido em duas peças, para o card poder dar pesos tipográficos
 * diferentes ao "Até" e ao número.
 *
 * `prefix` é "Até" — nunca "Preço", "Valor" nem "Preço do veículo". O comprador
 * declarou um TETO de capacidade; chamar isso de preço faria o lojista ler o
 * número como se um carro específico já estivesse precificado.
 *
 * Sem valor utilizável, `value` é `null` e o card mostra a frase neutra em vez
 * de "R$ 0" — que seria um orçamento inventado.
 */
export function formatBudgetParts(value: string | number | null | undefined): {
  prefix: string | null;
  value: string | null;
  fallback: string;
} {
  const money = formatMoney(value);
  if (!money) return { prefix: null, value: null, fallback: "Sem orçamento definido" };
  return { prefix: "Até", value: money, fallback: "" };
}

/**
 * A CARROCERIA que a ilustração deve desenhar.
 *
 * `open_category` declara a carroceria — a ilustração desenha exatamente ela.
 *
 * `specific_model` NÃO declara: o CHECK da tabela obriga `body_type` a ser NULL
 * quando há marca e modelo. Derivar "Gol → hatch" de uma tabela de nomes seria
 * um PALPITE nosso apresentado como dado do comprador, e ele erraria em silêncio
 * no primeiro modelo que mudou de categoria entre gerações.
 *
 * Por isso o modo específico cai no veículo GENÉRICO. O texto do card já diz
 * "Volkswagen Gol"; a ilustração não precisa (nem pode) confirmar a carroceria.
 */
export function artBodyTypeFor(opportunity: {
  intent_type: PurchaseIntentType;
  body_type?: string | null;
}): string {
  if (opportunity.intent_type === "open_category" && opportunity.body_type) {
    return opportunity.body_type;
  }
  return "generic";
}
