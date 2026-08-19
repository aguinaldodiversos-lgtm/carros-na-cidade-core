"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LoadMoreButton from "@/components/account/LoadMoreButton";
import DealerSaleOpportunityCard from "@/components/account/DealerSaleOpportunityCard";
import DealerSaleOpportunityFilters from "@/components/account/DealerSaleOpportunityFilters";
import DealerStorePicker from "@/components/account/DealerStorePicker";
import { useCursorPagination } from "@/lib/account/use-cursor-pagination";
import {
  DealerSaleOpportunityError,
  EMPTY_FILTERS,
  STORE_SELECTION_REQUIRED,
  countActiveFilters,
  fetchSaleOpportunities,
  type DealerSaleOpportunityFilters as Filters,
  type DealerSaleOpportunityPage,
  type DealerSaleOpportunitySort,
  type DealerSaleOpportunitySummary,
  type DealerStoreOption,
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

/**
 * Um número do cabeçalho.
 *
 * A cor é do ÍCONE, não do número: o valor fica sempre em tinta escura, legível
 * em qualquer um dos quatro cards. Pintar o número faria a métrica de menor
 * relevância competir com a de maior só por ser verde.
 */
const METRIC_TONE = {
  blue: "bg-[#EFF5FF] text-[#0e62d8]",
  green: "bg-[#ECFDF3] text-[#067647]",
  violet: "bg-[#F4F3FF] text-[#5925DC]",
  amber: "bg-[#FFF8F0] text-[#B54708]",
} as const;

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof METRIC_TONE;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#E5E9F2] bg-white px-2.5 py-2">
      <span
        className={`flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-md px-1 text-[12.5px] font-bold tabular-nums ${METRIC_TONE[tone]}`}
        aria-hidden="true"
      >
        {value}
      </span>
      <span className="min-w-0 text-[11px] font-medium leading-[1.25] text-[#667085]">
        {label}
      </span>
    </div>
  );
}

