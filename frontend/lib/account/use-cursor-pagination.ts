"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Paginação por cursor das listas do painel.
 *
 * Existe como hook porque as listas do projeto precisam EXATAMENTE do mesmo
 * comportamento — append, dedup, guarda de clique duplo e erro parcial.
 * Duplicar essa máquina de estado garantiria que uma das cópias divergisse na
 * primeira correção (e o `audit:clones` roda no CI).
 *
 * Não é um framework: um hook, um tipo de página, sem opções de configuração.
 *
 * Deliberadamente SEM scroll infinito. Um botão explícito é previsível no
 * celular, não dispara request ao rolar sem querer e não briga com o "voltar"
 * do navegador.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE `usePaginatedIntents` PARA CÁ (Fase 4.3)
 * ────────────────────────────────────────────────────────────────────────────
 * O hook nasceu em `lib/purchase-intents/use-paginated-intents.ts` com a página
 * tipada como `{ purchase_intents: T[] }` — o nome do payload do Produto 1.
 *
 * O feed de veículos para avaliação (Produto 2) tem a mesma máquina de estado e
 * outro nome de payload. As duas saídas ruins eram copiar o hook (duas máquinas,
 * uma delas sempre uma correção atrás) ou fazer o Produto 2 devolver uma chave
 * chamada `purchase_intents` (um nome que mente sobre o conteúdo).
 *
 * A terceira saída é esta: a página passou a ser `{ items: T[] }`, e cada lib de
 * API traduz o payload do backend na fronteira — que é o trabalho que uma lib de
 * API já faz. O nome do campo na REDE não mudou em produto nenhum.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COMO O FILTRO REINICIA A LISTA
 * ────────────────────────────────────────────────────────────────────────────
 * Não existe API de "resetar". Quando o chamador troca um filtro, ele passa uma
 * `fetchPage` nova (um `useCallback` com o filtro nas dependências), o efeito
 * reroda e a lista recomeça da primeira página com o cursor limpo.
 *
 * É por isso que `fetchPage` PRECISA ser estável entre renders quando nada muda:
 * uma função recriada a cada render faria a lista recarregar em loop. Todo
 * chamador a envolve em `useCallback`.
 */

export type CursorPage<T> = {
  items: T[];
  next_cursor: string | null;
};

export type CursorPagination<T, P extends CursorPage<T> = CursorPage<T>> = {
  items: T[];
  /** Primeira carga: a lista ainda não existe na tela. */
  loading: boolean;
  /** Falha da PRIMEIRA página — a tela inteira vira estado de erro. */
  error: string | null;
  /** Carga de uma página seguinte, com a lista já visível. */
  loadingMore: boolean;
  /** Falha de uma página seguinte — a lista carregada permanece. */
  moreError: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Recarrega do zero (usado pelo retry do estado de erro inicial). */
  reload: () => void;
  /**
   * A última página recebida, inteira.
   *
   * Existe para os campos que acompanham a lista sem fazer parte dela — o
   * `summary` do feed do lojista, por exemplo. Sem isso, a tela precisaria de
   * uma SEGUNDA request para buscar contagens que o servidor já mandou, e as
   * duas poderiam discordar entre si.
   */
  page: P | null;
};

export function useCursorPagination<T extends { id: number | string }, P extends CursorPage<T>>(
  fetchPage: (cursor?: string | null) => Promise<P>
): CursorPagination<T, P> {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState<P | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  /**
   * Guarda de request em voo.
   *
   * É um ref e não o estado `loadingMore` porque o estado só chega ao DOM no
   * próximo render: dois cliques rápidos leriam o mesmo `false` e disparariam
   * duas requests. O ref muda no mesmo tick. O `disabled` do botão continua
   * existindo para o usuário — este guard é para a máquina.
   */
  const inFlight = useRef(false);

  const run = useCallback(
    async (nextCursor: string | null) => {
      if (inFlight.current) return;
      inFlight.current = true;

      const isFirstPage = nextCursor == null;
      if (isFirstPage) {
        setLoading(true);
        setError(null);
        setMoreError(null);
      } else {
        setLoadingMore(true);
        setMoreError(null);
      }

      try {
        const received = await fetchPage(nextCursor);
        const incoming = Array.isArray(received?.items) ? received.items : [];

        setItems((current) => {
          const base = isFirstPage ? [] : current;
          // Dedup por id: mesmo com o cursor correto, um retry ou uma resposta
          // repetida não pode fazer o mesmo card aparecer duas vezes.
          const seen = new Set(base.map((item) => String(item.id)));
          const fresh = incoming.filter((item) => !seen.has(String(item.id)));
          return [...base, ...fresh];
        });
        setPage(received ?? null);
        setCursor(received?.next_cursor ?? null);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Não foi possível carregar os resultados.";
        if (isFirstPage) {
          // A primeira página falhou: não há o que preservar.
          setError(message);
          setItems([]);
          setPage(null);
          setCursor(null);
        } else {
          // Página seguinte falhou: a lista já carregada CONTINUA na tela, e o
          // cursor é preservado para que o retry tente o mesmo ponto.
          setMoreError(message);
        }
      } finally {
        if (isFirstPage) setLoading(false);
        else setLoadingMore(false);
        inFlight.current = false;
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    void run(null);
  }, [run]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    void run(cursor);
  }, [cursor, run]);

  const reload = useCallback(() => {
    void run(null);
  }, [run]);

  return {
    items,
    loading,
    error,
    loadingMore,
    moreError,
    hasMore: cursor != null,
    loadMore,
    reload,
    page,
  };
}
