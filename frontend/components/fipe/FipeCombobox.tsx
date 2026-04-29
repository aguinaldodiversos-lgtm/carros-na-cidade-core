// frontend/components/fipe/FipeCombobox.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FipeOption } from "@/lib/fipe/fipe-provider";

interface FipeComboboxProps {
  label: string;
  placeholder: string;
  options: FipeOption[];
  value: FipeOption | null;
  onChange: (option: FipeOption | null) => void;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  /** Ícone à esquerda do input (gabarito Fipe.png usa logo de marca, lupa e calendário). */
  leftIcon?: ReactNode;
  /** Mostra um botão de limpar quando há valor selecionado (gabarito mostra X no campo Modelo). */
  clearable?: boolean;
}

export function FipeCombobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  emptyMessage = "Nenhuma opção encontrada",
  leftIcon,
  clearable = false,
}: FipeComboboxProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(value?.name || "");
  }, [value?.name]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return options.slice(0, 12);

    return options.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 12);
  }, [options, query]);

  const showClear = clearable && !disabled && Boolean(value);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-cnc-text-strong">
        {label}
      </label>

      <div className="relative">
        {leftIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-cnc-muted"
          >
            {leftIcon}
          </span>
        ) : null}

        <input
          type="text"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);

            if (value && event.target.value !== value.name) {
              onChange(null);
            }
          }}
          placeholder={placeholder}
          className={`h-[48px] w-full rounded-xl border border-cnc-line bg-white text-[14.5px] text-cnc-text-strong outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-cnc-bg disabled:text-cnc-muted-soft sm:h-[52px] sm:text-[15px] ${
            leftIcon ? "pl-10" : "pl-4"
          } ${showClear ? "pr-16" : "pr-10"}`}
        />

        {showClear ? (
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
              setQuery("");
              setOpen(false);
            }}
            className="absolute inset-y-0 right-9 inline-flex w-6 items-center justify-center text-cnc-muted hover:text-cnc-text"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-cnc-muted"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="m5 7 5 6 5-6H5Z" />
          </svg>
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-cnc-line bg-white shadow-[0_18px_40px_rgba(16,28,58,0.12)]">
          {loading ? (
            <div className="px-4 py-3 text-[13px] text-cnc-muted">Carregando…</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-cnc-muted">{emptyMessage}</div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto py-1.5">
              {filteredOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setQuery(option.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] text-cnc-text-strong transition hover:bg-primary-soft"
                >
                  <span className="truncate">{option.name}</span>
                  <span className="ml-3 shrink-0 text-[11px] font-semibold text-cnc-muted-soft">
                    {option.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
