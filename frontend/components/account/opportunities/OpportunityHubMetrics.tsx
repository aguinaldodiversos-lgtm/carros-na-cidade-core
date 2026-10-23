"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  TREND_EXPLANATION,
  describeTrend,
  fetchOpportunitiesSummary,
  type DealerOpportunitiesSummary,
  type OpportunityMetric,
} from "@/lib/account/opportunities-summary";

/** Apenas valores da API. Uma falha nunca é apresentada como zero. */
type MetricTone = "blue" | "teal" | "amber" | "indigo";

const TONE: Record<MetricTone, { card: string; icon: string; link: string }> = {
  blue: {
    card: "border-[#DFEAFB] bg-[#F7FAFF]",
    icon: "bg-[#E2EEFF] text-[#0E62D8]",
    link: "text-[#0E62D8]",
  },
  teal: {
    card: "border-[#DCF2E9] bg-[#F5FCF9]",
    icon: "bg-[#DCF8EB] text-[#078961]",
    link: "text-[#078961]",
  },
  amber: {
    card: "border-[#FAEDE0] bg-[#FFFAF6]",
    icon: "bg-[#FFF0DB] text-[#E87510]",
    link: "text-[#B95C08]",
  },
  indigo: {
    card: "border-[#E8E5FD] bg-[#FAF9FF]",
    icon: "bg-[#EDEAFF] text-[#6544CC]",
    link: "text-[#6544CC]",
  },
};

