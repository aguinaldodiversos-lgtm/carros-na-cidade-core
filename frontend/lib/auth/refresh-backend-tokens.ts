import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export type RefreshedTokens = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Rotaciona refresh no backend (POST /api/auth/refresh).
 */
export async function refreshBackendTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  const url = resolveBackendApiUrl("/api/auth/refresh");
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
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
  }
}
