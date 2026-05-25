import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  resolveInternalBackendApiUrl,
  resolveBackendApiUrl,
} from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";
import {
  getSessionDataFromCookieStore,
  type SessionData,
} from "@/services/sessionService";

/**
 * Cache em memória do par (userId -> role). TTL curto para que mudanças
 * administrativas (promoção/remoção de admin) reflitam em até 30s, sem
 * forçar round-trip ao backend a cada server render ou call do proxy.
 * O cache vive por processo (warm worker do Render); cold start descarta.
 */
type CachedRole = { role: string; expiresAt: number };
const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, CachedRole>();

function readCachedRole(userId: string): string | null {
  const entry = roleCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    roleCache.delete(userId);
    return null;
  }
  return entry.role;
}

function writeCachedRole(userId: string, role: string) {
  roleCache.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
}

export function clearAdminRoleCache(userId?: string) {
  if (userId) {
    roleCache.delete(userId);
  } else {
    roleCache.clear();
  }
}

async function fetchUserRole(accessToken: string): Promise<string | null> {
  const url =
    resolveInternalBackendApiUrl("/api/auth/me") || resolveBackendApiUrl("/api/auth/me");
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...buildInternalBackendHeaders(),
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: { role?: string } };
    const role = json?.user?.role;
    return typeof role === "string" && role.length > 0 ? role : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type AdminAssertion =
  | { ok: true; session: SessionData; role: "admin" }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "backend_unreachable" };

/**
 * Verifica se a sessão recebida pertence a um admin. Usada pelo proxy
 * /api/admin/[...path] e por `requireAdminSession()`.
 */
export async function assertAdminSession(
  session: SessionData | null | undefined
): Promise<AdminAssertion> {
  if (!session?.id || (!session.accessToken && !session.refreshToken)) {
    return { ok: false, reason: "unauthenticated" };
  }

  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok || !ensured.session.accessToken) {
    return { ok: false, reason: "unauthenticated" };
  }

  const cached = readCachedRole(ensured.session.id);
  if (cached) {
    if (cached === "admin") {
      return { ok: true, session: ensured.session, role: "admin" };
    }
    return { ok: false, reason: "forbidden" };
  }

  const role = await fetchUserRole(ensured.session.accessToken);
  if (role == null) {
    return { ok: false, reason: "backend_unreachable" };
  }

  writeCachedRole(ensured.session.id, role);

  if (role !== "admin") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, session: ensured.session, role: "admin" };
}

/**
 * Guarda SSR do layout /admin. Espelha o padrão de
 * `requirePfDashboardSession()` / `requireLojistaDashboardSession()`:
 * - sem sessão → redireciona ao login com `next=/admin`
 * - autenticado sem role admin → redireciona à home pública
 * - backend indisponível → redireciona ao login (fail-closed)
 *
 * Importante: a proteção real do dado vive no backend
 * (`authMiddleware + requireAdmin()`). Este helper apenas evita entregar
 * o shell /admin a quem não tem direito.
 */
export async function requireAdminSession(): Promise<SessionData> {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieStore(cookieStore, headers());
  const result = await assertAdminSession(session);

  if (result.ok) return result.session;

  if (result.reason === "unauthenticated" || result.reason === "backend_unreachable") {
    redirect("/login?next=/admin");
  }
  // forbidden: já está autenticado, mas não é admin.
  redirect("/");
}
