"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type DashboardLoadErrorProps = {
  kind?: "unavailable" | "forbidden";
  status?: number;
};

export function DashboardLoadError({ kind = "unavailable", status }: DashboardLoadErrorProps) {
  const pathname = usePathname() || "/dashboard";
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;
  const [ending, setEnding] = useState(false);
  const isForbidden = kind === "forbidden";

  async function endSessionAndLogin() {
    if (ending) return;
    setEnding(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      clearClientAuthArtifacts();
      window.location.assign(loginHref);
    } catch {
      setEnding(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-4">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {isForbidden ? "Acesso negado" : "Painel indisponivel"}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {isForbidden
            ? "Esta conta nao pode acessar este painel"
            : "Nao foi possivel carregar seu painel agora"}
        </h1>
        <p className="text-sm leading-6 text-slate-600 sm:text-base">
          {isForbidden
            ? "Entre com uma conta autorizada ou volte para a area correta da sua conta."
            : "Nao conseguimos buscar os dados do painel neste momento. Tente novamente em instantes."}
          {status ? ` Codigo: ${status}.` : null}
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {!isForbidden ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0c4fb0]"
            >
              Tentar novamente
            </button>
          ) : null}
          <a
            href={loginHref}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Entrar com outra conta
          </a>
          <button
            type="button"
            onClick={endSessionAndLogin}
            disabled={ending}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {ending ? "Encerrando..." : "Encerrar sessao e entrar de novo"}
          </button>
        </div>
      </div>
    </div>
  );
}
