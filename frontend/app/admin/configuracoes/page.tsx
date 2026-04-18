"use client";

import { adminApi, type DashboardOverview } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";

const ADMIN_LINKS = [
  { label: "Portal público", href: "/", description: "Acessar o portal principal" },
  { label: "Dashboard Lojista", href: "/dashboard-loja", description: "Visão do anunciante PJ" },
  { label: "Dashboard PF", href: "/dashboard", description: "Visão do anunciante pessoa física" },
  { label: "Planos", href: "/planos", description: "Página pública de planos" },
];

const INTEGRATIONS = [
  { name: "Banco de dados", key: "db", description: "PostgreSQL — dados operacionais" },
  { name: "Armazenamento R2", key: "r2", description: "Cloudflare R2 — imagens de veículos" },
  { name: "Pagamentos", key: "payments", description: "MercadoPago — payment intents" },
  { name: "Fila de jobs", key: "bullmq", description: "BullMQ + Redis — workers" },
  { name: "Email", key: "email", description: "Resend — emails transacionais" },
  { name: "SEO Metrics", key: "seo", description: "Google Search Console — métricas" },
];

export default function AdminConfiguracoes() {
  const overview = useAdminFetch<{ ok: boolean; data: DashboardOverview }>(
    () => adminApi.dashboard.overview(),
    []
  );

  const ov = overview.data?.data;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-cnc-text">Configurações</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* System Info */}
        <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-cnc-text mb-4">Informações do Sistema</h2>
          {overview.loading ? (
            <AdminLoadingState />
          ) : (
            <div className="space-y-3 text-xs">
              <InfoItem
                label="Ambiente"
                value={process.env.NODE_ENV === "production" ? "Produção" : "Desenvolvimento"}
              />
              <InfoItem label="Total de Anúncios" value={String(ov?.ads?.total ?? "—")} />
              <InfoItem
                label="Total de Anunciantes"
                value={String(ov?.advertisers?.total ?? "—")}
              />
              <InfoItem label="Total de Usuários" value={String(ov?.users?.total ?? "—")} />
              <InfoItem label="Admins" value={String(ov?.users?.admins ?? "—")} />
              <InfoItem label="Cidades Ativas" value={String(ov?.cities?.total ?? "—")} />
            </div>
          )}
        </div>

        {/* Integrations */}
        <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-cnc-text mb-4">Integrações</h2>
          <div className="space-y-3">
            {INTEGRATIONS.map((i) => (
              <div key={i.key} className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-cnc-text">{i.name}</p>
                  <p className="text-[11px] text-cnc-muted-soft">{i.description}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Configurado
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Links */}
        <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-bold text-cnc-text mb-4">Links Administrativos</h2>
          <div className="space-y-2">
            {ADMIN_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-cnc-line px-4 py-3 hover:bg-cnc-bg transition-colors group"
              >
                <div>
                  <p className="text-xs font-semibold text-cnc-text group-hover:text-primary transition-colors">
                    {link.label}
                  </p>
                  <p className="text-[11px] text-cnc-muted-soft">{link.description}</p>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-cnc-muted-soft group-hover:text-primary transition-colors"
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
        </div>

        {/* Future Area */}
        <div className="rounded-xl border border-dashed border-cnc-line bg-white/50 p-5">
          <h2 className="text-sm font-bold text-cnc-muted mb-2">Área reservada</h2>
          <p className="text-xs text-cnc-muted-soft leading-relaxed">
            Espaço para futuras configurações operacionais: regras de moderação, limites de anúncios
            por plano, templates de email, configuração de webhooks, parâmetros de SEO e ajustes de
            integrações.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-cnc-line/50 pb-2 last:border-0 last:pb-0">
      <span className="text-cnc-muted">{label}</span>
      <span className="font-semibold text-cnc-text">{value}</span>
    </div>
  );
}
