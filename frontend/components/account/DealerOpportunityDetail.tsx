"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DealerMatchingStock from "@/components/account/DealerMatchingStock";
import {
  PURCHASE_TIMEFRAME_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  fetchDealerOpportunity,
  formatCity,
  formatMaxPrice,
  formatPublishedAt,
  type DealerOpportunity,
} from "@/lib/purchase-intents/api";

/**
 * Detalhe da oportunidade, para o lojista.
 *
 * Duas seções: os dados da procura e, abaixo, o estoque compatível com botão de
 * envio (Fase 3). Continua SEM WhatsApp e sem "agendar visita" — essa etapa é da
 * próxima fase, e um botão desligado só ensinaria o lojista a ignorar botões.
 *
 * O estoque tem carregamento e erro PRÓPRIOS (`DealerMatchingStock`): a procura
 * é o conteúdo principal e não pode sumir da tela porque a lista de anúncios
 * falhou.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#f1f4f9] py-3 last:border-0">
      <dt className="text-sm text-[#64748b]">{label}</dt>
      <dd className="text-sm font-semibold text-[#161f34]">{value}</dd>
    </div>
  );
}

export default function DealerOpportunityDetail({
  id,
  basePath = "/dashboard-loja",
}: {
  id: number;
  basePath?: string;
}) {
  const [opportunity, setOpportunity] = useState<DealerOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOpportunity(await fetchDealerOpportunity(id));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar a oportunidade."
      );
      setOpportunity(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
        <span className="text-sm text-[#64748b]">Carregando oportunidade…</span>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div
        className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
        data-testid="dealer-opportunity-error"
      >
        <p className="text-sm text-[#b42318]">{error || "Oportunidade não encontrada."}</p>
        <Link
          href={`${basePath}/oportunidades/compradores`}
          className="mt-4 inline-flex h-11 items-center rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318]"
        >
          Voltar para compradores ativos
        </Link>
      </div>
    );
  }

  return (
    <section data-testid="dealer-opportunity-detail">
      <Link
        href={`${basePath}/oportunidades/compradores`}
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Compradores ativos
      </Link>

      <header className="mt-3">
        <p className="text-sm text-[#64748b]">Comprador procura</p>
        <h1 className="mt-1 text-xl font-bold text-[#161f34] sm:text-2xl">
          {describeVehicle(opportunity)}
        </h1>
      </header>

      <dl className="mt-5 rounded-2xl border border-[#e8ecf4] bg-white p-4 sm:p-5">
        <Row
          label="Câmbio"
          value={TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission}
        />
        <Row label="Orçamento" value={formatMaxPrice(opportunity.max_price)} />
        <Row label="Cidade" value={formatCity(opportunity.city)} />
        <Row
          label="Pretende comprar"
          value={PURCHASE_TIMEFRAME_LABEL[opportunity.purchase_timeframe] || "—"}
        />
        <Row label="Publicada" value={formatPublishedAt(opportunity.created_at)} />
      </dl>

      <DealerMatchingStock intentId={id} />
    </section>
  );
}
