"use client";

import { useMemo } from "react";

import type { AdsSearchFilters } from "@/lib/search/ads-search";

type CatalogPaginationProps = {
  page: number;
  totalPages: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
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

export function CatalogPagination({ page, totalPages, onPatch }: CatalogPaginationProps) {
  const pages = useMemo(() => buildPageSequence(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) return null;

  const go = (target: number) => {
    if (target < 1 || target > totalPages || target === page) return;
    onPatch({ page: target });
  };

  return (
    <nav
      aria-label="Paginação do catálogo"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      {pages.map((p) => {
        const isActive = p === page;
        return (
          <button
            key={`page-${p}`}
            type="button"
            onClick={() => go(p)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "flex h-9 min-w-9 items-center justify-center rounded-lg bg-[#0e62d8] px-3 text-sm font-bold text-white shadow-sm"
                : "flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            }
          >
            {p}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        aria-label="Próxima página"
        className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
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
      </button>
    </nav>
  );
}
