import type { MarketStat } from "@/services/marketService";

type StatsSectionProps = {
  title: string;
  subtitle?: string;
  stats: MarketStat[];
};

export default function StatsSection({ title, subtitle, stats }: StatsSectionProps) {
  return (
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
      <header className="mb-4">
        <h2 className="text-2xl font-extrabold text-[#1d2538]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#5f6982]">{subtitle}</p>}
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6980]">{stat.label}</p>
            <p className="mt-1 text-[30px] font-extrabold leading-none text-[#0e62d8]">{stat.value}</p>
            <p className="mt-2 text-sm leading-snug text-[#4e5972]">{stat.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
