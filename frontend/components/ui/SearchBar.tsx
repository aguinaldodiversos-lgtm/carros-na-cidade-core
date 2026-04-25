// frontend/components/ui/SearchBar.tsx
"use client";

import { forwardRef, useId } from "react";
import type { FormHTMLAttributes, ReactNode } from "react";

/**
 * Barra de busca composta: input com lupa + botão de filtros opcional.
 *
 * Variants:
 *   - default → tamanho padrão
 *   - sticky  → adiciona container sticky com fundo (uso em catálogo)
 *   - compact → menor (uso em headers internos)
 *
 * Use como wrapper de form. O onSubmit é responsabilidade do parent.
 */

type SearchBarVariant = "default" | "sticky" | "compact";

export type SearchBarProps = Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onChange" | "defaultValue"
> & {
  variant?: SearchBarVariant;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Nome do campo (controla query string ou form data). */
  name?: string;
  filterButton?: ReactNode;
  /** Aria-label do input. */
  ariaLabel?: string;
  className?: string;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 text-cnc-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

const SIZES: Record<SearchBarVariant, { wrap: string; input: string }> = {
  default: { wrap: "h-12 md:h-12", input: "text-base md:text-base" },
  sticky: { wrap: "h-12", input: "text-base" },
  compact: { wrap: "h-10", input: "text-sm" },
};

export const SearchBar = forwardRef<HTMLFormElement, SearchBarProps>(function SearchBar(
  props,
  ref
) {
  const {
    variant = "default",
    placeholder = "Buscar por marca, modelo ou cidade",
    defaultValue,
    value,
    onChange,
    onSubmit,
    name = "q",
    filterButton,
    ariaLabel = "Buscar",
    className = "",
    ...rest
  } = props;

  const reactId = useId();
  const id = `searchbar-${reactId}`;
  const sizes = SIZES[variant];

  const containerClass =
    variant === "sticky"
      ? "sticky top-0 z-30 -mx-4 bg-cnc-bg/90 px-4 py-2 backdrop-blur md:mx-0 md:px-0"
      : "";

  return (
    <form
      ref={ref}
      role="search"
      onSubmit={(event) => {
        if (onSubmit) {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const v = String(formData.get(name) ?? value ?? "");
          onSubmit(v);
        }
      }}
      className={`${containerClass} ${className}`.trim()}
      {...rest}
    >
      <div className="flex items-stretch gap-2">
        <label htmlFor={id} className="sr-only">
          {ariaLabel}
        </label>
        <div
          className={`flex flex-1 items-center gap-2 rounded-md border border-cnc-line bg-white px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${sizes.wrap}`}
        >
          <span aria-hidden="true" className="flex shrink-0 items-center">
            <SearchIcon />
          </span>
          <input
            id={id}
            type="search"
            name={name}
            placeholder={placeholder}
            defaultValue={defaultValue}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            autoComplete="off"
            inputMode="search"
            className={`flex-1 bg-transparent text-cnc-text outline-none placeholder:text-cnc-muted-soft ${sizes.input}`}
            aria-label={ariaLabel}
          />
        </div>
        {filterButton}
      </div>
    </form>
  );
});
