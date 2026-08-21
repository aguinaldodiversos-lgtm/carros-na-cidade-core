/**
 * Contrato do FRONTEND com a área do lojista no Produto 2.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OS RÓTULOS NÃO SÃO REDECLARADOS AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * `readTireCondition`, `readYesNoUnknown`, `readCautionReport`,
 * `readMechanicalCondition`, `readBodyPaintStatus`, `NOT_INFORMED` e os tipos da
 * ficha já vivem em `lib/sale-requests/api.ts`, e são REEXPORTADOS deste módulo.
 *
 * Uma segunda tabela de rótulos aqui produziria a pior classe de defeito
 * possível neste produto: a tela do dono dizendo "Quitado" e a do lojista
 * dizendo outra coisa para a MESMA linha do banco. Quem publica precisa poder
 * confiar que o lojista lê o que ele declarou.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NÃO EXISTE NESTES TIPOS
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum campo de vendedor. Nem `owner`, nem `seller`, nem contato de espécie
 * alguma — porque a API não devolve nenhum. Não há campo escondido para a tela
 * esconder.
 */
import {
  NOT_INFORMED,
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
  type BodyPaintIssue,
  type BodyPaintStatus,
  type CautionReportStatus,
  type DeclaredCondition,
  type IpvaStatus,
  type LicensingStatus,
  type MechanicalCondition,
  type SaleRequestCity,
  type TireCondition,
  type YesNoUnknown,
} from "./api";

export {
  NOT_INFORMED,
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
};
export type {
  BodyPaintIssue,
  BodyPaintStatus,
  CautionReportStatus,
  DeclaredCondition,
  IpvaStatus,
  LicensingStatus,
  MechanicalCondition,
  SaleRequestCity,
  TireCondition,
  YesNoUnknown,
};

const BASE = "/api/account/opportunities/sale-requests";

/**
 * A ficha estruturada como chega do servidor.
 *
 * TODOS os campos são nullable, e isso NÃO é frouxidão de tipo: uma solicitação
 * publicada antes da ficha existir tem NULL aqui. O `| null` obriga cada tela a
 * decidir o que mostrar no lugar — e o que ela deve mostrar é "Não informado",
 * nunca um valor inventado e nunca "Não".
 */
export type DealerVehicleEvaluation = {
  tire_condition: TireCondition | null;

  financing_status: YesNoUnknown | null;
  financing_balance: string | null;
  fines_status: YesNoUnknown | null;
  fines_amount: string | null;
  ipva_status: IpvaStatus | null;
  ipva_amount_due: string | null;
  licensing_status: LicensingStatus | null;

  caution_report_status: CautionReportStatus | null;
  auction_history: YesNoUnknown | null;
  collision_history: YesNoUnknown | null;

  engine_condition: MechanicalCondition | null;
  engine_notes: string | null;
  gearbox_condition: MechanicalCondition | null;
  gearbox_notes: string | null;
  suspension_condition: MechanicalCondition | null;
  suspension_notes: string | null;

  body_paint_status: BodyPaintStatus | null;
  body_paint_issues: BodyPaintIssue[] | null;
  body_paint_notes: string | null;
};

/**
 * O card do feed.
 *
 * Carrega o estado da DISPUTA (`DealerOfferState`) junto: o valor líder e a
 * proposta desta loja chegam por card, em lote, na mesma resposta. A alternativa
 * — uma request por card para descobrir "estou liderando?" — seria N+1 no lugar
 * mais visitado da área.
 */
export type DealerSaleOpportunitySummary = DealerOfferState & {
  id: number | string;

  brand: string;
  brand_slug: string;
  model: string;
  model_slug: string;
  fipe_model_description: string;

  year: number;
  mileage: number;
  transmission: string;
  fuel_type: string;
  declared_condition: DeclaredCondition;

  evaluation: DealerVehicleEvaluation;

  /**
   * Referência de MERCADO, com a data do snapshot. Nunca "valor do veículo" e
   * nunca preço pedido: a solicitação não tem preço, e é justamente isso que a
   * disputa vai descobrir.
   */
  fipe_reference_value: string | null;
  fipe_reference_at: string | null;

  /**
   * O PISO do proprietário — o ÚNICO valor financeiro que o CARD mostra, e a
   * primeira barreira que uma proposta precisa vencer.
   *
   * Nunca derivado: não vem da FIPE, não vem da maior proposta, não é
   * calculado. Vale `null` em solicitação anterior à 4.3.3 — e `null` não é
   * zero: a tela precisa distinguir "sem piso declarado" de "aceita qualquer
   * valor".
   */
  minimum_accepted_price: string | null;

  /** Capa (`sort_order = 0`). `null` quando a solicitação não tem foto. */
  image: string | null;
  city: SaleRequestCity;
  status: "receiving_offers";
  created_at: string;
};