const ICON = {
  buyers: (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3.3 3.3 0 0 1 0 6.5M17.5 13c2 .7 3.5 2.7 3.5 5" />
    </svg>
  ),
  car: (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 16v2.2M20 16v2.2M3 15.5c0-1.6.9-2.6 2.4-3l1.9-4c.4-.9 1.2-1.4 2.2-1.4h5c1 0 1.8.5 2.2 1.4l1.9 4c1.5.4 2.4 1.4 2.4 3v.5H3v-.5Z" />
      <circle cx="7.4" cy="15.8" r="1.1" />
      <circle cx="16.6" cy="15.8" r="1.1" />
    </svg>
  ),
  clock: (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  ),
  deal: (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M3 10.5 6.5 7l3.2 3.2a2 2 0 0 0 2.8 0L15 7.5M21 10.5 17.5 7l-2 1.6M6.5 14.5 9 17l1.6-1.6L12.4 17l1.6-1.6L15.6 17l2.2-2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
} as const;

function TrendLine({ metric, entriesLabel }: { metric: OpportunityMetric; entriesLabel: string }) {
  const trend = describeTrend(metric.trend, entriesLabel);
  const tone =
    trend.tone === "positive"
      ? "text-[#067647]"
      : trend.tone === "negative"
        ? "text-[#B42318]"
        : "text-[#8492A9]";

  return (
    <p
      className={`mt-1.5 min-h-[28px] text-[10.5px] font-medium leading-snug ${tone}`}
      title={TREND_EXPLANATION}
      aria-label={`${trend.label}. ${TREND_EXPLANATION}`}
      data-testid="dealer-hub-trend"
    >
      {trend.tone !== "neutral" ? (
        <span aria-hidden="true">{trend.tone === "positive" ? "▲ " : "▼ "}</span>
      ) : null}
      {trend.label}
    </p>
  );
}

function MetricCard({
  label,
  hint,
  metric,
  entriesLabel,
  tone,
  icon,
  href,
  linkLabel,
  testId,
}: {
  label: string;
  hint: string;
  metric: OpportunityMetric | null;
  entriesLabel: string;
  tone: MetricTone;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
  testId: string;
}) {
  const colors = TONE[tone];
  return (
    <li
      className={`flex min-w-0 items-start gap-3 rounded-2xl border px-3 py-4 sm:px-4 ${colors.card}`}
      data-testid={testId}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${colors.icon}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {metric ? (
          <>
            <p className="text-[27px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[#101B3D]">
              {metric.total.toLocaleString("pt-BR")}
            </p>
            <p
              className="mt-1 min-h-[31px] text-[12px] font-semibold leading-snug text-[#576986] xl:min-h-[35px]"
              title={hint}
            >
              {label}
            </p>
            <TrendLine metric={metric} entriesLabel={entriesLabel} />
          </>
        ) : (
          <>
            <p className="text-[13px] font-extrabold text-[#101B3D]">{label}</p>
            <p className="mt-2 text-[12px] text-[#667793]">
              Indicador disponível mediante assinatura do plano correspondente.
            </p>
          </>
        )}
        {metric && href && linkLabel ? (
          <Link
            href={href}
            className={`mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold underline-offset-2 hover:underline ${colors.link}`}
          >
            {linkLabel} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <div className="mt-2 h-[18px]" aria-hidden="true" />
        )}
      </div>
    </li>
  );
}

function MetricSkeleton() {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[#EDF1F8] bg-[#FAFBFE] px-3 py-4 sm:px-4">
      <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#EAF0F9]" />
      <div className="min-w-0 flex-1">
        <span className="block h-[27px] w-14 animate-pulse rounded bg-[#EAF0F9]" />
        <span className="mt-2 block h-[31px] w-24 animate-pulse rounded bg-[#EDF2FA] xl:h-[35px]" />
        <span className="mt-2 block h-[28px] w-24 animate-pulse rounded bg-[#EEF3FA]" />
        <span className="mt-2 block h-[18px] w-16 animate-pulse rounded bg-[#EEF3FA]" />
      </div>
    </li>
  );
}

export default function OpportunityHubMetrics() {
  const [summary, setSummary] = useState<DealerOpportunitiesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setSummary(await fetchOpportunitiesSummary());
    } catch {
      setFailed(true);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metricGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <section
      aria-labelledby="dealer-hub-metrics-heading"
      className="rounded-[21px] border border-[#E0E8F3] bg-white p-4 shadow-[0_8px_26px_-20px_rgba(20,45,90,0.16)] sm:p-6"
      data-testid="dealer-hub-summary-section"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="dealer-hub-metrics-heading"
            className="text-[18px] font-extrabold tracking-[-0.025em] text-[#101B3D] sm:text-[20px]"
          >
            Resumo de oportunidades
          </h2>
          <p className="mt-1 text-[12.5px] text-[#667793]">
            Acompanhe as oportunidades disponíveis para a sua loja.
          </p>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-[#6D7C98]">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d="M20 11a8 8 0 1 0-2.2 5.6M20 4v7h-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Dados consultados ao abrir a página
        </span>
      </div>

      {loading ? (
        <ul className={metricGrid} data-testid="dealer-hub-metrics-loading">
          {[0, 1, 2, 3].map((key) => (
            <MetricSkeleton key={key} />
          ))}
        </ul>
      ) : failed || !summary ? (
        <p
          className="rounded-xl border border-[#E8ECF4] bg-[#F9FAFC] px-4 py-3 text-[12.5px] text-[#667085]"
          data-testid="dealer-hub-metrics-error"
        >
          Não foi possível carregar o resumo agora.{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-bold text-[#0e62d8] hover:underline"
          >
            Tentar novamente
          </button>
        </p>
      ) : (
        <ul className={metricGrid} data-testid="dealer-hub-metrics">
          <MetricCard
            label="Compradores Procurando"
            hint="Procuras ativas e não vencidas na cidade da sua loja."
            entriesLabel="novas entradas"
            metric={summary.active_buyers}
            tone="blue"
            icon={ICON.buyers}
            href="/dashboard-loja/oportunidades/compradores"
            linkLabel="Ver demandas"
            testId="dealer-hub-metric-buyers"
          />
          <MetricCard
            label="Veículos para avaliação"
            hint="Veículos recebendo propostas na cidade da sua loja."
            entriesLabel="novas entradas"
            metric={summary.sale_requests}
            tone="teal"
            icon={ICON.car}
            href="/dashboard-loja/oportunidades/veiculos"
            linkLabel="Ver veículos"
            testId="dealer-hub-metric-vehicles"
          />
          <MetricCard
            label="Novas hoje"
            hint={
              summary.active_buyers
                ? "Novas procuras e veículos publicados hoje na cidade da sua loja."
                : "Novos veículos publicados hoje na cidade da sua loja."
            }
            entriesLabel="novas entradas em 7 dias"
            metric={summary.new_today}
            tone="amber"
            icon={ICON.clock}
            testId="dealer-hub-metric-new-today"
          />
          <MetricCard
            label="Compras em andamento"
            hint="Veículos em processo de compra pela sua loja. Não inclui ofertas de venda."
            entriesLabel="novas compras"
            metric={summary.deals_in_progress}
            tone="indigo"
            icon={ICON.deal}
            testId="dealer-hub-metric-deals"
          />
        </ul>
      )}
    </section>
  );
}
