"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  STATUS_LABEL,
  formatFipe,
  formatMileage,
  listSaleRequests,
  type SaleRequest,
} from "@/lib/sale-requests/api";

/**
 * "Minhas solicitações".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE O CARD NÃO MOSTRA
 * ────────────────────────────────────────────────────────────────────────────
 * Número de ofertas, maior lance, nome de loja e botão de WhatsApp. Nenhuma
 * dessas entidades existe na Fase 4.1, e um "0 ofertas" seria uma promessa que o
 * produto ainda não pode cumprir — a pessoa concluiria que ninguém se interessou,
 * quando na verdade a distribuição para lojistas nem foi construída.
 */

function StatusBadge({ status }: { status: SaleRequest["status"] }) {
  const open = status === "receiving_offers";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
        open ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#F2F4F7] text-[#475467]"
      }`}
      data-testid="sale-request-status"
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function SaleRequestCard({ request }: { request: SaleRequest }) {
  const cover = request.images?.[0] ?? null;
  const fipe = formatFipe(request.fipe_reference_value);

  return (
    <li className="overflow-hidden rounded-[16px] border border-[#E5E9F2] bg-white">
      <Link
        href={`/dashboard/vender-para-lojas/${request.id}`}
        className="flex flex-col gap-4 p-4 transition hover:bg-[#F9FBFF] sm:flex-row sm:items-center"
        data-testid="sale-request-card"
      >
        <div className="h-[140px] w-full shrink-0 overflow-hidden rounded-[12px] bg-[#F2F4F7] sm:h-20 sm:w-28">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-[#161f34]">
              {request.brand} {request.model}
            </h2>
            <StatusBadge status={request.status} />
          </div>

          <p className="mt-1 text-sm text-[#64748b]">
            {request.year} · {formatMileage(request.mileage)} · {request.city.name}
            {request.city.state ? ` - ${request.city.state}` : ""}
          </p>

          {fipe ? (
            <p className="mt-1 text-sm text-[#475467]">
              Referência FIPE: <strong className="font-semibold">{fipe}</strong>
            </p>
          ) : null}

          <p className="mt-1 text-xs text-[#94a3b8]">
            Publicada em {new Date(request.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>

        <span className="shrink-0 text-sm font-bold text-[#0e62d8]">Ver detalhes →</span>
      </Link>
    </li>
  );
}

export default function SaleRequestsList() {
  const [requests, setRequests] = useState<SaleRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor: string | null) => {
    const response = await listSaleRequests(nextCursor ? { cursor: nextCursor } : {});
    return response;
  }, []);

  useEffect(() => {
    let alive = true;
    void load(null)
      .then((response) => {
        if (!alive) return;
        setRequests(response.sale_requests ?? []);
        setCursor(response.next_cursor ?? null);
      })
      .catch((failure) => {
        if (!alive) return;
        setError(failure instanceof Error ? failure.message : "Não foi possível carregar.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await load(cursor);
      setRequests((current) => [...current, ...(response.sale_requests ?? [])]);
      setCursor(response.next_cursor ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar mais.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-[#64748b]" data-testid="sale-requests-loading">
        Carregando suas solicitações…
      </p>
    );
  }

  if (error) {
    return (
      <p
        className="rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#b42318]"
        role="alert"
        data-testid="sale-requests-error"
      >
        {error}
      </p>
    );
  }

  if (requests.length === 0) {
    return (
      <div
        className="rounded-[16px] border border-dashed border-[#CDD8EA] bg-[#F9FBFF] px-6 py-10 text-center"
        data-testid="sale-requests-empty"
      >
        <h2 className="text-base font-bold text-[#161f34]">
          Você ainda não enviou nenhum veículo
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
          Cadastre o seu carro para que as lojas da sua cidade possam avaliá-lo.
        </p>
        <Link
          href="/dashboard/vender-para-lojas/nova"
          className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-6 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110"
        >
          Enviar meu carro para as lojas
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="grid gap-3" data-testid="sale-requests-list">
        {requests.map((request) => (
          <SaleRequestCard key={String(request.id)} request={request} />
        ))}
      </ul>

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 h-12 w-full rounded-xl border border-[#E5E9F2] bg-white px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:w-auto sm:min-w-[220px]"
          data-testid="sale-requests-load-more"
        >
          {loadingMore ? "Carregando…" : "Carregar mais"}
        </button>
      ) : null}
    </div>
  );
}