/** O detalhe: o mesmo objeto do feed, mais a galeria e as observações. */
export type DealerSaleOpportunityDetail = DealerSaleOpportunitySummary & {
  images: string[];
  known_issues: string | null;
};

/**
 * Métricas do cabeçalho — só o que tem fonte real.
 *
 * Não existe "margem potencial", "nível de interesse" nem "nv. oportunidade":
 * todos dependeriam de um preço de compra que este produto não tem, e um número
 * inventado no topo da tela é o que faz alguém decidir errado com confiança.
 */
export type DealerSaleOpportunitySummaryStats = {
  total: number;
  new_today: number;
  /**
   * Solicitações abertas da cidade em que ESTA loja já propôs, e em que não.
   *
   * O backend devolve as duas desde a Fase 4.3 (`countCityOffersForAdvertiser`);
   * o tipo é que não as declarava, então a tela não tinha como usá-las sem erro
   * de compilação. Nenhuma mudança de contrato: os campos já vinham na resposta.
   *
   * As duas descrevem a CIDADE inteira, não a página filtrada — juntas formam
   * uma partição, e `with + without` fecha com o total sem filtros.
   */
  with_my_offer: number;
  without_my_offer: number;
};

export type DealerSaleOpportunitySort = "recent" | "oldest" | "year_desc" | "mileage_asc";

export type DealerSaleOpportunityFilters = {
  brand: string | null;
  year_min: string | null;
  year_max: string | null;
  mileage_max: string | null;
  transmission: string | null;
  fuel_type: string | null;
  declared_condition: string | null;
  tire_condition: string | null;
  caution_report_status: string | null;
  auction_history: string | null;
  financing_status: string | null;
};

export const EMPTY_FILTERS: DealerSaleOpportunityFilters = {
  brand: null,
  year_min: null,
  year_max: null,
  mileage_max: null,
  transmission: null,
  fuel_type: null,
  declared_condition: null,
  tire_condition: null,
  caution_report_status: null,
  auction_history: null,
  financing_status: null,
};

export type DealerSaleOpportunityPage = {
  items: DealerSaleOpportunitySummary[];
  next_cursor: string | null;
  limit: number;
  sort: DealerSaleOpportunitySort;
  summary: DealerSaleOpportunitySummaryStats;
};

export class DealerSaleOpportunityError extends Error {
  status: number;
  code: string | null;
  /**
   * O valor líder ATUALIZADO, quando o backend recusa por não superar.
   *
   * Viaja no erro (e não numa segunda request) porque a tela do lojista pode
   * estar exibindo um número já vencido: mandá-lo corrigir sem dizer o novo
   * valor o obrigaria a recarregar para descobrir quanto falta.
   */
  currentHighest: string | null;
  /**
   * As lojas do PRÓPRIO usuário, quando o servidor pede uma escolha.
   *
   * Vem no erro, e não numa segunda request, porque o 409 já sabe a resposta:
   * pedir a lista depois seria uma ida ao servidor para descobrir algo que ele
   * acabou de dizer.
   */
  stores: DealerStoreOption[];

  constructor(
    message: string,
    status: number,
    code: string | null,
    currentHighest: string | null = null,
    stores: DealerStoreOption[] = []
  ) {
    super(message);
    this.name = "DealerSaleOpportunityError";
    this.status = status;
    this.code = code;
    this.currentHighest = currentHighest;
    this.stores = stores;
  }
}

/** Uma loja do usuário, no seletor. */
export type DealerStoreOption = {
  advertiser_id: number;
  name: string | null;
  city: { name: string; state: string };
};

/** O código que o servidor devolve quando há mais de uma loja elegível. */
export const STORE_SELECTION_REQUIRED = "SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED";

type ApiEnvelope = {
  success?: boolean;
  message?: string;
  code?: string;
  details?: {
    code?: string;
    field?: string;
    current_highest_offer?: string;
    stores?: DealerStoreOption[];
  };
};

/**
 * Lê a resposta e transforma erro em `DealerSaleOpportunityError` com `code`
 * estável.
 *
 * O `code` importa: a tela precisa distinguir "sua loja não tem cidade
 * resolvida" (que pede uma ação concreta do lojista) de um filtro inválido ou
 * de uma sessão expirada. Fazer isso por texto da mensagem quebraria na
 * primeira vez que alguém melhorasse a redação.
 */
async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (ApiEnvelope & T) | null;

  if (!response.ok || payload?.success === false) {
    const code = payload?.details?.code ?? payload?.code ?? null;
    const message =
      payload?.message ||
      (response.status === 401
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível carregar os veículos.");
    throw new DealerSaleOpportunityError(
      message,
      response.status,
      code,
      payload?.details?.current_highest_offer ?? null,
      Array.isArray(payload?.details?.stores) ? payload.details.stores : []
    );
  }

  return payload as T;
}

