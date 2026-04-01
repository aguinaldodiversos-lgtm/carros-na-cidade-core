"use client";

import { useEffect, useState } from "react";
import AccountDashboardView, {
  type AccountDashboardViewMode,
} from "@/components/account/AccountDashboardView";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
import type { DashboardPayload } from "@/lib/dashboard-types";

type DashboardClientRecoveryProps = {
  variant: "pf" | "lojista";
  mode?: AccountDashboardViewMode;
};

/**
 * Quando o SSR não consegue montar o painel (rede, timeout, instabilidade da API),
 * tenta uma vez via BFF no browser (`GET /api/dashboard/me`) — mesmo contrato do refresh do painel.
 */
export function DashboardClientRecovery({ variant, mode = "home" }: DashboardClientRecoveryProps) {
  const [phase, setPhase] = useState<"loading" | "ok" | "fail">("loading");
  const [data, setData] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result = await fetchDashboardPayloadClient();
      if (cancelled) return;
      if (!result.ok) {
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;
        result = await fetchDashboardPayloadClient();
      }
      if (cancelled) return;
      if (result.ok) {
        setData(result.payload);
        setPhase("ok");
        return;
      }
      setPhase("fail");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return (
      <div
        className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-slate-600">Carregando seu painel…</p>
        <p className="mt-2 text-xs text-slate-500">Sincronizando com a conta e os anúncios.</p>
      </div>
    );
  }

  if (phase === "ok" && data) {
    return <AccountDashboardView initialData={data} variant={variant} mode={mode} />;
  }

  return <DashboardLoadError />;
}
