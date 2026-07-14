import type { DashboardPayload } from "@/lib/dashboard-types";
import { normalizeDashboardPayload } from "@/lib/dashboard/normalize-dashboard-payload";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";
import { getBoostOptions } from "@/services/adService";
import type { SubscriptionPlan } from "@/lib/plans/plan-store";
import type { SessionData } from "@/services/sessionService";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type JsonObject = Record<string, unknown>;

type FetchInit = {
  method?: HttpMethod;
  body?: JsonObject;
  accessToken?: string;
  cache?: RequestCache;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

/**
 * Campos crus do anúncio que a tela de edição pré-preenche.
 * brand/model/year/city/state vêm para exibição read-only (o backend recusa
 * alterá-los após a publicação — ver ads.panel.service STRUCTURAL_FIELDS).
 */
export type OwnedAdEditable = {
  title: string;
  description: string;
  price: number;
  mileage: number;
  brand: string;
  model: string;
  year: number | null;
  city: string;
  city_id: number | null;
  state: string;
  body_type: string;
  fuel_type: string;
  transmission: string;
  below_fipe: boolean;
  slug: string | null;
  images: string[];
  /** Opcionais agrupados por categoria (comfort/drivability/safety). */
  vehicle_options: Record<string, string[]>;
};

type OwnedAdResponse = {
  ad: DashboardPayload["active_ads"][number] & { editable?: OwnedAdEditable };
  boost_options: DashboardPayload["boost_options"];
};

/**
 * Payload aceito pela edição de conteúdo (PUT /api/ads/:id). Apenas campos
 * NÃO estruturais — preço/título/descrição/quilometragem. Fotos são
 * preservadas quando o campo `images` é omitido.
 */
export type UpdateOwnedAdPayload = {
  title?: string;
  price?: number;
  description?: string | null;
  mileage?: number;
  /**
   * Opcionais: lista achatada de keys OU objeto agrupado. O backend
   * (ad-options.catalog) reagrupa, faz allowlist e descarta keys inválidas.
   */
  vehicle_options?: string[] | Record<string, string[]>;
};

type PaymentCheckoutResponse = {
  error?: string;
  init_point?: string;
  mercado_pago_id?: string;
  public_key?: string;
  payment_type?: "one_time" | "recurring";
  context?: "ad_boost";
  plan_id?: string;
  ad_id?: string;
  boost_option_id?: string;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Timeout ampliado para chamadas autenticadas ao backend do painel.
 *
 * Motivo: o backend roda em Render (free tier) e pode levar 20-45s para
 * responder após um período de ociosidade (cold start). 15s é insuficiente
 * e gera AbortError → o BFF mapeia como 502 "network_error" → o usuário
 * logado enxerga "Painel indisponivel ... Codigo: 502".
 *
 * 45s cobre cold start com margem. Se o backend realmente estiver fora,
 * o AbortError continua subindo e a UI exibe estado de erro normalmente.
 */
const DASHBOARD_TIMEOUT_MS = 45_000;

const DASHBOARD_RETRY_DELAY_MS = 1_200;

class BackendApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly url: string;

  constructor(params: {
    message: string;
    status: number;
    url: string;
    code?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "BackendApiError";
    this.status = params.status;
    this.url = params.url;
    this.code = params.code;
    this.details = params.details;
  }
}

function assertAccessToken(session: SessionData | null | undefined): string {
  const token = session?.accessToken?.trim();
  if (!token) {
    throw new Error("Sessão inválida ou token de acesso ausente.");
  }
  return token;
}

function buildUrl(path: string): string {
  const url = resolveInternalBackendApiUrl(path);
  if (!url) {
    throw new Error("Backend API URL nao configurada.");
  }
  return url;
}

function isJsonResponse(contentType: string | null): boolean {
  return !!contentType && contentType.toLowerCase().includes("application/json");
}

async function parseResponseBody<T>(response: Response): Promise<T | ApiErrorPayload | null> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type");

  try {
    if (isJsonResponse(contentType)) {
      return (await response.json()) as T | ApiErrorPayload;
    }

    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text) as T | ApiErrorPayload;
    } catch {
      return { message: text };
    }
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (!payload) return fallback;
  return payload.error || payload.message || fallback;
}

