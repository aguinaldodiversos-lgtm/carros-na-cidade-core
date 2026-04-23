import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { fetchDashboard } from "@/lib/account/backend-account";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromCookieStore, type SessionData } from "@/services/sessionService";

/**
 * Lê o IP real do visitante a partir dos headers do SSR.
 * Prioridade: x-vercel-forwarded-for → cf-connecting-ip → x-forwarded-for → x-real-ip.
 * Sem isso, o rate limit do backend usa o IP do servidor Render (compartilhado
 * por todos os usuários) — causa real de 429 coletivo no painel.
 */
function readClientIpFromSSRHeaders(): string | undefined {
  const headersList = headers();
  const vercel = headersList.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = headersList.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const xff = headersList.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headersList.get("x-real-ip");
  if (xri?.trim()) return xri.trim();
  return undefined;
}

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
    const clientIp = readClientIpFromSSRHeaders();
    return await fetchDashboard(ensured.session, { clientIp });
  } catch (error) {
    console.error(
      "[loadDashboardPayload] falha ao buscar dashboard",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
