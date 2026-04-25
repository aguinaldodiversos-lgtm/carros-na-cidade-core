// frontend/components/ui/Select.tsx
"use client";

import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes, ReactNode } from "react";

/**
 * Select primitivo do design system (native).
 * Estratégia mobile-first: usar <select> nativo para melhor UX em mobile.
 * Variant "searchable" não implementada nesta versão — adicionar em PR
 * subsequente apenas se houver caso de uso real (search server-side
 * é alternativa mais escalável).
 */

type SelectVariant = "default" | "error";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  variant?: SelectVariant;
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: ReadonlyArray<SelectOption>;
  fullWidth?: boolean;
  containerClassName?: string;
};

const VARIANT_CLASSES: Record<SelectVariant, string> = {
  default: "border-cnc-line focus:border-primary focus:ring-primary/30",
  error: "border-cnc-danger focus:border-cnc-danger focus:ring-cnc-danger/30",
};

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cnc-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  props,
  ref
) {
  const {
    variant = "default",
    label,
    hint,
    error,
    placeholder,
    options,
    fullWidth = true,
    containerClassName = "",
    className = "",
    id: idProp,
    ...rest
  } = props;

  const reactId = useId();
  const id = idProp || `select-${reactId}`;
  const effectiveVariant: SelectVariant = error ? "error" : variant;

  return (
    <div className={`${fullWidth ? "w-full" : ""} ${containerClassName}`.trim()}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-cnc-text-strong"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={id}
          className={`h-12 w-full appearance-none rounded-md border bg-white px-3 pr-9 text-base text-cnc-text outline-none transition focus:ring-2 md:h-10 md:text-sm ${VARIANT_CLASSES[effectiveVariant]} ${className}`}
          aria-invalid={effectiveVariant === "error" || undefined}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon />
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
