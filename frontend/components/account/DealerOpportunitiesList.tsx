"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  TRANSMISSION_LABEL,
  describeVehicle,
  fetchDealerOpportunities,
  formatCity,
  formatMaxPrice,
  formatPublishedAt,
  type DealerOpportunity,
} from "@/lib/purchase-intents/api";

/**
 * "Compradores ativos" — oportunidades da cidade da loja.
 *
 * O componente NÃO sabe qual é a cidade e não a envia: quem resolve é o
 * backend, a partir do advertiser do usuário autenticado. Mandar `city_id`
 * daqui seria dar ao cliente o poder de escolher o que vê.
 *
 * Nenhum card mostra identidade do comprador — porque a API não devolve
 * nenhuma. Não há campo escondido para esconder.
 */

export function DealerOpportunityCard({
  opportunity,
  basePath,
}: {
  opportunity: DealerOpportunity;
  basePath: string;
}) {
  return (
    <li
      className="rounded-2xl border border-[#e8ecf4] bg-white p-4 sm:p-5"
      data-testid="dealer-opportunity-card"
    >
      <div className="min-w-0">
        <h3 className="truncate text-base font-bold text-[#161f34]">
          {describeVehicle(opportunity)}
        </h3>
        <p className="mt-1 text-sm text-[#64748b]">
          {TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#161f34]">
          {formatMaxPrice(opportunity.max_price)}
        </p>
        <p className="mt-1 text-sm text-[#64748b]">{formatCity(opportunity.city)}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[#94a3b8]">{formatPublishedAt(opportunity.created_at)}</span>
        <Link
          href={`${basePath}/oportunidades/compradores/${opportunity.id}`}
          className="inline-flex h-11 items-center rounded-xl border border-[#dbe7fb] bg-[#eff5ff] px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#e2edff]"
        >
          Ver oportunidade
        </Link>
      </div>
    </li>
  );
}

export default function DealerOpportunitiesList({
  basePath = "/dashboard-loja",
}: {
  basePath?: string;
}) {
  const [items, setItems] = useState<DealerOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchDealerOpportunities();
      setItems(page.purchase_intents);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os compradores ativos."
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section data-testid="dealer-opportunities-list">
      <Link
        href={`${basePath}/oportunidades`}
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Oportunidades
      </Link>

      <header className="mb-5 mt-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">Compradores ativos</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Pessoas da sua cidade procurando veículos.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
          <span className="text-sm text-[#64748b]">Carregando compradores…</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
          data-testid="dealer-opportunities-error"
        >
          <p className="text-sm text-[#b42318]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 h-11 rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#fff5f5]"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* Ausência não é erro: cidade sem comprador ativo é o estado normal no
          começo, e uma tela de erro aqui assustaria à toa. */}
      {!loading && !error && items.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-8 text-center sm:p-10"
          data-testid="dealer-opportunities-empty"
        >
          <p className="text-base font-semibold text-[#161f34]">
            Nenhum comprador ativo na sua cidade no momento.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
            Assim que alguém publicar uma procura na sua cidade, ela aparece aqui e você recebe um
            aviso.
          </p>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <ul className="grid gap-4">
          {items.map((opportunity) => (
            <DealerOpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              basePath={basePath}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
