"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LoadMoreButton from "@/components/account/LoadMoreButton";
import DealerSaleOpportunityCard from "@/components/account/DealerSaleOpportunityCard";
import DealerSaleOpportunityFilters from "@/components/account/DealerSaleOpportunityFilters";
import { useCursorPagination } from "@/lib/account/use-cursor-pagination";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  fetchSaleOpportunities,
  type DealerSaleOpportunityFilters as Filters,
  type DealerSaleOpportunityPage,
  type DealerSaleOpportunitySort,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * "Veículos para avaliação" — o feed do lojista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O COMPONENTE NÃO SABE QUAL É A CIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * E não a envia. Quem resolve é o backend, a partir da loja do usuário
 * autenticado. Mandar `city_id` daqui seria dar ao cliente o poder de escolher
 * o que vê.
 *
 * Nenhum card mostra identidade do vendedor — porque a API não devolve nenhuma.
 * Não há campo escondido para esconder.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O SHELL NÃO É TOCADO
 * ────────────────────────────────────────────────────────────────────────────
 * Esta tela é um `<section>` dentro do `AccountPanelShell` que já existe. Não há
 * sidebar nova, header duplicado nem cor de menu alterada: o item
 * "Oportunidades" já fica ativo por `startsWith`, porque esta rota é filha dele.
 */

/** Nenhum filtro ativo — usado para distinguir "cidade vazia" de "busca vazia". */
function isPristine(filters: Filters): boolean {
  return countActiveFilters(filters) === 0;
}

export default function DealerSaleOpportunitiesList({
  basePath = "/dashboard-loja",
}: {
  basePath?: string;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<DealerSaleOpportunitySort>("recent");

  /**
   * `fetchPage` PRECISA ser estável entre renders quando nada muda — o hook a
   * usa como dependência do efeito. Recriá-la a cada render faria a lista
   * recarregar em loop.
   *
   * E é justamente a MUDANÇA dessa identidade que reinicia a lista quando o
   * lojista troca um filtro: página 1, cursor limpo, sem API de reset.
   */
  const fetchPage = useCallback(
    (cursor?: string | null) => fetchSaleOpportunities({ filters, sort, cursor }),
    [filters, sort]
  );

  const { items, loading, error, loadingMore, moreError, hasMore, loadMore, reload, page } =
    useCursorPagination<DealerSaleOpportunitySummary, DealerSaleOpportunityPage>(fetchPage);

  /**
   * Catálogo de marcas do seletor.
   *
   * Cresce a partir das marcas REALMENTE presentes nos itens que já chegaram, e
   * nunca encolhe. O "nunca encolhe" é o ponto: se a lista fosse recalculada a
   * cada resposta, filtrar por Fiat deixaria o seletor só com Fiat — e o lojista
   * não teria como trocar para outra marca sem limpar o filtro.
   *
   * É um `ref` e não estado porque alimentar estado aqui dispararia um render
   * extra a cada página carregada, sem mudar nada na tela.
   */
  const brandCatalog = useRef(new Map<string, string>());
  for (const item of items) {
    if (item.brand_slug && !brandCatalog.current.has(item.brand_slug)) {
      brandCatalog.current.set(item.brand_slug, item.brand);
    }
  }

  const brandOptions = useMemo(
    () =>
      [...brandCatalog.current.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    // `items.length` como dependência: o catálogo só pode ter crescido quando
    // chegaram itens novos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length]
  );

  const summary = page?.summary ?? null;

  return (
    <section data-testid="dealer-sale-opportunities-list">
      <Link
        href={`${basePath}/oportunidades`}
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Oportunidades
      </Link>

      <header className="mb-5 mt-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">
          Veículos disponíveis para avaliação
        </h1>
        {/*
          A copy descreve o que É, e não promete o que o sistema não sustenta.
          Nada de "melhores oportunidades", "margem garantida" ou "carros
          verificados": não há curadoria, não há cálculo de margem e não há
          vistoria — a ficha é uma DECLARAÇÃO do proprietário.
        */}
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Veículos enviados por proprietários particulares para avaliação de compra.
        </p>

        {/* Métricas com fonte real, e só elas. */}
        {summary && !loading && !error ? (
          <p className="mt-3 text-[13px] text-[#475467]" data-testid="dealer-sale-summary">
            <span className="font-bold text-[#1D2440]">{summary.total}</span>{" "}
            {summary.total === 1 ? "veículo disponível" : "veículos disponíveis"}
            {summary.new_today > 0 ? (
              <>
                <span className="mx-1.5 text-[#C3CDDE]">·</span>
                <span className="font-bold text-[#1D2440]">{summary.new_today}</span>{" "}
                {summary.new_today === 1 ? "nova nas últimas 24h" : "novas nas últimas 24h"}
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      <DealerSaleOpportunityFilters
        filters={filters}
        sort={sort}
        onChange={setFilters}
        onSortChange={setSort}
        brandOptions={brandOptions}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
          <span className="text-sm text-[#64748b]">Carregando veículos…</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center"
          data-testid="dealer-sale-opportunities-error"
        >
          <p className="text-sm text-[#b42318]">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 h-11 rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#fff5f5]"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/*
        Ausência não é erro: cidade sem veículo é o estado normal no começo, e
        uma tela de erro aqui assustaria à toa. As duas mensagens são diferentes
        de propósito — "nenhum veículo na sua cidade" e "nenhum resultado para
        estes filtros" pedem ações opostas do lojista.
      */}
      {!loading && !error && items.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-8 text-center sm:p-10"
          data-testid="dealer-sale-opportunities-empty"
        >
          {isPristine(filters) ? (
            <>
              <p className="text-base font-semibold text-[#161f34]">
                Nenhum veículo disponível na sua cidade no momento.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
                Assim que um proprietário publicar um veículo para avaliação, ele aparece aqui.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-[#161f34]">
                Nenhum veículo com esses filtros.
              </p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-4 h-11 rounded-xl border border-[#dbe7fb] bg-[#eff5ff] px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#e2edff]"
                data-testid="dealer-sale-opportunities-empty-clear"
              >
                Limpar filtros
              </button>
            </>
          )}
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          {/*
            Um card por linha no celular; dois a partir de `sm`; três em `xl`;
            quatro em `2xl`. A escada é conservadora de propósito — a ficha do
            card tem cinco etiquetas, e espremer cinco colunas tornaria todas
            ilegíveis.
          */}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((opportunity) => (
              <DealerSaleOpportunityCard
                key={String(opportunity.id)}
                opportunity={opportunity}
                basePath={basePath}
              />
            ))}
          </ul>

          {hasMore ? (
            <LoadMoreButton onClick={loadMore} loading={loadingMore} error={moreError} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
