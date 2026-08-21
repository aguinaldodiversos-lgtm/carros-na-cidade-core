// Cliente e tipos de "Venda seu carro para lojas" (Produto 2, Fase 4.1).
//
// ESPELHO de src/modules/sale-requests/sale-requests.constants.js — manter em
// sincronia. Os limites duplicados aqui NÃO são a autoridade: existem para dar
// resposta imediata no formulário. O backend revalida tudo, e é ele que decide.
//
// Um número divergente entre os dois lados produz o pior tipo de defeito de
// formulário: o botão habilita, a pessoa envia, e o servidor recusa com uma
// mensagem que a tela não sabia prever.

export type SaleRequestStatus = "receiving_offers" | "cancelled";

export type DeclaredCondition = "excelente" | "bom" | "regular" | "precisa_reparos";

export const DECLARED_CONDITION_OPTIONS: ReadonlyArray<{
  value: DeclaredCondition;
  label: string;
  hint: string;
}> = [
  { value: "excelente", label: "Excelente", hint: "Sem reparos conhecidos" },
  { value: "bom", label: "Bom", hint: "Pequenos detalhes de uso" },
  { value: "regular", label: "Regular", hint: "Possui alguns reparos" },
  { value: "precisa_reparos", label: "Precisa de reparos", hint: "Há reparos relevantes" },
];

export const SALE_REQUEST_PHOTOS = { MIN: 4, MAX: 12 } as const;

export const SALE_REQUEST_LIMITS = {
  KNOWN_ISSUES_MAX: 1000,
  YEAR_MIN: 1950,
  MILEAGE_MAX: 2_000_000,
} as const;

export const SALE_REQUEST_ACTIVE_LIMIT = 3;

