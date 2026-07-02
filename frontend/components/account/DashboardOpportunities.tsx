/**
 * Bloco "Oportunidades para vender mais" (Fase B.1) — dicas estáticas.
 * Conteúdo fixo (boas práticas), sem dado dinâmico — pode existir agora.
 */

type Opportunity = {
  key: string;
  title: string;
  description: string;
  icon: "photos" | "reply" | "boost";
  iconBg: string;
  iconFg: string;
};

const OPPORTUNITIES: Opportunity[] = [
  {
    key: "photos",
    title: "Complete as fotos dos seus anúncios",
    description: "Anúncios com mais fotos recebem até 5x mais visitas.",
    icon: "photos",
    iconBg: "bg-[#f1ecfe]",
    iconFg: "text-[#7c3aed]",
  },
  {
    key: "reply",
    title: "Responda as mensagens rapidamente",
    description: "Lojas que respondem rápido têm mais chances de fechar negócio.",
    icon: "reply",
    iconBg: "bg-[#eaf1ff]",
    iconFg: "text-[#0e62d8]",
  },
  {
    key: "boost",
    title: "Impulsione seus anúncios",
    description: "Destaque seus veículos e alcance mais compradores.",
    icon: "boost",
    iconBg: "bg-[#fff2e3]",
    iconFg: "text-[#e08405]",
  },
];

function OppIcon({ name }: { name: Opportunity["icon"] }) {
  const cls = "h-5 w-5";
  switch (name) {
    case "photos":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m4 17 5-4 4 3 3-2 4 3" />
        </svg>
      );
    case "reply":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 6h16v10H8l-4 4V6Z" />
        </svg>
      );
    case "boost":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4s5 1 7 3-3 7-3 7l-6-1-4-4 1-6ZM9 15l-1-1" />
          <circle cx="15" cy="9" r="1.4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardOpportunities() {
  return (
    <section
      className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
      data-testid="dashboard-opportunities"
    >
      <h2 className="text-base font-extrabold text-[#0f172a]">Oportunidades para vender mais</h2>
      <div className="mt-4 space-y-3">
        {OPPORTUNITIES.map((o) => (
          <div
            key={o.key}
            className="flex items-center gap-3 rounded-xl border border-[#eef1f6] px-3 py-3 transition hover:bg-[#f8fafc]"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${o.iconBg} ${o.iconFg}`}>
              <OppIcon name={o.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#1d2538]">{o.title}</p>
              <p className="mt-0.5 text-xs text-[#64748b]">{o.description}</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[#cbd5e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
        ))}
      </div>
    </section>
  );
}
