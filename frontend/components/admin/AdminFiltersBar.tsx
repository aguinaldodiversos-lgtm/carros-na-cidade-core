"use client";

import { useState } from "react";

type FilterDef = {
  key: string;
  label: string;
  type: "text" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
};

type Props = {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onSearch: () => void;
  onClear: () => void;
};

export function AdminFiltersBar({ filters, values, onChange, onSearch, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleFilters = expanded ? filters : filters.slice(0, 3);
  const hasMore = filters.length > 3;

  return (
    <div className="rounded-xl border border-cnc-line bg-white px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        {visibleFilters.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">
              {f.label}
            </label>
            {f.type === "select" ? (
              <select
                value={values[f.key] || ""}
                onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                className="h-9 rounded-lg border border-cnc-line bg-white px-3 text-xs text-cnc-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="">Todos</option>
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={values[f.key] || ""}
                onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                className="h-9 w-44 rounded-lg border border-cnc-line bg-white px-3 text-xs text-cnc-text placeholder:text-cnc-muted-soft/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            )}
          </div>
        ))}

        <div className="flex items-end gap-2">
          <button
            onClick={onSearch}
            className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-strong transition-colors"
          >
            Buscar
          </button>
          <button
            onClick={onClear}
            className="h-9 rounded-lg border border-cnc-line px-3 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
          >
            Limpar
          </button>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="h-9 px-2 text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Menos filtros" : "Mais filtros"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