/**
 * Filtros + ordenação + cursor → query string.
 *
 * Valores vazios são OMITIDOS, não enviados como `""`. O backend recusa
 * vocabulário desconhecido com 400 (de propósito: um filtro que não filtra
 * devolveria o feed inteiro sob um cabeçalho que promete o contrário), e um
 * `?brand=` vazio seria exatamente esse caso.
 */
export function buildFeedQuery({
  filters,
  sort,
  cursor,
  advertiserId,
}: {
  filters: DealerSaleOpportunityFilters;
  sort: DealerSaleOpportunitySort;
  cursor?: string | null;
  advertiserId?: number | string | null;
}): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value != null && String(value).trim() !== "") query.set(key, String(value));
  }

  if (sort && sort !== "recent") query.set("sort", sort);
  if (cursor) query.set("cursor", cursor);
  // A loja escolhida acompanha TODA request desta área. Não é autorização — o
  // servidor confronta o valor com as lojas do usuário a cada chamada.
  if (advertiserId != null && String(advertiserId) !== "") {
    query.set("advertiser_id", String(advertiserId));
  }

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function fetchSaleOpportunities(options: {
  filters: DealerSaleOpportunityFilters;
  sort: DealerSaleOpportunitySort;
  cursor?: string | null;
  advertiserId?: number | string | null;
}): Promise<DealerSaleOpportunityPage> {
  const response = await fetch(`${BASE}${buildFeedQuery(options)}`, { cache: "no-store" });
  const page = await readJson<Partial<DealerSaleOpportunityPage>>(response);

  return {
    // Coerção defensiva: a listagem não pode quebrar a tela por causa de um
    // payload inesperado.
    items: Array.isArray(page?.items) ? page.items : [],
    next_cursor: page?.next_cursor ?? null,
    limit: page?.limit ?? 12,
    sort: page?.sort ?? options.sort,
    summary: page?.summary ?? { total: 0, new_today: 0, with_my_offer: 0, without_my_offer: 0 },
  };
}

export async function fetchSaleOpportunity(
  id: string | number,
  advertiserId?: number | string | null
): Promise<DealerSaleOpportunityDetail> {
  const suffix =
    advertiserId != null && String(advertiserId) !== ""
      ? `?advertiser_id=${encodeURIComponent(String(advertiserId))}`
      : "";
  const response = await fetch(`${BASE}/${id}${suffix}`, { cache: "no-store" });
  const payload = await readJson<{ sale_opportunity: DealerSaleOpportunityDetail }>(response);
  return payload.sale_opportunity;
}

// ============================================================================
// APRESENTAÇÃO
// ============================================================================

export const TRANSMISSION_LABEL: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  cvt: "CVT",
};

export const FUEL_LABEL: Record<string, string> = {
  flex: "Flex",
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
};

export const DECLARED_CONDITION_LABEL: Record<DeclaredCondition, string> = {
  excelente: "Excelente",
  bom: "Bom",
  regular: "Regular",
  precisa_reparos: "Precisa de reparos",
};

export const SORT_OPTIONS: ReadonlyArray<{ value: DealerSaleOpportunitySort; label: string }> = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "year_desc", label: "Ano mais novo" },
  { value: "mileage_asc", label: "Menor quilometragem" },
];

/** "Volkswagen T-Cross 2020" — só o veículo, nunca quem vende. */
export function describeVehicle(item: {
  brand: string;
  model: string;
  year: number;
}): string {
  return [item.brand, item.model, item.year].filter(Boolean).join(" ").trim();
}

export function formatMileage(value: number): string {
  return `${value.toLocaleString("pt-BR")} km`;
}

export function formatCity(city: SaleRequestCity | null | undefined): string {
  if (!city?.name) return "";
  return city.state ? `${city.name} - ${city.state}` : city.name;
}

/**
 * "Referência FIPE: R$ 92.000 (ago/2026)".
 *
 * A data faz parte do rótulo, e não é decoração: a tabela FIPE muda todo mês, e
 * um valor sem época é pior do que valor nenhum para quem vai fazer proposta.
 * `null` quando o snapshot não resolveu — nunca um número inventado.
 */
