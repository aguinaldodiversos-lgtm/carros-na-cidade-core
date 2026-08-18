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

/** O card do feed. */
export type DealerSaleOpportunitySummary = {
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

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "DealerSaleOpportunityError";
    this.status = status;
    this.code = code;
  }
}

type ApiEnvelope = {
  success?: boolean;
  message?: string;
  code?: string;
  details?: { code?: string; field?: string };
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
    throw new DealerSaleOpportunityError(message, response.status, code);
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
}: {
  filters: DealerSaleOpportunityFilters;
  sort: DealerSaleOpportunitySort;
  cursor?: string | null;
}): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value != null && String(value).trim() !== "") query.set(key, String(value));
  }

  if (sort && sort !== "recent") query.set("sort", sort);
  if (cursor) query.set("cursor", cursor);

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function fetchSaleOpportunities(options: {
  filters: DealerSaleOpportunityFilters;
  sort: DealerSaleOpportunitySort;
  cursor?: string | null;
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
    summary: page?.summary ?? { total: 0, new_today: 0 },
  };
}

export async function fetchSaleOpportunity(
  id: string | number
): Promise<DealerSaleOpportunityDetail> {
  const response = await fetch(`${BASE}/${id}`, { cache: "no-store" });
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
