import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export type RefreshedTokens = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Timeout explícito do refresh de tokens.
 *
 * Motivo: antes o fetch rodava sem AbortController e herdava o deadline do
 * socket. Em cold start do backend, o refresh podia ficar pendurado até o
 * gateway do frontend (Render/Cloudflare ~100s) matar a conexão — consumindo
 * todo o orçamento de tempo antes de o fetchDashboard sequer começar.
 *
 * 20s cobre cold start de um endpoint leve (refresh lê JWT e emite novos
 * tokens; não faz I/O pesado) e deixa margem para o fetchDashboard seguir.
 */
const REFRESH_TIMEOUT_MS = 20_000;

/**
 * Rotaciona refresh no backend (POST /api/auth/refresh).
 */
export async function refreshBackendTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  const url = resolveBackendApiUrl("/api/auth/refresh");
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      access_token?: string;
      refreshToken?: string;
      refresh_token?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      return null;
    }

    const access = data.accessToken ?? data.access_token;
    const refresh = data.refreshToken ?? data.refresh_token;
    if (!access || !refresh) return null;

    return { accessToken: access, refreshToken: refresh };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
