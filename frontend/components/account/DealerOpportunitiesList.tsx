"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import LoadMoreButton from "@/components/account/LoadMoreButton";
import ActiveBuyerCard from "@/components/account/opportunities/ActiveBuyerCard";
import ActiveBuyerFilters from "@/components/account/opportunities/ActiveBuyerFilters";
import {
  EMPTY_DEALER_FILTERS,
  fetchDealerOpportunities,
  formatCity,
  type DealerOpportunity,
  type DealerOpportunityFilters,
  type DealerOpportunityPage,
  type DealerOpportunitySort,
} from "@/lib/purchase-intents/api";
import { useCursorPagination } from "@/lib/account/use-cursor-pagination";

/**
 * "Compradores ativos" — as procuras da cidade da loja, em grade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O COMPONENTE NÃO SABE DE QUE CIDADE ESTÁ FALANDO
 * ════════════════════════════════════════════════════════════════════════════
 * E não deve saber. Ele não envia `city_id`; quem resolve é o backend, a partir
 * do advertiser do usuário autenticado. A cidade que aparece na barra de filtros
 * é LIDA da resposta — é o servidor dizendo onde olhou, não o cliente dizendo
 * onde quer olhar.
 *
 * Nenhum card mostra identidade do comprador porque a API não devolve nenhuma.
 * Não há campo escondido para esconder.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * COMO O FILTRO REINICIA A LISTA
 * ════════════════════════════════════════════════════════════════════════════
 * `useCursorPagination` não tem API de "resetar". Quando um filtro muda, este
 * componente passa uma `fetchPage` NOVA (o `useCallback` tem `filters` e `sort`
 * nas dependências), o efeito do hook reroda e a lista recomeça da primeira
 * página com o cursor limpo.
 *
 * É por isso que `fetchPage` PRECISA ser estável enquanto nada muda: uma função
 * recriada a cada render faria a lista recarregar em laço.
 */

/**
 * O grid, em UM lugar.
 *
 * Os esqueletos usam exatamente as mesmas classes dos cards — é o que garante
 * que a transição de "carregando" para "carregado" não empurre nada (§40). Duas
 * listas de classes divergiriam na primeira mudança de densidade.
 *
 * As colunas foram escolhidas contra a largura REAL da área de conteúdo, que não
 * é a do viewport: a partir de `lg` a barra lateral de 260px do
 * `AccountPanelShell` entra e come essa largura.
 *
 *   768  → 2 colunas (sem barra lateral; sobram ~720px, ~350px por card)
 *   1024 → 2 colunas (com barra lateral sobram ~716px; três colunas dariam
 *          ~225px por card, estreito demais para o orçamento caber numa linha)
 *   1280 → 3 colunas (~310px por card)
 *   1440 → 3 colunas (~350px por card) — a densidade da referência
 */
const GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5";

/**
 * Esqueleto do card.
 *
 * Cada bloco espelha o ELEMENTO correspondente do card real — a mesma moldura,
 * o mesmo `padding`, a mesma altura de linha, o mesmo `mt-auto pt-4` antes do
 * botão. Não é zelo estético: o esqueleto existe para que a chegada da lista não
 * empurre a página, e um retângulo de altura arbitrária devolve exatamente o
 * salto que ele deveria evitar.
 *
 * A prova é geométrica e vive no E2E (`active-buyers-card-grid.spec.ts`), que
 * mede as duas caixas no navegador e compara. A primeira versão deste esqueleto
 * errava a altura em 51px — a figura estava fixa em 104px enquanto a real segue
 * a proporção do `viewBox`, e faltava o `pt-4` do CTA.
 */
