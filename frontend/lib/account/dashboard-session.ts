import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { fetchDashboard } from "@/lib/account/backend-account";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  AUTH_COOKIE_NAME,
  mergeMiddlewareSessionTokens,
  type SessionData,
} from "@/services/sessionService";

export function getLoginRedirect(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/** Sessão obrigatória para área /dashboard (apenas CPF). */
export async function requirePfDashboardSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = mergeMiddlewareSessionTokens(headers(), cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session || (!session.accessToken && !session.refreshToken)) {
    redirect(getLoginRedirect("/dashboard"));
  }
  if (session.type === "CNPJ") {
    redirect("/dashboard-loja");
  }
  return session;
}

/** Sessão obrigatória para área /dashboard-loja (apenas CNPJ). */
export async function requireLojistaDashboardSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = mergeMiddlewareSessionTokens(headers(), cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session || (!session.accessToken && !session.refreshToken)) {
    redirect(getLoginRedirect("/dashboard-loja"));
  }
  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }
  return session;
}

export async function loadDashboardPayload(session: SessionData): Promise<DashboardPayload | null> {
  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok) {
    if (process.env.DASHBOARD_DEBUG === "1") {
      console.error("[loadDashboardPayload] sessão sem tokens utilizáveis", ensured);
    }
    return null;
  }
  try {
    return await fetchDashboard(ensured.session);
  } catch (error) {
    if (process.env.DASHBOARD_DEBUG === "1") {
      console.error("[loadDashboardPayload] falha ao buscar /api/account/dashboard", error);
    }
    return null;
  }
}
