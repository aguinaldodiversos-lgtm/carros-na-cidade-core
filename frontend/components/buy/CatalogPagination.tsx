"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { AdsSearchFilters } from "@/lib/search/ads-search";

/**
 * Paginação RASTREÁVEL do catálogo.
 *
 * ── O que era ────────────────────────────────────────────────────────────────
 * `<button onClick={…}>`. Sem `href`, sem `<a>`: para o Googlebot, a página 2
 * simplesmente não existia. Só os anúncios da primeira página eram
 * descobertos por navegação — e como o catálogo é ordenado por relevância
 * comercial, o que ficava invisível era exatamente o acervo mais antigo, que é
 * quem mais depende de busca orgânica para vender.
 *
 * ── O que é ──────────────────────────────────────────────────────────────────
 * `<a href>` de verdade em anterior, próxima e cada número. Funciona sem
 * JavaScript. O clique continua sendo interceptado pelo `<Link>` do Next para
 * a navegação client-side seguir instantânea — a melhoria de UX ficou, o HTML
 * é que deixou de depender dela.
 *
 * Regras de URL (todas em `buildHref`, no caller):
 *   - página 1 → URL LIMPA, nunca `?page=1` (seria duplicata da vitrine);
 *   - `page` fora de [1, totalPages] não vira link;
 *   - filtros válidos do usuário são preservados;
 *   - `sort=relevance` e território não entram (política central de parâmetros).
 */

type CatalogPaginationProps = {
  page: number;
  totalPages: number;
  /**
   * Monta o href de uma página. Fica no caller porque só ele conhece o
   * pathname e os filtros ativos — e porque é o mesmo builder usado pela
   * navegação client-side, então `href` e destino do clique não podem divergir.
   */
  buildHref: (page: number) => string;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  /**
   * Renderizar o paginador mesmo quando existe UMA página só.
   *
   * Por padrão `false` — um paginador de página única não acrescenta navegação
   * e polui as vitrines que já têm conteúdo depois da listagem.
   *
   * `/carros-em/[slug]` liga isto (Fase 5.0B) porque a página perdeu os blocos
   * pós-catálogo: sem o paginador, o último card emendava direto no rodapé, sem
   * nenhum sinal de "a lista acabou". Aqui o paginador é encerramento visual,
   * não navegação — e continua sem emitir `?page=1`: com uma página só, as duas
   * setas ficam desabilitadas (`<span>`) e o "1" é `aria-current`, sem `href`.
   */
  showSinglePage?: boolean;
};

function buildPageSequence(page: number, totalPages: number): number[] {
  if (totalPages <= 1) return [];
  const maxVisible = 8;
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const start = Math.max(1, Math.min(page - 3, totalPages - (maxVisible - 1)));
  return Array.from({ length: maxVisible }, (_, i) => start + i);
}

/** Sanitização defensiva: `page` vem de query string, logo vem do mundo. */
function clampPage(value: number, totalPages: number): number {
  if (!Number.isFinite(value)) return 1;
  const truncated = Math.trunc(value);
  if (truncated < 1) return 1;
  if (truncated > totalPages) return totalPages;
  return truncated;
}

const NUMBER_BASE =
  "flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm transition";
const NUMBER_ACTIVE = `${NUMBER_BASE} bg-[#0e62d8] font-bold text-white shadow-sm`;
const NUMBER_IDLE = `${NUMBER_BASE} border border-slate-200 bg-white font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700`;
const ARROW_ENABLED = `${NUMBER_BASE} border border-slate-200 bg-white font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700`;
const ARROW_DISABLED = `${NUMBER_BASE} border border-slate-200 bg-white font-semibold text-slate-400 opacity-40`;

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
    >
      <path d="m13 5-6 5 6 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
    >
      <path d="m7 5 6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CatalogPagination({
  page,
  totalPages,
  buildHref,
  onPatch,
  showSinglePage = false,
}: CatalogPaginationProps) {
  const safeTotalPages = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const currentPage = clampPage(Number(page), safeTotalPages);

  // `buildPageSequence` devolve `[]` para uma página — o comportamento que a
  // guarda abaixo espera. Quando o paginador é encerramento visual, a sequência
  // é o próprio "1", que sai como `aria-current` sem `href`.
  const pages = useMemo(
    () => (safeTotalPages <= 1 ? [1] : buildPageSequence(currentPage, safeTotalPages)),
    [currentPage, safeTotalPages]
  );

  if (safeTotalPages <= 1 && !showSinglePage) return null;

  const go = (target: number) => {
    if (target < 1 || target > safeTotalPages || target === currentPage) return;
    onPatch({ page: target });
  };

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < safeTotalPages;

  return (
    <nav
      aria-label="Paginação do catálogo"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      {/* Anterior — só vira `<a>` quando existe página anterior. Um link para
          `page=0` seria uma URL inválida oferecida ao crawler. */}
      {hasPrev ? (
        <Link
          href={buildHref(currentPage - 1)}
          rel="prev"
          aria-label="Página anterior"
          className={ARROW_ENABLED}
          onClick={(event) => {
            event.preventDefault();
            go(currentPage - 1);
          }}
        >
          <ChevronLeft />
        </Link>
      ) : (
        <span aria-hidden className={ARROW_DISABLED}>
          <ChevronLeft />
        </span>
      )}

      {pages.map((p) => {
        const isActive = p === currentPage;

        // A página atual não é link: `aria-current` já a identifica, e um
        // autolink em toda página de paginação é ruído de rastreamento.
        if (isActive) {
          return (
            <span key={`page-${p}`} aria-current="page" className={NUMBER_ACTIVE}>
              {p}
            </span>
          );
        }

        return (
          <Link
            key={`page-${p}`}
            href={buildHref(p)}
            aria-label={`Página ${p}`}
            className={NUMBER_IDLE}
            onClick={(event) => {
              event.preventDefault();
              go(p);
            }}
          >
            {p}
          </Link>
        );
      })}

      {hasNext ? (
        <Link
          href={buildHref(currentPage + 1)}
          rel="next"
          aria-label="Próxima página"
          className={ARROW_ENABLED}
          onClick={(event) => {
            event.preventDefault();
            go(currentPage + 1);
          }}
        >
          <ChevronRight />
        </Link>
      ) : (
        <span aria-hidden className={ARROW_DISABLED}>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
