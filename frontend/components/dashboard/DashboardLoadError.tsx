"use client";

import { usePathname } from "next/navigation";

/**
 * Falha ao carregar dados do painel (SSR ou API) — sessão pode estar ok; permite retry.
 */
export function DashboardLoadError() {
  const pathname = usePathname() || "/dashboard";
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-4">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Dashboard indisponível
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Não foi possível carregar seu painel agora
        </h1>
        <p className="text-sm leading-6 text-slate-600 sm:text-base">
          Sua sessão foi reconhecida, mas houve uma falha ao carregar os dados do dashboard. Isso
          pode ser instabilidade momentânea da API ou da rede. Tente novamente ou atualize a página.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0c4fb0]"
          >
            Tentar novamente
          </button>
          <a
            href={loginHref}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Entrar de novo
          </a>
        </div>
      </div>
    </div>
  );
}
