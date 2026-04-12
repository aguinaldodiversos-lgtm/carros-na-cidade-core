"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AccountDashboardView, {
  type AccountDashboardViewMode,
} from "@/components/account/AccountDashboardView";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
import type { DashboardPayload } from "@/lib/dashboard-types";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type DashboardClientRecoveryProps = {
  variant: "pf" | "lojista";
  mode?: AccountDashboardViewMode;
};

const RETRY_DELAYS_MS = [800, 2000];

/**
 * Quando o SSR não consegue montar o painel (rede, timeout, instabilidade da API),
 * tenta via BFF no browser (`GET /api/dashboard/me`) com backoff exponencial.
 * Em caso de 401 (sessão expirada / refresh inválido) redireciona para login
 * imediatamente em vez de mostrar erro genérico.
 */
export function DashboardClientRecovery({ variant, mode = "home" }: DashboardClientRecoveryProps) {
  const [phase, setPhase] = useState<"loading" | "ok" | "fail">("loading");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const pathname = usePathname() ?? "/dashboard";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result = await fetchDashboardPayloadClient();
      if (cancelled) return;

      for (const delay of RETRY_DELAYS_MS) {
        if (result.ok) break;
        // 401 means the session is definitively expired — no point retrying.
        if (result.status === 401) {
          clearClientAuthArtifacts();
          window.location.assign(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        result = await fetchDashboardPayloadClient();
        if (cancelled) return;
      }

      if (result.ok) {
        setData(result.payload);
        setPhase("ok");
        return;
      }
      // Final attempt returned non-401 error (5xx / network) — show manual error UI.
      if (result.status === 401) {
        clearClientAuthArtifacts();
        window.location.assign(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setPhase("fail");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
