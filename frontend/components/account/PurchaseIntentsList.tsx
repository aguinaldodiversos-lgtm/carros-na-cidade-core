"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  fetchMyPurchaseIntents,
  formatCity,
  formatMaxPrice,
  formatPublishedAt,
  type PurchaseIntent,
} from "@/lib/purchase-intents/api";

/**
 * "Minhas procuras" — listagem do comprador.
 *
 * Mostra só o que EXISTE. Não há contador de "veículos recebidos" porque
 * `purchase_intent_offers` não existe nesta fase, e um "0 veículos recebidos"
 * prometeria um fluxo que ainda não foi construído.
 */

export function StatusBadge({ status }: { status: PurchaseIntent["display_status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DISPLAY_STATUS_CLASS[status]}`}
      data-testid="purchase-intent-status"
    >
      {DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
      <span className="text-sm text-[#64748b]">{label}</span>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
      data-testid="purchase-intents-error"
    >
      <p className="text-sm text-[#b42318]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-11 rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#fff5f5]"
      >
        Tentar novamente
      </button>
    </div>
  );
}

export function PurchaseIntentCard({
  intent,
  basePath,
}: {
  intent: PurchaseIntent;
  basePath: string;
}) {
  const vehicle = describeVehicle(intent);
  return (
    <li
      className="rounded-2xl border border-[#e8ecf4] bg-white p-4 sm:p-5"
      data-testid="purchase-intent-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* min-w-0 + truncate: sem isso um modelo longo estoura a largura no
            celular, e `body { overflow-x: hidden }` esconde o vazamento. */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-[#161f34]">{vehicle}</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            {TRANSMISSION_LABEL[intent.transmission] || intent.transmission}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#161f34]">
            {formatMaxPrice(intent.max_price)}
          </p>
          <p className="mt-1 text-sm text-[#64748b]">{formatCity(intent.city)}</p>
        </div>
        <StatusBadge status={intent.display_status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[#94a3b8]">{formatPublishedAt(intent.created_at)}</span>
        <Link
          href={`${basePath}/minhas-procuras/${intent.id}`}
          className="inline-flex h-11 items-center rounded-xl border border-[#dbe7fb] bg-[#eff5ff] px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#e2edff]"
        >
          Ver procura
        </Link>
      </div>
    </li>
  );
}

export default function PurchaseIntentsList({ basePath = "/dashboard" }: { basePath?: string }) {
  const [items, setItems] = useState<PurchaseIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchMyPurchaseIntents();
      setItems(page.purchase_intents);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar suas procuras."
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
    <section data-testid="purchase-intents-list">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">Minhas procuras</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Diga qual carro você procura e as lojas da sua cidade poderão encontrar opções para você.
        </p>
      </header>

      <Link
        href={`${basePath}/minhas-procuras/nova`}
        className="mb-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 sm:w-auto"
        data-testid="purchase-intents-new"
      >
        Publicar uma procura
      </Link>

      {loading ? <Spinner label="Carregando suas procuras…" /> : null}

      {!loading && error ? <ErrorBox message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && items.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-8 text-center sm:p-10"
          data-testid="purchase-intents-empty"
        >
          <p className="text-base font-semibold text-[#161f34]">
            Você ainda não publicou nenhuma procura.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
            Publique o que você procura para que as lojas da sua cidade encontrem opções.
          </p>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <ul className="grid gap-4">
          {items.map((intent) => (
            <PurchaseIntentCard key={intent.id} intent={intent} basePath={basePath} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
