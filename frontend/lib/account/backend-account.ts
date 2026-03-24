import type { DashboardPayload } from "@/lib/dashboard-types";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import type { SubscriptionPlan } from "@/services/planStore";
import type { SessionData } from "@/services/sessionService";

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

async function fetchBackendJson<T>(path: string, init: FetchInit = {}): Promise<T> {
  const url = resolveBackendApiUrl(path);
  if (!url) {
    throw new Error("Backend API URL nao configurada.");
  }

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: init.cache ?? "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Falha na comunicacao com o backend.");
  }

  return payload;
}

export async function fetchPlans(options: { type?: "CPF" | "CNPJ"; activeOnly?: boolean } = {}) {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.activeOnly !== undefined) query.set("active", String(options.activeOnly));

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
  return fetchBackendJson<OwnedAdResponse>(`/api/account/ads/${encodeURIComponent(adId)}`, {
    accessToken: session.accessToken,
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
    accessToken: session.accessToken,
    body: {},
  });
}

export async function patchOwnedAdStatus(session: SessionData, adId: string, action: "pause" | "activate") {
  return fetchBackendJson<{ ad: OwnedAdResponse["ad"] }>(`/api/account/ads/${encodeURIComponent(adId)}/status`, {
    method: "PATCH",
    accessToken: session.accessToken,
    body: { action },
  });
}

export async function deleteOwnedAd(session: SessionData, adId: string) {
  return fetchBackendJson<{ ok: true }>(`/api/account/ads/${encodeURIComponent(adId)}`, {
    method: "DELETE",
    accessToken: session.accessToken,
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
  return fetchBackendJson<PaymentCheckoutResponse>("/api/payments/subscription", {
    method: "POST",
    accessToken: session.accessToken,
    body,
  });
}

export async function forwardPaymentWebhookToBackend(rawBody: string, headers: Record<string, string>) {
  const url = resolveBackendApiUrl("/api/payments/webhook");
  if (!url) {
    throw new Error("Backend API URL nao configurada.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": headers["content-type"] || "application/json",
      ...(headers["x-signature"] ? { "x-signature": headers["x-signature"] } : {}),
      ...(headers["x-request-id"] ? { "x-request-id": headers["x-request-id"] } : {}),
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
