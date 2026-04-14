import type { DashboardPayload } from "@/lib/dashboard-types";

/**
 * BFF do painel (browser): `GET /api/dashboard/me` -> backend `GET /api/account/dashboard`.
 * Modulo unico para recarregar dados do dashboard no cliente.
 */
export type FetchDashboardPayloadResult =
  | { ok: true; status: number; payload: DashboardPayload }
  | {
      ok: false;
      status: number;
      code?: string;
      message?: string;
      upstreamStatus?: number;
    };

type DashboardErrorPayload = {
  error?: string | { code?: string; message?: string; upstreamStatus?: number };
  message?: string;
};

async function parseDashboardError(
  res: Response
): Promise<Omit<Extract<FetchDashboardPayloadResult, { ok: false }>, "ok" | "status">> {
  try {
    const payload = (await res.json()) as DashboardErrorPayload;
    const error = payload.error;
    if (typeof error === "string") {
      return { code: error, message: payload.message ?? error };
    }
    return {
      code: error?.code,
      message: error?.message ?? payload.message,
      upstreamStatus: error?.upstreamStatus,
    };
  } catch {
    return {};
  }
}

export async function fetchDashboardPayloadClient(): Promise<FetchDashboardPayloadResult> {
  try {
    const res = await fetch("/api/dashboard/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      const error = await parseDashboardError(res);
      return { ok: false, status: res.status, ...error };
    }
    const payload = (await res.json()) as DashboardPayload;
    return { ok: true, status: res.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: "network_error",
      message: error instanceof Error ? error.message : "Falha de rede ao carregar dashboard.",
    };
  }
}
