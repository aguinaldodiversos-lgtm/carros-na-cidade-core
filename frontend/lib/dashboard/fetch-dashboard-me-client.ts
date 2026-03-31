import type { DashboardPayload } from "@/lib/dashboard-types";

/**
 * BFF do painel (browser): `GET /api/dashboard/me` → backend `GET /api/account/dashboard`.
 * Único módulo para refresh no cliente — evita `fetch` duplicado entre PF/PJ e wizard.
 */
export type FetchDashboardPayloadResult =
  | { ok: true; status: number; payload: DashboardPayload }
  | { ok: false; status: number };

export async function fetchDashboardPayloadClient(): Promise<FetchDashboardPayloadResult> {
  const res = await fetch("/api/dashboard/me", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const payload = (await res.json()) as DashboardPayload;
  return { ok: true, status: res.status, payload };
}
