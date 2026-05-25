"use client";

import { adminApi, type DashboardOverview } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";

const ADMIN_LINKS = [
  { label: "Portal público", href: "/", description: "Página inicial do site" },
  { label: "Dashboard Lojista", href: "/dashboard-loja", description: "Visão do anunciante PJ" },
  { label: "Dashboard PF", href: "/dashboard", description: "Visão do anunciante pessoa física" },
  { label: "Planos", href: "/planos", description: "Página pública de planos" },
] as const;

const INTEGRATIONS = [
  { name: "Banco de dados", description: "PostgreSQL — dados operacionais" },
  { name: "Armazenamento R2", description: "Cloudflare R2 — imagens de veículos" },
  { name: "Pagamentos", description: "MercadoPago — payment intents" },
  { name: "Fila de jobs", description: "BullMQ + Redis — workers" },
  { name: "Email", description: "Resend — emails transacionais" },
  { name: "SEO Metrics", description: "Google Search Console — métricas" },
] as const;

export default function AdminStatusSistema() {
  const overview = useAdminFetch<{ ok: boolean; data: DashboardOverview }>(
    () => adminApi.dashboard.overview(),
    []
  );

  const ov = overview.data?.data;
  const dbReachable = !overview.error && Boolean(ov);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-cnc-text">Status do sistema</h1>
        <p className="mt-1 text-xs text-cnc-muted">
          Integrações e ambiente — tela somente leitura.
        </p>
      </header>

      <div
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        Esta página é informativa. Ainda não há edição de configurações operacionais pelo painel —
        ajustes em planos, integrações e webhooks são feitos via runbook técnico.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* System Info */}
        <section
          aria-labelledby="status-info-title"
          className="rounded-xl border border-cnc-line bg-white p-5 shadow-card"
        >
          <h2 id="status-info-title" className="mb-4 text-sm font-bold text-cnc-text">
            Informações do ambiente
          </h2>
          {overview.loading ? (
            <AdminLoadingState />
          ) : (
            <div className="space-y-3 text-xs">
              <InfoItem
                label="Ambiente"
                value={process.env.NODE_ENV === "production" ? "Produção" : "Desenvolvimento"}
              />
              <InfoItem
                label="Backend"
                value={dbReachable ? "Respondendo" : "Sem resposta"}
                tone={dbReachable ? "ok" : "warn"}
              />
              <InfoItem label="Total de anúncios" value={String(ov?.ads?.total ?? "—")} />
              <InfoItem label="Total de anunciantes" value={String(ov?.advertisers?.total ?? "—")} />
              <InfoItem label="Total de usuários" value={String(ov?.users?.total ?? "—")} />
              <InfoItem label="Admins" value={String(ov?.users?.admins ?? "—")} />
              <InfoItem label="Cidades cadastradas" value={String(ov?.cities?.total ?? "—")} />
            </div>
          )}
        </section>

        {/* Integrations */}
        <section
          aria-labelledby="status-integrations-title"
          className="rounded-xl border border-cnc-line bg-white p-5 shadow-card"
        >
          <h2 id="status-integrations-title" className="mb-1 text-sm font-bold text-cnc-text">
            Inventário de integrações
          </h2>
          <p className="mb-4 text-[11px] text-cnc-muted-soft">
            Componentes esperados pelo backend. A presença efetiva é verificada pelo deploy
            (envs/segredos no Render), não por esta página.
          </p>
          <ul className="space-y-3">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-cnc-text">{i.name}</p>
                  <p className="text-[11px] text-cnc-muted-soft">{i.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-cnc-bg px-2.5 py-0.5 text-[11px] font-semibold text-cnc-muted">
                  Esperado
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Links rápidos */}
        <section
          aria-labelledby="status-links-title"
          className="rounded-xl border border-cnc-line bg-white p-5 shadow-card lg:col-span-2"
        >
          <h2 id="status-links-title" className="mb-4 text-sm font-bold text-cnc-text">
            Links rápidos
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ADMIN_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-lg border border-cnc-line px-4 py-3 transition-colors hover:bg-cnc-bg"
              >
                <div>
                  <p className="text-xs font-semibold text-cnc-text transition-colors group-hover:text-primary">
                    {link.label}
                  </p>
                  <p className="text-[11px] text-cnc-muted-soft">{link.description}</p>
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-cnc-muted-soft transition-colors group-hover:text-primary"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-cnc-danger"
        : "text-cnc-text";
  return (
    <div className="flex items-center justify-between border-b border-cnc-line/50 pb-2 last:border-0 last:pb-0">
      <span className="text-cnc-muted">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
