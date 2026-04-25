// frontend/components/ui/Chip.tsx
"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Chip primitivo do design system.
 * Variants:
 *   - filter   → toggle (selected via prop)
 *   - removable → exibe X e dispara onRemove
 *   - static   → não clicável (renderiza span)
 */

type ChipVariant = "filter" | "removable" | "static";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ChipVariant;
  selected?: boolean;
  iconLeft?: ReactNode;
  onRemove?: () => void;
  children: ReactNode;
};

const BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium tracking-normalish transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const FILTER_DEFAULT =
  "border-cnc-line bg-white text-cnc-text hover:border-cnc-line-strong hover:bg-cnc-bg";
const FILTER_SELECTED =
  "border-primary bg-primary-soft text-primary-strong shadow-sm";
const STATIC = "border-cnc-line bg-cnc-bg text-cnc-text cursor-default";
const REMOVABLE = "border-primary/30 bg-primary-soft text-primary-strong";

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(props, ref) {
  const {
    variant = "filter",
    selected = false,
    iconLeft,
    onRemove,
    children,
    className = "",
    ...rest
  } = props;

  if (variant === "static") {
    return (
      <span className={`${BASE} ${STATIC} ${className}`}>
        {iconLeft && <span className="flex items-center">{iconLeft}</span>}
        <span className="truncate">{children}</span>
      </span>
    );
  }

  if (variant === "removable") {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onRemove}
        aria-label={typeof children === "string" ? `Remover ${children}` : "Remover"}
        className={`${BASE} ${REMOVABLE} ${className}`}
        {...rest}
      >
        {iconLeft && <span className="flex items-center">{iconLeft}</span>}
        <span className="truncate">{children}</span>
        <CloseIcon />
      </button>
    );
  }

  // filter
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={`${BASE} ${selected ? FILTER_SELECTED : FILTER_DEFAULT} ${className}`}
      {...rest}
    >
      {iconLeft && <span className="flex items-center">{iconLeft}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
});
