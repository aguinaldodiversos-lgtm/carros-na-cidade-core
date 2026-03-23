import { cookies } from "next/headers";
import type { DashboardPayload } from "@/lib/dashboard-types";
import type { SubscriptionPlan } from "@/services/planStore";
import type { SessionData } from "@/services/sessionService";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

type FetchInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  accessToken?: string;
  cache?: RequestCache;
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

type BackendRefreshResponse = {
  accessToken?: string;
  access_token?: string;
  token?: string;
  refreshToken?: string;
  refresh_token?: string;
  error?: string;
};

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getApiBaseUrl() {
  const api =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  return api ? stripTrailingSlash(api) : "";
}

/**
 * Tenta silenciosamente renovar o accessToken usando o refreshToken armazenado
 * no cookie de sessão. Se bem-sucedido, re-emite o cookie e retorna o novo
 * accessToken. Retorna null se falhar ou se não houver refreshToken.
 */
async function tryRefreshAccessToken(
  currentSession: SessionData
): Promise<string | null> {
  const { refreshToken } = currentSession;
  if (!refreshToken) return null;

  const apiBase = getApiBaseUrl();
  if (!apiBase) return null;

  try {
    const response = await fetch(`${apiBase}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response
      .json()
      .catch(() => ({}))) as BackendRefreshResponse;

    const newAccessToken =
      data.accessToken?.trim() ||
      data.access_token?.trim() ||
      data.token?.trim() ||
      "";

    if (!newAccessToken) return null;

    const newRefreshToken =
      data.refreshToken?.trim() ||
      data.refresh_token?.trim() ||
      refreshToken;

    // Re-emite o cookie de sessão com o novo accessToken
    try {
      const cookieStore = cookies();
      const updatedToken = createSessionToken({
        id: currentSession.id,
        name: currentSession.name,
        email: currentSession.email,
        type: currentSession.type,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
      cookieStore.set(
        AUTH_COOKIE_NAME,
        updatedToken,
        getSessionCookieOptions()
      );
    } catch {
      // cookies() pode não estar disponível em todos os contextos — prossegue sem re-emitir
    }

    return newAccessToken;
  } catch {
    return null;
  }
}

/**
 * Lê o cookie de sessão atual e retorna os dados mais recentes (após possível
 * atualização no mesmo request).
 */
function getCurrentSession(): SessionData | null {
  try {
    const cookieStore = cookies();
    const tokenValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    return getSessionDataFromCookieValue(tokenValue);
  } catch {
    return null;
  }
}

async function fetchBackendJson<T>(
  path: string,
  init: FetchInit = {}
): Promise<T> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error("Backend API URL nao configurada.");
  }

  const doFetch = (token?: string) =>
    fetch(`${apiBase}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: init.cache ?? "no-store",
    });

  let response = await doFetch(init.accessToken);

  // Tenta renovar o token silenciosamente em caso de 401
  if (response.status === 401 && init.accessToken) {
    const freshSession = getCurrentSession();
    if (freshSession?.refreshToken) {
      const newAccessToken = await tryRefreshAccessToken(freshSession);
      if (newAccessToken) {
        response = await doFetch(newAccessToken);
      }
    }
  }

  const payload = (await response
    .json()
    .catch(() => ({}))) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || "Falha na comunicacao com o backend."
    );
  }

  return payload;
}

export async function fetchPlans(
  options: { type?: "CPF" | "CNPJ"; activeOnly?: boolean } = {}
) {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.activeOnly !== undefined)
    query.set("active", String(options.activeOnly));

  const payload = await fetchBackendJson<{ plans: SubscriptionPlan[] }>(
    `/api/account/plans${query.toString() ? `?${query.toString()}` : ""}`,
    { cache: "no-store" }
  );

  return payload.plans;
}

export async function fetchDashboard(session: SessionData) {
  return fetchBackendJson<DashboardPayload>("/api/account/dashboard", {
    accessToken: session.accessToken,
  });
}

export async function fetchOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<OwnedAdResponse>(
    `/api/account/ads/${encodeURIComponent(adId)}`,
    {
      accessToken: session.accessToken,
    }
  );
}

export async function fetchPlanEligibility(session: SessionData) {
  return fetchBackendJson<{
    allowed: boolean;
    reason: string;
    suggested_plan_type: "CPF" | "CNPJ" | null;
    suggested_plans: SubscriptionPlan[];
  }>("/api/account/plans/eligibility", {
    method: "POST",
    accessToken: session.accessToken,
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
      accessToken: session.accessToken,
      body: { action },
    }
  );
}

export async function deleteOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<{ ok: true }>(
    `/api/account/ads/${encodeURIComponent(adId)}`,
    {
      method: "DELETE",
      accessToken: session.accessToken,
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
    accessToken: session.accessToken,
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
  return fetchBackendJson<PaymentCheckoutResponse>(
    "/api/payments/subscription",
    {
      method: "POST",
      accessToken: session.accessToken,
      body,
    }
  );
}

export async function forwardPaymentWebhookToBackend(
  rawBody: string,
  headers: Record<string, string>
) {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error("Backend API URL nao configurada.");
  }

  const response = await fetch(`${apiBase}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": headers["content-type"] || "application/json",
      ...(headers["x-signature"]
        ? { "x-signature": headers["x-signature"] }
        : {}),
      ...(headers["x-request-id"]
        ? { "x-request-id": headers["x-request-id"] }
        : {}),
    },
    body: rawBody,
    cache: "no-store",
  });

  const payload = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: payload,
    contentType: response.headers.get("content-type") || "application/json",
  };
}