async function fetchBackendJson<T>(path: string, init: FetchInit = {}): Promise<T> {
  const url = buildUrl(path);
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...buildInternalBackendHeaders(),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: init.cache ?? "no-store",
      signal: controller.signal,
    });

    const payload = await parseResponseBody<T>(response);

    if (!response.ok) {
      const errorPayload = (payload ?? null) as ApiErrorPayload | null;
      throw new BackendApiError({
        message: extractErrorMessage(errorPayload, "Falha na comunicacao com o backend."),
        status: response.status,
        url,
        code: errorPayload?.code,
        details: errorPayload?.details,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof BackendApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Tempo limite excedido ao comunicar com o backend: ${path}`);
    }

    throw error instanceof Error
      ? new Error(`Erro ao comunicar com o backend em ${path}: ${error.message}`)
      : new Error(`Erro desconhecido ao comunicar com o backend em ${path}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBackendText(
  path: string,
  init: Omit<FetchInit, "body"> & { body?: string }
): Promise<{
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
}> {
  const url = buildUrl(path);
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: init.method ?? "POST",
      headers: {
        ...buildInternalBackendHeaders(),
        Accept: "*/*",
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body,
      cache: init.cache ?? "no-store",
      signal: controller.signal,
    });

    const payload = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: payload,
      contentType: response.headers.get("content-type") || "text/plain",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Tempo limite excedido ao encaminhar request para ${path}`);
    }

    throw error instanceof Error
      ? new Error(`Erro ao encaminhar request para ${path}: ${error.message}`)
      : new Error(`Erro desconhecido ao encaminhar request para ${path}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPlans(options: { type?: "CPF" | "CNPJ"; activeOnly?: boolean } = {}) {
  const query = new URLSearchParams();

  if (options.type) query.set("type", options.type);
  if (options.activeOnly !== undefined) query.set("active", String(options.activeOnly));

  const suffix = query.toString() ? `?${query.toString()}` : "";

  const payload = await fetchBackendJson<{ plans: SubscriptionPlan[] }>(
    `/api/account/plans${suffix}`,
    {
      cache: "no-store",
    }
  );

  return payload.plans;
}

function buildFallbackDashboardFromSession(session: SessionData): DashboardPayload {
  const isCnpj = session.type === "CNPJ";
  const freeLimit = isCnpj ? 0 : 3;
  return {
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      type: session.type,
      cnpj_verified: false,
    },
    current_plan: null,
    stats: {
      active_ads: 0,
      paused_ads: 0,
      featured_ads: 0,
      total_views: 0,
      free_limit: freeLimit,
      plan_limit: freeLimit,
      available_limit: freeLimit,
      plan_name: "Plano gratuito",
      is_verified_store: false,
    },
    publish_eligibility: {
      allowed: false,
      reason:
        session.type === "pending"
          ? "Complete seu perfil com CPF ou CNPJ para publicar anúncios."
          : "Resposta do servidor em formato inesperado. Atualize a página ou tente novamente.",
    },
    active_ads: [],
    paused_ads: [],
    boost_options: getBoostOptions(),
  };
}

function shouldRetryDashboardError(error: unknown): boolean {
  if (error instanceof BackendApiError) {
    return error.status === 0 || error.status >= 500;
  }
  if (error instanceof Error) {
    return /Tempo limite|fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(
      error.message
    );
  }
  return false;
}

export type FetchDashboardOptions = {
  /**
   * Permite 1 retentativa interna em caso de timeout/5xx/erro de rede.
   * Deve ser usado SOMENTE pelo BFF (`/api/dashboard/me`). No SSR, o retry
   * interno é desligado para não estourar o gateway do frontend (~100s).
   * Recovery do SSR fica a cargo do client component (DashboardClientRecovery).
   */
  allowRetry?: boolean;
  /**
   * IP do visitante real (repassado ao backend via X-Cnc-Client-Ip).
   *
   * Sem isso, o rate limit do backend usa `req.ip` = IP do servidor frontend
   * (Render), fazendo TODOS os usuários do /dashboard compartilharem a mesma
   * quota de 1000 req/15min. Em qualquer pico, todos recebem 429 simultaneamente.
   *
   * SSR e BFF devem preencher esse campo lendo o IP real do request original.
   */
  clientIp?: string;
};

export async function fetchDashboard(session: SessionData, options: FetchDashboardOptions = {}) {
  const token = assertAccessToken(session);
  const allowRetry = options.allowRetry === true;

  const forwardHeaders: Record<string, string> = {};
  if (options.clientIp) {
    forwardHeaders["X-Cnc-Client-Ip"] = options.clientIp;
  }

  let lastError: unknown = null;
  const maxAttempts = allowRetry ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const raw = await fetchBackendJson<unknown>("/api/account/dashboard", {
        accessToken: token,
        timeoutMs: DASHBOARD_TIMEOUT_MS,
        headers: forwardHeaders,
      });
      const normalized = normalizeDashboardPayload(raw);
      if (normalized) return normalized;
      return buildFallbackDashboardFromSession(session);
    } catch (error) {
      lastError = error;
      if (allowRetry && attempt === 0 && shouldRetryDashboardError(error)) {
        await new Promise((resolve) => setTimeout(resolve, DASHBOARD_RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao buscar dashboard");
}

export async function fetchOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<OwnedAdResponse>(`/api/account/ads/${encodeURIComponent(adId)}`, {
    accessToken: assertAccessToken(session),
  });
}

/** Cadastro da loja (tabela `advertisers`) — "Dados da loja". */
export type StoreProfile = {
  name: string;
  email: string;
  whatsapp: string;
  address: string;
  /** Comprador consegue contato? (COALESCE whatsapp/mobile_phone/phone não vazio) */
  has_contact_channel: boolean;
  document: { type: "CPF" | "CNPJ" | null; number: string };
};

export type StoreProfileResponse = { success: boolean; store: StoreProfile };

export type UpdateStoreProfilePayload = {
  name: string;
  email: string;
  whatsapp: string;
  address: string;
};

export async function fetchStoreProfile(session: SessionData) {
  return fetchBackendJson<StoreProfileResponse>("/api/account/store", {
    accessToken: assertAccessToken(session),
  });
}

export async function updateStoreProfile(session: SessionData, payload: UpdateStoreProfilePayload) {
  return fetchBackendJson<StoreProfileResponse>("/api/account/store", {
    method: "PUT",
    accessToken: assertAccessToken(session),
    body: payload,
  });
}

/**
 * Histórico de anúncios do dono: archived / sold / expired.
 * NÃO inclui ativos nem em moderação (esses ficam em /dashboard).
 * Fase 3.5.
 */
export async function fetchOwnedHistoryAds(session: SessionData) {
  return fetchBackendJson<{ ads: DashboardPayload["active_ads"] }>(`/api/account/ads/history`, {
    accessToken: assertAccessToken(session),
  });
}

export async function fetchPlanEligibility(session: SessionData) {
  return fetchBackendJson<{
    allowed: boolean;
    reason: string;
    suggested_plan_type: "CPF" | "CNPJ" | null;
    suggested_plans: SubscriptionPlan[];
  }>("/api/account/plans/eligibility", {
    method: "POST",
    accessToken: assertAccessToken(session),
    body: {},
  });
}

export async function patchOwnedAdStatus(
  session: SessionData,
  adId: string,
  action: "pause" | "activate"
) {
  return fetchBackendJson<{ ad: OwnedAdResponse["ad"] }>(
    `/api/account/ads/${encodeURIComponent(adId)}/status`,
    {
      method: "PATCH",
      accessToken: assertAccessToken(session),
      body: { action },
    }
  );
}

export async function deleteOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<{ ok: true }>(`/api/account/ads/${encodeURIComponent(adId)}`, {
    method: "DELETE",
    accessToken: assertAccessToken(session),
  });
}

/**
 * Edição de conteúdo do anúncio do dono. Proxy para o endpoint canônico
 * `PUT /api/ads/:id` (módulo ads) — NÃO criamos endpoint paralelo. A
 * autorização (ownership PF/CNPJ + status editável) é resolvida no backend
 * via ads.panel.service.updateAd → ad-ownership.assertCanEditAd.
 *
 * Erros do backend (403/404/409/400) sobem como BackendApiError preservando
 * status/code/message para o BFF repassar à UI.
 */
export async function updateOwnedAd(
  session: SessionData,
  adId: string,
  payload: UpdateOwnedAdPayload
) {
  return fetchBackendJson<{ success: boolean; data: OwnedAdResponse["ad"] }>(
    `/api/ads/${encodeURIComponent(adId)}`,
    {
      method: "PUT",
      accessToken: assertAccessToken(session),
      body: payload,
    }
  );
}

export async function createPaymentCheckout(
  session: SessionData,
  body: {
    plan_id?: string;
    ad_id?: string;
    boost_option_id?: string;
    success_url: string;
    failure_url: string;
    pending_url: string;
  }
) {
  return fetchBackendJson<PaymentCheckoutResponse>("/api/payments/create", {
    method: "POST",
    accessToken: assertAccessToken(session),
    body,
  });
}

export async function createSubscriptionCheckout(
  session: SessionData,
  body: {
    plan_id: string;
    success_url: string;
    failure_url: string;
    pending_url: string;
  }
) {
  return fetchBackendJson<PaymentCheckoutResponse>("/api/payments/subscription", {
    method: "POST",
    accessToken: assertAccessToken(session),
    body,
  });
}

export async function forwardPaymentWebhookToBackend(
  rawBody: string,
  headers: Record<string, string>
) {
  return fetchBackendText("/api/payments/webhook", {
    method: "POST",
    body: rawBody,
    headers: {
      "Content-Type": headers["content-type"] || "application/json",
      ...(headers["x-signature"] ? { "x-signature": headers["x-signature"] } : {}),
      ...(headers["x-request-id"] ? { "x-request-id": headers["x-request-id"] } : {}),
    },
    cache: "no-store",
  });
}

export { BackendApiError };
