import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchDashboard } from "@/lib/account/backend-account";
import type { DashboardPayload } from "@/lib/dashboard-types";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
  type SessionData,
} from "@/services/sessionService";

export function getLoginRedirect(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/** Sessão obrigatória para área /dashboard (apenas CPF). */
export async function requirePfDashboardSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.accessToken) {
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
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.accessToken) {
    redirect(getLoginRedirect("/dashboard-loja"));
  }
  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }
  return session;
}

export async function loadDashboardPayload(
  session: SessionData
): Promise<DashboardPayload | null> {
  try {
    return await fetchDashboard(session);
  } catch (error) {
    console.error("[dashboard] fetchDashboard failed:", error);
    return null;
  }
}
