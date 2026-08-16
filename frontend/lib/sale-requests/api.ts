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
  { value: "excelente", label: "Excelente", hint: "Sem reparos a fazer" },
  { value: "bom", label: "Bom", hint: "Pequenos detalhes de uso" },
  { value: "regular", label: "Regular", hint: "Precisa de alguns reparos" },
  { value: "precisa_reparos", label: "Precisa de reparos", hint: "Reparos relevantes" },
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

export const ISSUES_PRIVACY_NOTICE =
  "Informe problemas conhecidos do veículo, se houver. Não inclua telefone, endereço, placa ou dados pessoais.";

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
  year: number;
  mileage: number;
  transmission: string;
  fuel_type: string;
  declared_condition: DeclaredCondition;
  known_issues: string | null;
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
  images: string[];
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
