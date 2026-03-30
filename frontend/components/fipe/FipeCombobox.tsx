// frontend/components/fipe/FipeCombobox.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-2 block text-sm font-bold text-[#22304a]">{label}</label>

      <div className="relative">
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
          className="h-[54px] w-full rounded-[12px] border border-[#d9e1ee] bg-white px-4 pr-12 text-[16px] text-[#23314b] outline-none transition focus:border-[#0e62d8] disabled:cursor-not-allowed disabled:bg-[#f4f7fb] disabled:text-[#98a2b6]"
        />

        <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center text-[#7d879b]">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="m5 7 5 6 5-6H5Z" />
          </svg>
        </span>
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[14px] border border-[#dce3ef] bg-white shadow-[0_18px_40px_rgba(16,28,58,0.12)]">
          {loading ? (
            <div className="px-4 py-4 text-sm text-[#667085]">Carregando...</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[#667085]">{emptyMessage}</div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto py-2">
              {filteredOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setQuery(option.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-[#24324b] transition hover:bg-[#f4f8ff]"
                >
                  <span className="truncate">{option.name}</span>
                  <span className="ml-3 shrink-0 text-xs font-semibold text-[#8a94a8]">
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