function CardSkeleton() {
  return (
    <li className="h-full" data-testid="active-buyer-skeleton" aria-hidden="true">
      <div className="flex h-full animate-pulse flex-col overflow-hidden rounded-2xl border border-[#e5eaf3] bg-white">
        <div className="bg-[#f7faff] px-3 pt-3">
          {/* Mesma proporção do `viewBox` da ilustração (320×112). */}
          <div className="aspect-[320/112] w-full rounded-xl bg-[#e8eef8]" />
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
          {/* Título: uma linha de `text-[16px] leading-snug`. */}
          <div className="h-[21px] w-3/4 rounded bg-[#eaeff7]" />
          {/* Critérios: `text-[13px] leading-relaxed` com `mt-1`. */}
          <div className="mt-1 h-[20px] w-1/2 rounded bg-[#f0f3f9]" />
          <div className="mt-3.5 border-t border-[#f1f4f9] pt-3.5">
            <div className="h-[24px] w-2/5 rounded bg-[#e4ecfa]" />
            <div className="mt-2 h-[20px] w-1/3 rounded bg-[#f0f3f9]" />
            <div className="mt-1.5 h-[19px] w-2/5 rounded bg-[#f0f3f9]" />
          </div>
          <div className="mt-auto pt-4">
            <div className="h-11 w-full rounded-xl bg-[#e4ecfa]" />
          </div>
        </div>
      </div>
    </li>
  );
}

