import type { AccountType, DashboardStats as DashboardStatsType } from "@/lib/dashboard-types";

type DashboardStatsProps = {
  stats: DashboardStatsType;
  accountType: AccountType;
};

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-xl border border-[#dfe4ef] bg-white p-4 shadow-[0_2px_12px_rgba(10,20,40,0.05)]">
      <p className="text-xs font-bold uppercase tracking-wide text-[#5d6984]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-[#1d2538]">{value}</p>
      {helper && <p className="mt-1 text-xs text-[#5f6982]">{helper}</p>}
    </article>
  );
}

export default function DashboardStats({ stats, accountType }: DashboardStatsProps) {
  const limitLabel = `${stats.available_limit} de ${stats.plan_limit} vagas restantes`;
  const limitHelper =
    accountType === "CNPJ"
      ? "Maximo gratuito: 20 anuncios com CNPJ verificado"
      : accountType === "pending"
        ? "Complete CPF ou CNPJ para publicar; limite gratuito segue as regras PF apos cadastro."
        : "Maximo gratuito: 3 anuncios por CPF";

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Anuncios ativos"
        value={String(stats.active_ads)}
        helper={`Pausados: ${stats.paused_ads}`}
      />
      <StatCard label="Limite disponivel" value={limitLabel} helper={limitHelper} />
      <StatCard
        label="Plano atual"
        value={stats.plan_name}
        helper={`Destaques ativos: ${stats.featured_ads}`}
      />
      <StatCard
        label="Visualizacoes totais"
        value={stats.total_views.toLocaleString("pt-BR")}
        helper="Atualizado em tempo real"
      />
    </section>
  );
}
