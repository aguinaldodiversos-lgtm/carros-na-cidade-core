import type { DashboardPayload } from "@/lib/dashboard-types";
import { normalizeDashboardPayload } from "@/lib/dashboard/normalize-dashboard-payload";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { getBoostOptions } from "@/services/adService";
import type { SubscriptionPlan } from "@/services/planStore";
import type { SessionData } from "@/services/sessionService";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type JsonObject = Record<string, unknown>;

type FetchInit = {
  method?: HttpMethod;
  body?: JsonObject;
  accessToken?: string;
  cache?: RequestCache;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

type OwnedAdResponse = {
  ad: DashboardPayload["active_ads"][number];
  boost_options: DashboardPayload["boost_options"];
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
  const url = resolveBackendApiUrl(path);
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

export async function fetchDashboard(session: SessionData) {
  const raw = await fetchBackendJson<unknown>("/api/account/dashboard", {
    accessToken: assertAccessToken(session),
  });
  const normalized = normalizeDashboardPayload(raw);
  if (normalized) return normalized;
  return buildFallbackDashboardFromSession(session);
}

export async function fetchOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<OwnedAdResponse>(`/api/account/ads/${encodeURIComponent(adId)}`, {
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