export default function DealerOpportunitiesList({
  basePath = "/dashboard-loja",
}: {
  basePath?: string;
}) {
  const [filters, setFilters] = useState<DealerOpportunityFilters>(EMPTY_DEALER_FILTERS);
  const [sort, setSort] = useState<DealerOpportunitySort>("recent");

  const fetchPage = useCallback(
    (cursor?: string | null) => fetchDealerOpportunities({ filters, sort, cursor }),
    [filters, sort]
  );

  const { items, loading, error, loadingMore, moreError, hasMore, loadMore, reload, page } =
    useCursorPagination<DealerOpportunity, DealerOpportunityPage>(fetchPage);

  /*
    AS MARCAS DO SELETOR SÓ CRESCEM.

    Elas são derivadas dos itens carregados — não de um catálogo fixo, que
    ofereceria marcas sem nenhuma procura na cidade. Mas derivá-las do `items`
    ATUAL tem um defeito: assim que "Volkswagen" é escolhido, o feed passa a
    devolver só Volkswagen, e as outras marcas somem do `<select>`. O lojista
    ficaria preso — sem trocar de marca sem antes limpar o filtro.

    Guardar o que já foi visto resolve, e o custo é um `Set` que cresce até o
    tamanho do número de marcas da cidade.
  */
  const [knownBrands, setKnownBrands] = useState<string[]>([]);
  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const brand of knownBrands) seen.set(brand, brand);
    for (const item of items) {
      if (item.brand) seen.set(item.brand, item.brand);
    }

    const merged = [...seen.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (merged.length !== knownBrands.length) {
      // `useState` durante o render do MESMO componente é o padrão suportado
      // pelo React para estado derivado ("adjusting state when props change"):
      // o React descarta a saída e re-renderiza antes de tocar o DOM, sem
      // efeito e sem render extra visível.
      setKnownBrands(merged);
    }
    return merged.map((brand) => ({ value: brand, label: brand }));
  }, [items, knownBrands]);

  /*
    A CIDADE VEM DO SERVIDOR, NUNCA DE UM PALPITE.

    Sai do primeiro item da página — que é a cidade que a query usou, já que o
    `WHERE` é uma igualdade em `pi.city_id`. Cidade sem nenhuma procura devolve
    lista vazia e, aí, não há o que exibir: a etiqueta some em vez de mostrar um
    nome inventado ou o último nome visto.
  */
  const city = items.length > 0 ? formatCity(items[0].city) : "";
  const total = page?.summary?.total ?? null;
  const hasFilters = filters !== EMPTY_DEALER_FILTERS;

  return (
    <section data-testid="dealer-opportunities-list">
      <Link
        href={`${basePath}/oportunidades`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        <span aria-hidden="true">←</span> Oportunidades
      </Link>

      <header className="mb-5 mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#161f34] sm:text-[30px]">
            Compradores ativos
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[#667085]">
            Pessoas da sua cidade procurando veículos.
          </p>
        </div>

        {/*
          A CONTAGEM É CONTADA, NÃO ESTIMADA.

          Vem de `summary.total`, um `COUNT(*)` sobre a MESMA fonte da listagem —
          com os mesmos filtros. `items.length` diria "20" para uma cidade com 53
          procuras, e o número mudaria a cada "Carregar mais".

          Três estados a escondem, e cada um por um motivo diferente:

            • CARREGANDO — ainda não há contagem; um número aqui seria chute.
            • ERRO — "0 oportunidades ativas" ao lado de uma falha de rede faria
              o lojista concluir que a cidade está parada. Falha e ausência são
              coisas diferentes e têm telas diferentes.
            • ZERO — o estado vazio logo abaixo já explica a ausência com uma
              frase; repetir "0" no cabeçalho é ruído, não informação.
        */}
        {!loading && !error && total != null && total > 0 ? (
          <p
            className="shrink-0 text-[13px] font-semibold text-[#475467]"
            data-testid="active-buyer-total"
          >
            {total === 1 ? "1 oportunidade ativa" : `${total} oportunidades ativas`}
          </p>
        ) : null}
      </header>

      {/*
        A barra de filtros fica MONTADA no erro e no vazio.

        Desmontá-la tiraria da tela o único controle capaz de sair do estado —
        quem filtrou "Picape + até R$ 20.000" e recebeu vazio precisa do botão
        "Limpar filtros" para voltar, e ele vive aqui dentro.
      */}
      <ActiveBuyerFilters
        filters={filters}
        sort={sort}
        city={city}
        brandOptions={brandOptions}
        onChange={setFilters}
        onSortChange={setSort}
      />

      {loading ? (
        <>
          {/*
            O esqueleto é `aria-hidden` — são retângulos, não conteúdo. Sem esta
            região, quem usa leitor de tela ficaria em SILÊNCIO durante a carga,
            que é pior do que o spinner que o esqueleto substituiu: o spinner ao
            menos tinha um texto.
          */}
          <p role="status" aria-live="polite" className="sr-only">
            Carregando compradores ativos…
          </p>
          <ul className={GRID_CLASS} data-testid="active-buyer-loading">
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </ul>
        </>
      ) : null}

      {/*
        FALHA NÃO É "NENHUM RESULTADO".

        Um feed que não respondeu e uma cidade sem compradores levam a telas
        diferentes de propósito: a primeira oferece "Tentar novamente", a segunda
        explica que ainda não há procura. Mostrar "0 oportunidades" quando a
        request falhou faria o lojista concluir que a cidade está parada.
      */}
      {!loading && error ? (
        <div
          className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-8 text-center"
          data-testid="dealer-opportunities-error"
          role="alert"
        >
          <p className="text-base font-semibold text-[#b42318]">
            Não foi possível carregar as oportunidades.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#b42318]">{error}</p>
          <button
            type="button"
            onClick={reload}
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
          className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-8 text-center sm:p-12"
          data-testid="dealer-opportunities-empty"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eff5ff]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#0e62d8]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5 21 21" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#161f34]">
            {hasFilters
              ? "Nenhuma procura ativa com esses filtros."
              : "Nenhuma procura ativa encontrada."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#667085]">
            {hasFilters
              ? "Ajuste ou limpe os filtros para ver as demais procuras da sua cidade."
              : "Novas oportunidades aparecem aqui quando compradores da sua cidade publicarem procuras — e você recebe um aviso."}
          </p>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <ul className={GRID_CLASS} data-testid="active-buyer-grid">
            {items.map((opportunity) => (
              <ActiveBuyerCard
                key={opportunity.id}
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