export default function DealerSaleOpportunitiesList({
  basePath = "/dashboard-loja",
}: {
  basePath?: string;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<DealerSaleOpportunitySort>("recent");

  /**
   * A loja escolhida vive na URL, e não em estado local nem em `localStorage`.
   *
   * Três consequências, todas desejadas: ela sobrevive à navegação para o
   * detalhe e de volta; é compartilhável; e some quando o lojista sai. E não é
   * autorização — o servidor reconfere o valor contra as lojas do usuário a cada
   * request, então um `?loja=` adulterado recebe 403 em vez de acesso.
   */
  const router = useRouter();
  const searchParams = useSearchParams();
  const advertiserId = searchParams.get("loja");

  const [storeOptions, setStoreOptions] = useState<DealerStoreOption[]>([]);

  /**
   * `fetchPage` PRECISA ser estável entre renders quando nada muda — o hook a
   * usa como dependência do efeito. Recriá-la a cada render faria a lista
   * recarregar em loop.
   *
   * E é justamente a MUDANÇA dessa identidade que reinicia a lista quando o
   * lojista troca um filtro: página 1, cursor limpo, sem API de reset.
   */
  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      try {
        const page = await fetchSaleOpportunities({ filters, sort, cursor, advertiserId });
        // Uma carga bem-sucedida encerra a pergunta: se o seletor estava na
        // tela por um 409 anterior, ele sai agora.
        setStoreOptions([]);
        return page;
      } catch (caught) {
        if (
          caught instanceof DealerSaleOpportunityError &&
          caught.code === STORE_SELECTION_REQUIRED
        ) {
          // NÃO é erro de tela: é uma pergunta que só o lojista responde. O
          // componente troca a lista pelo seletor em vez de mostrar "falhou".
          setStoreOptions(caught.stores);
          return { items: [], next_cursor: null, limit: 12, sort, summary: { total: 0, new_today: 0, with_my_offer: 0, without_my_offer: 0 } };
        }
        throw caught;
      }
    },
    [filters, sort, advertiserId]
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

  const chooseStore = (chosen: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("loja", String(chosen));
    // `replace` e não `push`: a escolha de loja não é um passo de navegação que
    // o "voltar" do navegador deva desfazer para uma tela que não carrega.
    router.replace(`?${next.toString()}`);
  };

  /** Preserva a loja escolhida ao navegar para o detalhe. */
  const detailQuery = advertiserId ? `?loja=${encodeURIComponent(advertiserId)}` : "";

  return (
    <section data-testid="dealer-sale-opportunities-list">
      <Link
        href={`${basePath}/oportunidades`}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0e62d8] transition hover:underline"
      >
        <span aria-hidden="true">←</span> Oportunidades
      </Link>

      {/*
        CABEÇALHO COMPACTO, com as métricas ao LADO do título.
        A versão anterior empilhava título, subtítulo e uma frase de métricas em
        três alturas, e junto com os filtros comia o primeiro viewport inteiro —
        o lojista abria um catálogo e via texto. Aqui título e números dividem a
        mesma faixa a partir de `lg`, como na referência.
      */}
      <header className="mb-4 mt-2.5 flex flex-col gap-4 lg:mb-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#161f34] sm:text-[25px] lg:whitespace-nowrap">
            Veículos disponíveis para avaliação
          </h1>
          {/*
            A copy descreve o que É, e não promete o que o sistema não sustenta.
            Nada de "melhores oportunidades", "margem garantida" ou "carros
            verificados": não há curadoria, não há cálculo de margem e não há
            vistoria — a ficha é uma DECLARAÇÃO do proprietário.
          */}
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-[#667085]">
            Veículos enviados por proprietários particulares para receber propostas de lojas.
          </p>
        </div>

        {/*
          MÉTRICAS — quatro números, todos com fonte real no `summary` do
          servidor. A referência traz um quarto card "Com potencial alto /
          margem atrativa": ele não existe aqui, porque não existe cálculo de
          margem em lugar nenhum deste sistema.
        */}
        {summary && !loading && !error ? (
          <div
            className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto"
            data-testid="dealer-sale-summary"
          >
            <MetricCard label="Disponíveis" value={summary.total} tone="blue" />
            <MetricCard label="Novas em 24h" value={summary.new_today} tone="green" />
            <MetricCard label="Com sua proposta" value={summary.with_my_offer} tone="violet" />
            <MetricCard label="Sem proposta sua" value={summary.without_my_offer} tone="amber" />
          </div>
        ) : null}
      </header>

      {storeOptions.length > 0 ? (
        <DealerStorePicker stores={storeOptions} onSelect={chooseStore} />
      ) : null}

      {storeOptions.length === 0 ? (
        <DealerSaleOpportunityFilters
          filters={filters}
          sort={sort}
          onChange={setFilters}
          onSortChange={setSort}
          brandOptions={brandOptions}
        />
      ) : null}

      {loading && storeOptions.length === 0 ? (
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
      {!loading && !error && storeOptions.length === 0 && items.length === 0 ? (
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
            1 / 2 / 3 / 4 colunas. O salto para quatro acontece em `xl`
            (1280px) e não mais em `2xl`: dentro do shell do painel, a coluna de
            conteúdo em 1440 tem ~1130px úteis, e com o breakpoint antigo os
            cards ficavam com 360px de largura — foto enorme e texto perdido no
            meio dela. Em quatro colunas cada card fica em ~270px, que é a
            proporção da referência.

            Não vai a cinco: o card carrega marca+modelo em uma linha, e abaixo
            de ~250px o título passa a truncar em quase todo veículo.
          */}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((opportunity) => (
              <DealerSaleOpportunityCard
                key={String(opportunity.id)}
                opportunity={opportunity}
                basePath={basePath}
                query={detailQuery}
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
