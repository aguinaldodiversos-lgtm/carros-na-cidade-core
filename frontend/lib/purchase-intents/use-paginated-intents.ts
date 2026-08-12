"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Paginação por cursor para as duas listas de procuras (PF e PJ).
 *
 * Existe como hook porque PF e PJ precisam EXATAMENTE do mesmo comportamento —
 * append, dedup, guarda de clique duplo e erro parcial. Duplicar essa máquina de
 * estado duas vezes garantiria que uma das cópias divergisse na primeira
 * correção (e o `audit:clones` roda no CI).
 *
 * Não é um framework: um hook, um tipo de página, sem opções de configuração.
 *
 * Deliberadamente SEM scroll infinito. Um botão explícito é previsível no
 * celular, não dispara request ao rolar sem querer e não briga com o "voltar"
 * do navegador.
 */

export type CursorPage<T> = {
  purchase_intents: T[];
  next_cursor: string | null;
  limit: number;
};

export type PaginatedIntents<T> = {
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
};

export function usePaginatedIntents<T extends { id: number | string }>(
  fetchPage: (cursor?: string | null) => Promise<CursorPage<T>>
): PaginatedIntents<T> {
  const [items, setItems] = useState<T[]>([]);
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
        const page = await fetchPage(nextCursor);
        const incoming = Array.isArray(page?.purchase_intents) ? page.purchase_intents : [];

        setItems((current) => {
          const base = isFirstPage ? [] : current;
          // Dedup por id: mesmo com o cursor correto, um retry ou uma resposta
          // repetida não pode fazer o mesmo card aparecer duas vezes.
          const seen = new Set(base.map((item) => String(item.id)));
          const fresh = incoming.filter((item) => !seen.has(String(item.id)));
          return [...base, ...fresh];
        });
        setCursor(page?.next_cursor ?? null);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Não foi possível carregar os resultados.";
        if (isFirstPage) {
          // A primeira página falhou: não há o que preservar.
          setError(message);
          setItems([]);
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
  };
}
