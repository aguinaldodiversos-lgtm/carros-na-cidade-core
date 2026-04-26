// frontend/components/ui/Input.tsx
"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Input primitivo do design system.
 * Variants: default | search | error
 *
 * Suporta label, hint e mensagem de erro inline.
 */

type InputVariant = "default" | "search" | "error";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  variant?: InputVariant;
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  containerClassName?: string;
};

const VARIANT_CLASSES: Record<InputVariant, string> = {
  default: "border-cnc-line focus-within:border-primary focus-within:ring-primary/30",
  search: "border-cnc-line focus-within:border-primary focus-within:ring-primary/30",
  error: "border-cnc-danger focus-within:border-cnc-danger focus-within:ring-cnc-danger/30",
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

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  const {
    variant = "default",
    label,
    hint,
    error,
    iconLeft,
    iconRight,
    fullWidth = true,
    containerClassName = "",
    className = "",
    id: idProp,
    ...rest
  } = props;

  const reactId = useId();
  const id = idProp || `input-${reactId}`;
  const effectiveVariant: InputVariant = error ? "error" : variant;
  const showSearchIcon = variant === "search" && !iconLeft;

  return (
    <div className={`${fullWidth ? "w-full" : ""} ${containerClassName}`.trim()}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-cnc-text-strong">
          {label}
        </label>
      )}
      <div
        className={`flex h-12 items-center gap-2 rounded-md border bg-white px-3 transition focus-within:ring-2 md:h-10 ${VARIANT_CLASSES[effectiveVariant]}`}
      >
        {(iconLeft || showSearchIcon) && (
          <span className="flex shrink-0 items-center text-cnc-muted">
            {iconLeft || <SearchIcon />}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={`flex-1 bg-transparent text-base text-cnc-text outline-none placeholder:text-cnc-muted-soft md:text-sm ${className}`}
          aria-invalid={effectiveVariant === "error" || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...rest}
        />
        {iconRight && (
          <span className="flex shrink-0 items-center text-cnc-muted">{iconRight}</span>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-cnc-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-cnc-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
