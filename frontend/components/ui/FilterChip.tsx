// frontend/components/ui/FilterChip.tsx
"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

/**
 * FilterChip = especialização de Chip para listagens.
 *
 * Variants:
 *   - active     → filtro selecionado (sem X — togglável via clique)
 *   - removable  → filtro aplicado com X visível (clique chama onRemove)
 *
 * Diferença vs <Chip variant="filter|removable">:
 *   - FilterChip tem padding e tipografia ligeiramente menores
 *   - Pensado para barra de filtros aplicados em listagens (após search)
 *   - Sempre fundo soft (não muda na interação, fica mais previsível em
 *     barras com 5+ chips lado a lado)
 *
 * Quando usar Chip vs FilterChip:
 *   - Chip: filtros rápidos no topo da home ("Até R$ 50 mil", "SUV")
 *     que togglam estado conhecido pelo usuário
 *   - FilterChip: filtros já aplicados na URL na página de listagem
 */

type FilterChipVariant = "active" | "removable";

export type FilterChipProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  variant?: FilterChipVariant;
  /** Rótulo curto: "SUV", "Até R$ 50 mil". */
  label: string;
  /** Valor do filtro mostrado em destaque (opcional): "Até R$ 50 mil". */
  value?: string;
  onRemove?: () => void;
};

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

const BASE =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary-strong transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(
  function FilterChip(props, ref) {
    const { variant = "active", label, value, onRemove, className = "", ...rest } = props;

    if (variant === "removable") {
      return (
        <button
          ref={ref}
          type="button"
          onClick={onRemove}
          aria-label={`Remover filtro ${label}${value ? `: ${value}` : ""}`}
          className={`${BASE} hover:bg-primary-soft/70 ${className}`}
          {...rest}
        >
          <span className="truncate">
            {value ? (
              <>
                <span className="opacity-70">{label}: </span>
                {value}
              </>
            ) : (
              label
            )}
          </span>
          <CloseIcon />
        </button>
      );
    }

    // active (toggle por clique do parent)
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed
        className={`${BASE} ${className}`}
        {...rest}
      >
        <span className="truncate">
          {value ? (
            <>
              <span className="opacity-70">{label}: </span>
              {value}
            </>
          ) : (
            label
          )}
        </span>
      </button>
    );
  }
);
