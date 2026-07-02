/**
 * 4 cards de métrica do topo do painel — dado REAL (Fase C):
 *   - Anúncios ativos: stats.active_ads
 *   - Leads recebidos: total real da tabela leads (escopado ao dono)
 *   - Visitas: acumulado real de ad_metrics
 *   - Taxa de resposta: SEM fonte → "—" (estado vazio honesto)
 * Valores 0 são reais (loja sem visitas/leads ainda), não placeholder.
 */

type DashboardMetricCardsProps = {
  activeAds: number;
  planLimit: number;
  totalLeads: number;
  totalViews: number;
};

type Metric = {
  key: string;
  label: string;
  value: string;
  subtitle: string;
  icon: "car" | "users" | "eye" | "chat";
  iconBg: string;
  iconFg: string;
};

function MetricIcon({ name }: { name: Metric["icon"] }) {
  const cls = "h-5 w-5";
  switch (name) {
    case "car":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M5 16v2m14-2v2M4 13l1.5-4.5A2 2 0 0 1 7.4 7h9.2a2 2 0 0 1 1.9 1.5L20 13M4 13h16v3H4v-3Zm2.5 1.5h.01m10.99 0h.01" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 6a5 5 0 0 0-10 0M3 19a6 6 0 0 1 11.3-2.2" />
        </svg>
      );
    case "eye":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "chat":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 6h16v10H8l-4 4V6Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardMetricCards({
  activeAds,
  planLimit,
  totalLeads,
  totalViews,
}: DashboardMetricCardsProps) {
  const nf = (n: number) => n.toLocaleString("pt-BR");
  const metrics: Metric[] = [
    {
      key: "active",
      label: "Anúncios ativos",
      value: String(activeAds),
      subtitle: planLimit > 0 ? `de ${planLimit} disponíveis` : "sem limite definido",
      icon: "car",
      iconBg: "bg-[#eaf1ff]",
      iconFg: "text-[#0e62d8]",
    },
    {
      // Total real (tabela leads). 0 = realmente sem leads ainda.
      key: "leads",
      label: "Leads recebidos",
      value: nf(totalLeads),
      subtitle: totalLeads > 0 ? "no total" : "nenhum lead ainda",
      icon: "users",
      iconBg: "bg-[#e9f7ef]",
      iconFg: "text-[#12925a]",
    },
    {
      // Acumulado real (ad_metrics). 0 = realmente sem visitas ainda.
      key: "views",
      label: "Visitas",
      value: nf(totalViews),
      subtitle: totalViews > 0 ? "acumuladas" : "nenhuma visita ainda",
      icon: "eye",
      iconBg: "bg-[#f1ecfe]",
      iconFg: "text-[#7c3aed]",
    },
    {
      // Sem fonte de dado — permanece "—" (estado vazio honesto).
      key: "response",
      label: "Taxa de resposta",
      value: "—",
      subtitle: "sem dados ainda",
      icon: "chat",
      iconBg: "bg-[#fff2e3]",
      iconFg: "text-[#e08405]",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-metric-cards">
      {metrics.map((m) => (
        <div
          key={m.key}
          className="relative rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
          data-testid={`metric-${m.key}`}
        >
          <svg
            className="absolute right-4 top-5 h-4 w-4 text-[#cbd5e1]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${m.iconBg} ${m.iconFg}`}>
              <MetricIcon name={m.icon} />
            </span>
            <div className="min-w-0 pr-4">
              <p className="text-sm font-semibold text-[#64748b]">{m.label}</p>
              <p className="mt-1 text-3xl font-extrabold leading-none text-[#0f172a]">{m.value}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">{m.subtitle}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
