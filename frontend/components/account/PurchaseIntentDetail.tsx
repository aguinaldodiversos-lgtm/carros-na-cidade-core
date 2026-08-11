"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/account/PurchaseIntentsList";
import {
  PURCHASE_TIMEFRAME_LABEL,
  TRANSMISSION_LABEL,
  closePurchaseIntent,
  describeVehicle,
  fetchMyPurchaseIntent,
  formatCity,
  formatMaxPrice,
  formatPublishedAt,
  type PurchaseIntent,
} from "@/lib/purchase-intents/api";

/**
 * Detalhe da procura, para o DONO.
 *
 * Não existe edição: se o comprador errou os critérios, ele encerra e publica
 * outra. Editar depois da notificação faria a oportunidade que a loja recebeu
 * deixar de ser a que ela vê ao clicar.
 *
 * Também não existe área de "veículos recebidos", nem vazia: `purchase_intent_offers`
 * é da Fase 3, e um espaço reservado com "nenhum veículo ainda" anunciaria um
 * fluxo que não existe.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#f1f4f9] py-3 last:border-0">
      <dt className="text-sm text-[#64748b]">{label}</dt>
      <dd className="text-sm font-semibold text-[#161f34]">{value}</dd>
    </div>
  );
}

export default function PurchaseIntentDetail({
  id,
  basePath = "/dashboard",
}: {
  id: number;
  basePath?: string;
}) {
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIntent(await fetchMyPurchaseIntent(id));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar a procura."
      );
      setIntent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleClose() {
    setClosing(true);
    setError(null);
    try {
      setIntent(await closePurchaseIntent(id));
      setConfirming(false);
    } catch (closeError) {
      setError(
        closeError instanceof Error ? closeError.message : "Não foi possível encerrar a procura."
      );
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
        <span className="text-sm text-[#64748b]">Carregando procura…</span>
      </div>
    );
  }

  if (!intent) {
    return (
      <div
        className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
        data-testid="purchase-intent-detail-error"
      >
        <p className="text-sm text-[#b42318]">{error || "Procura não encontrada."}</p>
        <Link
          href={`${basePath}/minhas-procuras`}
          className="mt-4 inline-flex h-11 items-center rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318]"
        >
          Voltar para minhas procuras
        </Link>
      </div>
    );
  }

  const isActive = intent.display_status === "active";

  return (
    <section data-testid="purchase-intent-detail">
      <Link
        href={`${basePath}/minhas-procuras`}
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Minhas procuras
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#64748b]">Sua procura</p>
          <h1 className="mt-1 text-xl font-bold text-[#161f34] sm:text-2xl">
            {describeVehicle(intent)}
          </h1>
        </div>
        <StatusBadge status={intent.display_status} />
      </header>

      <dl className="mt-5 rounded-2xl border border-[#e8ecf4] bg-white p-4 sm:p-5">
        <Row
          label="Câmbio"
          value={TRANSMISSION_LABEL[intent.transmission] || intent.transmission}
        />
        <Row label="Orçamento" value={formatMaxPrice(intent.max_price)} />
        <Row label="Cidade" value={formatCity(intent.city)} />
        <Row
          label="Pretende comprar"
          value={PURCHASE_TIMEFRAME_LABEL[intent.purchase_timeframe] || "—"}
        />
        <Row label="Publicada" value={formatPublishedAt(intent.created_at)} />
        <Row
          label={isActive ? "Ativa até" : "Validade"}
          value={new Date(intent.expires_at).toLocaleDateString("pt-BR")}
        />
      </dl>

      {isActive ? (
        <p
          className="mt-4 rounded-2xl border border-[#dbe7fb] bg-[#eff5ff] px-4 py-3 text-sm leading-relaxed text-[#1d4ed8]"
          data-testid="purchase-intent-active-note"
        >
          Sua procura está ativa para lojas da cidade selecionada.
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-[14px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-sm text-[#B42318]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isActive ? (
        <div className="mt-5">
          {confirming ? (
            <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4">
              <p className="text-sm text-[#161f34]">
                Encerrar a procura? Ela deixa de aparecer para as lojas imediatamente.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleClose()}
                  disabled={closing}
                  className="h-12 rounded-xl bg-[#b42318] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60 sm:min-w-[180px]"
                  data-testid="purchase-intent-close-confirm"
                >
                  {closing ? "Encerrando…" : "Sim, encerrar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={closing}
                  className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#33405A] transition hover:bg-[#f9fbff]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-12 w-full rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#33405A] transition hover:bg-[#f9fbff] sm:w-auto sm:min-w-[200px]"
              data-testid="purchase-intent-close"
            >
              Encerrar procura
            </button>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[#64748b]" data-testid="purchase-intent-inactive-note">
          {intent.display_status === "closed"
            ? "Você encerrou esta procura. Ela não aparece mais para as lojas."
            : "Esta procura expirou. Publique uma nova quando quiser."}
        </p>
      )}
    </section>
  );
}
