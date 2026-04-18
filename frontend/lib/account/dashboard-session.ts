import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { fetchDashboard } from "@/lib/account/backend-account";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromCookieStore, type SessionData } from "@/services/sessionService";

export function getLoginRedirect(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/** Sessão autenticada para área /dashboard (PF, conta incompleta ou PF completo). */
export async function requirePfDashboardSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieStore(cookieStore, headers());

  if (!session || (!session.accessToken && !session.refreshToken)) {
    redirect(getLoginRedirect("/dashboard"));
  }
  return session;
}

/** Sessão obrigatória para área /dashboard-loja (apenas CNPJ). */
export async function requireLojistaDashboardSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieStore(cookieStore, headers());

  if (!session || (!session.accessToken && !session.refreshToken)) {
    redirect(getLoginRedirect("/dashboard-loja"));
  }
  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }
  return session;
}

export async function loadDashboardPayload(session: SessionData): Promise<DashboardPayload | null> {
  const ensured = await ensureSessionWithFreshBackendTokens(session, { allowRefresh: false });
  if (!ensured.ok) {
    console.error("[loadDashboardPayload] sessão sem tokens utilizáveis");
    return null;
  }
  try {
    return await fetchDashboard(ensured.session);
  } catch (error) {
    console.error(
      "[loadDashboardPayload] falha ao buscar dashboard",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