export function formatFipeReference(
  value: string | null,
  at: string | null
): string | null {
  const money = formatMoneyValue(value);
  if (!money) return null;
  if (!at) return money;

  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return money;

  // `timeZone: "UTC"` NÃO é detalhe. O snapshot é gravado como TIMESTAMPTZ e a
  // referência costuma cair na virada do mês (`2026-08-01T00:00:00Z`).
  // Formatado no fuso de Brasília (UTC-3), esse instante é 31/07 às 21h — e a
  // tela mostraria "jul/2026" para uma referência de AGOSTO, envelhecendo a
  // âncora de mercado em um mês inteiro aos olhos de quem vai propor.
  const month = date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${money} (${month.replace(".", "")})`;
}

/**
 * "há 2 dias" — tempo desde a publicação.
 *
 * É uma métrica REAL derivada de `created_at`, e é a única "temperatura" que a
 * tela mostra. Nada de "Urgente" ou "Bom potencial": não existe algoritmo por
 * trás desses rótulos, e inventá-los faria o lojista priorizar por um sinal que
 * o sistema não tem.
 */
export function formatPublishedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffHours < 1) return "há menos de 1 hora";
  if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;

  const diffMonths = Math.floor(diffDays / 30);
  return `há ${diffMonths} ${diffMonths === 1 ? "mês" : "meses"}`;
}

/** Quantos filtros estão ativos — alimenta o contador do botão no mobile. */
export function countActiveFilters(filters: DealerSaleOpportunityFilters): number {
  return Object.values(filters).filter((value) => value != null && String(value).trim() !== "")
    .length;
}

// ============================================================================
// PROPOSTAS
// ============================================================================

/**
 * O estado da disputa que acompanha toda oportunidade.
 *
 * `current_highest_offer` é um VALOR e nada mais. Não existe — e não deve passar
 * a existir — nenhum campo de identidade ao lado dele: quem lidera é privado,
 * quanto se lidera não é. Essa é a regra do produto, e o tipo é o lugar onde ela
 * fica visível para quem for mexer aqui depois.
 */
export type DealerOfferState = {
  current_highest_offer: string | null;
  my_offer: string | null;
  is_leading: boolean;
  offers_count: number;
};

export type DealerSaleOffer = {
  id: number | string;
  amount: string;
  note: string | null;
  created_at: string;
};

export type DealerOfferResult = DealerOfferState & {
  offer: DealerSaleOffer;
};

/**
 * Envia uma proposta.
 *
 * `amount` viaja em REAIS com duas casas ("52000.00"), que é o que o banco
 * guarda. A conversão de centavos (o que o campo digita) para reais acontece
 * aqui, num lugar só.
 *
 * O corpo NÃO carrega loja nem usuário: os dois são resolvidos no servidor a
 * partir da sessão. Mandá-los daqui não mudaria nada — não existe caminho de
 * leitura para eles no backend — mas sugeriria que o cliente tem alguma
 * autoridade sobre quem propõe.
 */
export async function submitSaleOffer(
  saleRequestId: string | number,
  input: { amount: string; note?: string | null },
  advertiserId?: number | string | null
): Promise<DealerOfferResult> {
  const suffix =
    advertiserId != null && String(advertiserId) !== ""
      ? `?advertiser_id=${encodeURIComponent(String(advertiserId))}`
      : "";
  const response = await fetch(`${BASE}/${saleRequestId}/offers${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      ...(input.note ? { note: input.note } : {}),
    }),
  });

  return readJson<DealerOfferResult>(response);
}

/**
 * Erro de proposta recusada por não superar a líder — carrega o valor
 * atualizado.
 *
 * O backend devolve `details.current_highest_offer` junto do 409 exatamente para
 * que a tela possa dizer quanto falta sem mandar o lojista recarregar. Este
 * helper extrai o valor sem que a tela precise conhecer o formato do envelope.
 */
export function readRejectedHighest(error: unknown): string | null {
  if (!(error instanceof DealerSaleOpportunityError)) return null;
  return error.currentHighest;
}

/** Dígitos (centavos) → "52000.00" para o payload. `null` quando vazio. */
export function offerDigitsToDecimal(digits: string): string | null {
  const clean = String(digits ?? "").replace(/\D/g, "");
  if (clean === "") return null;
  return (Number(clean) / 100).toFixed(2);
}


/**
 * Distância para a FIPE — e NUNCA "margem" ou "lucro".
 *
 * O rótulo importa mais que a conta. Preparação, impostos, garantia, tempo de
 * pátio e o preço real de revenda não estão calculados em lugar nenhum deste
 * sistema; chamar esta diferença de margem daria ao lojista um número de
 * rentabilidade que ninguém computou.
 *
 * `null` quando a FIPE não resolveu ou não há proposta — sem os dois lados não
 * existe distância, e exibir a FIPE sozinha como se fosse a diferença seria pior
 * do que não exibir nada.
 */
export function fipeDistance(
  fipeValue: string | null,
  offerValue: string | null
): { amount: string; belowFipe: boolean } | null {
  if (!fipeValue || !offerValue) return null;

  const fipe = Number(fipeValue);
  const offer = Number(offerValue);
  if (!Number.isFinite(fipe) || !Number.isFinite(offer)) return null;

  const diff = fipe - offer;
  return { amount: Math.abs(diff).toFixed(2), belowFipe: diff >= 0 };
}