/** Teto de ano aceito: o próximo ano civil. Espelha `maxModelYear()`. */
export function maxModelYear(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

/**
 * Orientação do bloco de fotos.
 *
 * COMERCIAL, e só. A tela não pede, não sugere e não chama atenção para
 * documento, fachada, pessoa ou qualquer dado pessoal: mencionar esses itens —
 * ainda que para desaconselhá-los — coloca dado sensível no centro da
 * experiência, que é exatamente o oposto do que o produto quer.
 *
 * O foco é o veículo. Se uma foto acabar mostrando algo além dele, isto NÃO é
 * bloqueado nesta etapa; simplesmente não é assunto da interface.
 */
export const PHOTO_GUIDANCE_NOTICE =
  "Adicione fotos claras do veículo para ajudar os lojistas na avaliação inicial.";

/**
 * Orientação do campo "Problemas conhecidos".
 *
 * Mesma disciplina de `PHOTO_GUIDANCE_NOTICE`: fala do VEÍCULO e nada mais.
 *
 * A versão anterior pedia para não incluir telefone, endereço, placa ou dados
 * pessoais. A intenção era protetiva, mas o efeito era o oposto do desejado —
 * listar esses itens num campo de texto livre ensina a pessoa a pensar neles
 * justamente onde ela vai escrever. Quem não tinha cogitado passar o telefone
 * acabava de ser lembrado de que existe um telefone a passar.
 *
 * Se alguém escrever espontaneamente um dado desses, o envio NÃO é bloqueado.
 * Não há filtro, regex, sanitização nem moderação: a plataforma apenas deixa de
 * incentivar e de destacar.
 */
export const ISSUES_GUIDANCE_NOTICE =
  "Descreva o estado do veículo e eventuais avarias, se houver.";

// ────────────────────────────────────────────────────────────────────────────
// FICHA DE AVALIAÇÃO — VOCABULÁRIOS
// ────────────────────────────────────────────────────────────────────────────
// Tipos FECHADOS, espelhando os vocabulários de `sale-requests.constants.js`.
// Nenhum `string` solto e nenhum `any`: o compilador é o que garante que a tela
// nunca envie um valor que o backend vai recusar em runtime.
//
// Cada lista de opções carrega o `hint` que aparece embaixo do rótulo. O texto
// fala do que o PROPRIETÁRIO conhece — "sem problemas conhecidos", "detalhes
// conhecidos" — e nunca afirma estado técnico do veículo. A ficha é uma
// declaração de quem vende, não um laudo emitido pela plataforma.

export type YesNoUnknown = "yes" | "no" | "unknown";

export type TireCondition =
  | "new"
  | "good"
  | "half_life"
  | "replace_soon"
  | "replace_now"
  | "unknown";

export type IpvaStatus = "paid" | "installments" | "open" | "unknown";

export type LicensingStatus = "ok" | "pending" | "unknown";

export type CautionReportStatus =
  | "not_available"
  | "approved"
  | "approved_with_notes"
  | "rejected"
  | "unknown";

/** Resultado do laudo, quando ele EXISTE. Subconjunto de `CautionReportStatus`. */
export type CautionReportResult = "approved" | "approved_with_notes" | "rejected";

export type MechanicalCondition = "ok" | "issue" | "unknown";

export type BodyPaintStatus = "issues" | "none" | "unknown";

export type BodyPaintIssue =
  | "scratches"
  | "dents"
  | "worn_paint"
  | "repainted_parts"
  | "collision_repair";

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export const YES_NO_UNKNOWN_OPTIONS: ReadonlyArray<ChoiceOption<YesNoUnknown>> = [
  { value: "yes", label: "Sim" },
  { value: "no", label: "Não" },
  { value: "unknown", label: "Não sei informar" },
];

export const TIRE_CONDITION_OPTIONS: ReadonlyArray<ChoiceOption<TireCondition>> = [
  { value: "new", label: "Novos / excelente estado" },
  { value: "good", label: "Bons" },
  { value: "half_life", label: "Meia-vida" },
  { value: "replace_soon", label: "Precisam ser trocados em breve" },
  { value: "replace_now", label: "Precisam ser trocados" },
  { value: "unknown", label: "Não sei avaliar" },
];

export const IPVA_STATUS_OPTIONS: ReadonlyArray<ChoiceOption<IpvaStatus>> = [
  { value: "paid", label: "Quitado" },
  { value: "installments", label: "Parcelado" },
  { value: "open", label: "Em aberto" },
  { value: "unknown", label: "Não sei informar" },
];

export const LICENSING_STATUS_OPTIONS: ReadonlyArray<ChoiceOption<LicensingStatus>> = [
  { value: "ok", label: "Em dia" },
  { value: "pending", label: "Pendente" },
  { value: "unknown", label: "Não sei informar" },
];

export const CAUTION_REPORT_RESULT_OPTIONS: ReadonlyArray<ChoiceOption<CautionReportResult>> = [
  { value: "approved", label: "Aprovado" },
  { value: "approved_with_notes", label: "Aprovado com apontamentos" },
  { value: "rejected", label: "Reprovado" },
];

export const MECHANICAL_CONDITION_OPTIONS: ReadonlyArray<ChoiceOption<MechanicalCondition>> = [
  { value: "ok", label: "Sem problemas conhecidos" },
  { value: "issue", label: "Possui problema" },
  { value: "unknown", label: "Não sei avaliar" },
];

export const BODY_PAINT_STATUS_OPTIONS: ReadonlyArray<ChoiceOption<BodyPaintStatus>> = [
  { value: "issues", label: "Possui detalhes" },
  { value: "none", label: "Nenhum detalhe conhecido" },
  { value: "unknown", label: "Não sei informar" },
];

export const BODY_PAINT_ISSUE_OPTIONS: ReadonlyArray<ChoiceOption<BodyPaintIssue>> = [
  { value: "scratches", label: "Riscos" },
  { value: "dents", label: "Amassados" },
  { value: "worn_paint", label: "Pintura desgastada" },
  { value: "repainted_parts", label: "Peças repintadas" },
  { value: "collision_repair", label: "Reparo de colisão" },
];

export const EVALUATION_LIMITS = {
  MECHANICAL_NOTES_MAX: 500,
  BODY_PAINT_NOTES_MAX: 500,
} as const;

/** Rótulo de leitura de qualquer opção, ou `null` quando o valor é nulo. */
function labelFrom<T extends string>(
  options: ReadonlyArray<ChoiceOption<T>>,
  value: T | null | undefined
): string | null {
  if (!value) return null;
  return options.find((item) => item.value === value)?.label ?? null;
}

export const readTireCondition = (v: TireCondition | null) => labelFrom(TIRE_CONDITION_OPTIONS, v);
export const readYesNoUnknown = (v: YesNoUnknown | null) => labelFrom(YES_NO_UNKNOWN_OPTIONS, v);
export const readIpvaStatus = (v: IpvaStatus | null) => labelFrom(IPVA_STATUS_OPTIONS, v);
export const readLicensingStatus = (v: LicensingStatus | null) =>
  labelFrom(LICENSING_STATUS_OPTIONS, v);
export const readMechanicalCondition = (v: MechanicalCondition | null) =>
  labelFrom(MECHANICAL_CONDITION_OPTIONS, v);
export const readBodyPaintStatus = (v: BodyPaintStatus | null) =>
  labelFrom(BODY_PAINT_STATUS_OPTIONS, v);
export const readBodyPaintIssue = (v: BodyPaintIssue) => labelFrom(BODY_PAINT_ISSUE_OPTIONS, v);

/**
 * Laudo cautelar: UM valor persistido, DUAS perguntas na tela.
 *
 * A leitura precisa desfazer a junção — "não possui" e "aprovado" moram na
 * mesma coluna, e o resumo mostra coisas diferentes para cada um.
 */
export const CAUTION_REPORT_LABEL: Record<CautionReportStatus, string> = {
  not_available: "Não possui",
  approved: "Aprovado",
  approved_with_notes: "Aprovado com apontamentos",
  rejected: "Reprovado",
  unknown: "Não sei informar",
};

export const readCautionReport = (v: CautionReportStatus | null) =>
  v ? CAUTION_REPORT_LABEL[v] : null;

/**
 * Texto que substitui QUALQUER valor ausente na leitura.
 *
 * Uma solicitação publicada antes desta ficha existir tem NULL em todas as
 * colunas novas, e NULL quer dizer "não foi perguntado". Mostrar "Não" no lugar
 * transformaria silêncio em declaração do proprietário — e é sobre essa
 * declaração que um lojista faria uma oferta.
 */
export const NOT_INFORMED = "Não informado";

// ────────────────────────────────────────────────────────────────────────────
// DINHEIRO
// ────────────────────────────────────────────────────────────────────────────
// O campo guarda DÍGITOS (centavos) e nada mais. Exibe em português, envia em
// decimal com ponto.
//
// Guardar o texto formatado no estado seria mais simples de escrever e errado
// de manter: "1.500" é mil e quinhentos aqui e um e meio no backend, e a
// conversão teria de adivinhar. Com centavos não há o que adivinhar em ponto
// nenhum do caminho.

/** Só os dígitos, limitados para caber em NUMERIC(14,2) com folga. */
export function moneyDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Dígitos (centavos) → "R$ 18.500,00". Vazio quando não há dígito. */
export function formatMoneyInput(digits: string): string {
  const clean = moneyDigits(digits);
  if (clean === "") return "";
  return (Number(clean) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Dígitos (centavos) → "18500.00" para o payload. `null` quando vazio. */
export function moneyToDecimal(digits: string): string | null {
  const clean = moneyDigits(digits);
  if (clean === "") return null;
  return (Number(clean) / 100).toFixed(2);
}

/** Decimal do backend ("18500.00") → "R$ 18.500,00". `null` quando ausente. */
export function formatMoneyValue(value: string | null): string | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const STATUS_LABEL: Record<SaleRequestStatus, string> = {
  receiving_offers: "Recebendo ofertas",
  cancelled: "Cancelada",
};

export type SaleRequestCity = { name: string; state: string; slug: string };

export type SaleRequest = {
  id: number | string;
  brand: string;
  brand_slug: string;
  model: string;
  model_slug: string;
  fipe_model_description: string;
  fipe_code: string | null;
  fipe_reference_value: string | null;
  fipe_reference_at: string | null;
  /**
   * O PISO declarado na publicação (4.3.3). Obrigatório para publicar; 
   * apenas em solicitação anterior à regra — e  não é zero.
   */
  minimum_accepted_price: string | null;
  year: number;
  mileage: number;
  transmission: string;
  fuel_type: string;
  declared_condition: DeclaredCondition;
  known_issues: string | null;

  // ──────────────────────────────────────────────────────────────────────────
  // FICHA DE AVALIAÇÃO
  // ──────────────────────────────────────────────────────────────────────────
  // TODOS nullable, e isso NÃO é frouxidão de tipo: uma solicitação publicada
  // antes desta ficha existir tem NULL aqui. O `| null` obriga cada tela a
  // decidir o que mostrar no lugar — e o que ela deve mostrar é "Não
  // informado", nunca um valor inventado.
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

  status: SaleRequestStatus;
  images: string[];
  city: SaleRequestCity;
  created_at: string;
  updated_at: string;
};

export type SaleRequestListResponse = {
  sale_requests: SaleRequest[];
  next_cursor: string | null;
  limit: number;
};

export type UploadedPhoto = { storage_key: string; url: string };

/** Payload de criação. NÃO existe campo de placa — nem aqui, nem no servidor. */
export type CreateSaleRequestInput = {
  city_id: number;
  brand: string;
  fipe_model_description: string;
  year: string;
  mileage: string;
  transmission: string;
  fuel_type: string;
  declared_condition: DeclaredCondition;
  known_issues?: string | null;

  // Ficha de avaliação. Obrigatórios no envio — o backend recusa a solicitação
  // nova sem eles. Os valores condicionais viajam como `null` quando a resposta
  // que os justifica não foi dada.
  tire_condition: TireCondition;

  financing_status: YesNoUnknown;
  financing_balance?: string | null;
  fines_status: YesNoUnknown;
  fines_amount?: string | null;
  ipva_status: IpvaStatus;
  ipva_amount_due?: string | null;
  licensing_status: LicensingStatus;

  caution_report_status: CautionReportStatus;
  auction_history: YesNoUnknown;
  collision_history: YesNoUnknown;

  engine_condition: MechanicalCondition;
  engine_notes?: string | null;
  gearbox_condition: MechanicalCondition;
  gearbox_notes?: string | null;
  suspension_condition: MechanicalCondition;
  suspension_notes?: string | null;

  body_paint_status: BodyPaintStatus;
  body_paint_issues: BodyPaintIssue[];
  body_paint_notes?: string | null;

  images: string[];

  /**
   * O PISO do proprietário, em decimal ("62500.00").
   *
   * Obrigatório — e obrigatório de verdade, não `?`: o servidor recusa a
   * publicação sem ele, e um campo opcional no tipo deixaria a tela compilar
   * enquanto manda um corpo que a API rejeita.
   *
   * A faixa recomendada (FIPE − 15%) NÃO é enviada: ela é orientação de tela, e
   * o servidor não a valida.
   */
  minimum_accepted_price: string;

  /**
   * Códigos FIPE. O servidor os usa para COTAR o valor; ele nunca aceita um
   * valor pronto do cliente.
   */
  fipe_brand_code?: string;
  fipe_model_code?: string;
  fipe_year_code?: string;
};

export class SaleRequestError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "SaleRequestError";
    this.status = status;
    this.code = code;
  }
}

type ApiEnvelope = {
  success?: boolean;
  message?: string;
  error?: unknown;
  code?: string;
  details?: { code?: string };
};

/**
 * Lê a resposta e transforma erro em `SaleRequestError` com `code` estável.
 *
 * O `code` importa: a tela precisa distinguir "atingiu o limite de 3" de um erro
 * de campo qualquer, e fazer isso por texto da mensagem quebraria na primeira
 * vez que alguém melhorasse a redação.
 */
async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (ApiEnvelope & T) | null;

  if (!response.ok || payload?.success === false) {
    const code = payload?.details?.code ?? payload?.code ?? null;
    const message =
      payload?.message ||
      (response.status === 401
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível concluir a operação.");
    throw new SaleRequestError(message, response.status, code);
  }

  return payload as T;
}

export async function listSaleRequests(params: { cursor?: string | null } = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);

  const response = await fetch(`/api/account/sale-requests${query.size ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  return readJson<SaleRequestListResponse>(response);
}

export async function getSaleRequest(id: string | number) {
  const response = await fetch(`/api/account/sale-requests/${id}`, { cache: "no-store" });
  return readJson<{ sale_request: SaleRequest }>(response);
}

export async function createSaleRequest(input: CreateSaleRequestInput) {
  const response = await fetch("/api/account/sale-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<{ sale_request: SaleRequest }>(response);
}

export async function cancelSaleRequest(id: string | number) {
  const response = await fetch(`/api/account/sale-requests/${id}/cancel`, { method: "POST" });
  return readJson<{ sale_request: SaleRequest; changed: boolean }>(response);
}

/**
 * Envia as fotos e devolve as CHAVES de storage.
 *
 * O que volta e é submetido depois é a `storage_key`, nunca a URL: a URL serve
 * só para a pré-visualização. Se o formulário mandasse a URL, o servidor teria
 * de fazer o caminho inverso (URL → chave) para validar a posse — e essa
 * conversão é exatamente onde um prefixo forjado passaria despercebido.
 */
export async function uploadSaleRequestPhotos(files: File[]): Promise<UploadedPhoto[]> {
  const form = new FormData();
  for (const file of files) form.append("photos", file);

  const response = await fetch("/api/account/sale-requests/photos", {
    method: "POST",
    body: form,
  });

  const payload = await readJson<{ images: UploadedPhoto[] }>(response);
  return payload.images ?? [];
}

/** Formata o valor FIPE (string decimal do `pg`) em BRL, ou devolve null. */
export function formatFipe(value: string | null): string | null {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatMileage(value: number): string {
  return `${Number(value || 0).toLocaleString("pt-BR")} km`;
}
