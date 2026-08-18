"use client";

import { useEffect, useState } from "react";
import {
  CAUTION_REPORT_RESULT_OPTIONS,
  DECLARED_CONDITION_OPTIONS,
  TIRE_CONDITION_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
} from "@/lib/sale-requests/api";
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  countActiveFilters,
  type DealerSaleOpportunityFilters,
  type DealerSaleOpportunitySort,
} from "@/lib/sale-requests/dealer-api";

/**
 * Filtros do feed do lojista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DUAS APRESENTAÇÕES, UM ESTADO
 * ────────────────────────────────────────────────────────────────────────────
 * No desktop os campos ficam numa linha compacta; no celular, atrás de um botão
 * que abre um painel. Onze selects empilhados no topo empurrariam o primeiro
 * card para fora da primeira tela — e o feed existe para mostrar carros, não
 * formulário.
 *
 * O painel do mobile é um bloco COLAPSÁVEL no fluxo da página, e não um modal
 * fixo: um overlay que cobre a tela precisaria de trap de foco, bloqueio de
 * scroll do body e tratamento de `Esc` para não virar armadilha de acessibilidade
 * — três mecanismos para esconder cinco selects.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NADA DE FAIXA DE PREÇO
 * ────────────────────────────────────────────────────────────────────────────
 * Uma solicitação de venda NÃO tem preço pedido. Oferecer "de R$ X a R$ Y" faria
 * o lojista acreditar que o proprietário nomeou um valor — e a fase inteira
 * existe justamente porque ninguém nomeou.
 */

const YEAR_MIN = 1950;

function currentYearCeiling(): number {
  return new Date().getFullYear() + 1;
}

/** Um select rotulado. `""` significa "sem filtro" e é normalizado para `null`. */
function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-[#64748b]">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className="h-11 w-full rounded-xl border border-[#E5E9F2] bg-white px-3 text-[13px] text-[#1D2440] outline-none focus:border-[#0e62d8]"
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Campo numérico. Só dígitos — o backend recusa qualquer outra coisa com 400. */
function NumberField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-[#64748b]">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits === "" ? null : digits);
        }}
        className="h-11 w-full rounded-xl border border-[#E5E9F2] bg-white px-3 text-[13px] text-[#1D2440] outline-none placeholder:text-[#B6C0D4] focus:border-[#0e62d8]"
      />
    </div>
  );
}

const TRANSMISSION_OPTIONS = [
  { value: "automatico", label: "Automático" },
  { value: "manual", label: "Manual" },
  { value: "cvt", label: "CVT" },
];

const FUEL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "diesel", label: "Diesel" },
  { value: "hibrido", label: "Híbrido" },
  { value: "eletrico", label: "Elétrico" },
];

/**
 * O laudo cautelar reusa as opções de RESULTADO do formulário do dono e
 * acrescenta "Não possui" — que lá é derivado de outra pergunta e aqui é um
 * valor filtrável como qualquer outro.
 */
const CAUTION_FILTER_OPTIONS = [
  { value: "not_available", label: "Não possui laudo" },
  ...CAUTION_REPORT_RESULT_OPTIONS.map((option) => ({
    value: option.value as string,
    label: option.label,
  })),
  { value: "unknown", label: "Não sei informar" },
];

/** Rótulo legível de um filtro ativo, para o chip. */
function chipLabel(key: keyof DealerSaleOpportunityFilters, value: string): string {
  const find = (options: ReadonlyArray<{ value: string; label: string }>) =>
    options.find((option) => option.value === value)?.label ?? value;

  switch (key) {
    case "brand":
      return `Marca: ${value}`;
    case "year_min":
      return `A partir de ${value}`;
    case "year_max":
      return `Até ${value}`;
    case "mileage_max":
      return `Até ${Number(value).toLocaleString("pt-BR")} km`;
    case "transmission":
      return find(TRANSMISSION_OPTIONS);
    case "fuel_type":
      return find(FUEL_OPTIONS);
    case "declared_condition":
      return `Estado: ${find(DECLARED_CONDITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>)}`;
    case "tire_condition":
      return `Pneus: ${find(TIRE_CONDITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>)}`;
    case "caution_report_status":
      return `Laudo: ${find(CAUTION_FILTER_OPTIONS)}`;
    case "auction_history":
      return `Leilão: ${find(YES_NO_UNKNOWN_OPTIONS as ReadonlyArray<{ value: string; label: string }>)}`;
    case "financing_status":
      return `Financiamento: ${find(YES_NO_UNKNOWN_OPTIONS as ReadonlyArray<{ value: string; label: string }>)}`;
    default:
      return value;
  }
}

export default function DealerSaleOpportunityFilters({
  filters,
  sort,
  onChange,
  onSortChange,
  brandOptions,
}: {
  filters: DealerSaleOpportunityFilters;
  sort: DealerSaleOpportunitySort;
  onChange: (next: DealerSaleOpportunityFilters) => void;
  onSortChange: (next: DealerSaleOpportunitySort) => void;
  /** Marcas presentes na cidade — derivadas dos itens carregados, não inventadas. */
  brandOptions: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  // Ano de referência resolvido no cliente, depois da hidratação: usar
  // `new Date()` durante o render do servidor produziria um valor que pode
  // divergir do cliente e disparar aviso de hidratação na virada do ano.
  const [yearMax, setYearMax] = useState(YEAR_MIN + 1);
  useEffect(() => setYearMax(currentYearCeiling()), []);

  const set = (key: keyof DealerSaleOpportunityFilters, value: string | null) =>
    onChange({ ...filters, [key]: value });

  const fields = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Select
        id="filter-brand"
        label="Marca"
        value={filters.brand}
        options={brandOptions}
        onChange={(value) => set("brand", value)}
      />
      <NumberField
        id="filter-year-min"
        label="Ano mínimo"
        value={filters.year_min}
        placeholder={String(YEAR_MIN)}
        onChange={(value) => set("year_min", value)}
      />
      <NumberField
        id="filter-year-max"
        label="Ano máximo"
        value={filters.year_max}
        placeholder={String(yearMax)}
        onChange={(value) => set("year_max", value)}
      />
      <NumberField
        id="filter-mileage-max"
        label="Km até"
        value={filters.mileage_max}
        placeholder="100000"
        onChange={(value) => set("mileage_max", value)}
      />
      <Select
        id="filter-transmission"
        label="Câmbio"
        value={filters.transmission}
        options={TRANSMISSION_OPTIONS}
        onChange={(value) => set("transmission", value)}
      />
      <Select
        id="filter-fuel"
        label="Combustível"
        value={filters.fuel_type}
        options={FUEL_OPTIONS}
        onChange={(value) => set("fuel_type", value)}
      />
      <Select
        id="filter-condition"
        label="Estado geral"
        value={filters.declared_condition}
        options={DECLARED_CONDITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>}
        onChange={(value) => set("declared_condition", value)}
      />
      <Select
        id="filter-tires"
        label="Pneus"
        value={filters.tire_condition}
        options={TIRE_CONDITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>}
        onChange={(value) => set("tire_condition", value)}
      />
      <Select
        id="filter-caution"
        label="Laudo cautelar"
        value={filters.caution_report_status}
        options={CAUTION_FILTER_OPTIONS}
        onChange={(value) => set("caution_report_status", value)}
      />
      <Select
        id="filter-auction"
        label="Passagem por leilão"
        value={filters.auction_history}
        options={YES_NO_UNKNOWN_OPTIONS as ReadonlyArray<{ value: string; label: string }>}
        onChange={(value) => set("auction_history", value)}
      />
      <Select
        id="filter-financing"
        label="Financiamento"
        value={filters.financing_status}
        options={YES_NO_UNKNOWN_OPTIONS as ReadonlyArray<{ value: string; label: string }>}
        onChange={(value) => set("financing_status", value)}
      />
    </div>
  );

  return (
    <section className="mb-5" data-testid="dealer-sale-opportunity-filters">
      {/*
        UM cartão só, nas duas larguras. A versão anterior deixava a ordenação
        numa linha própria acima do painel — no desktop, onde o botão "Filtros"
        fica escondido, essa linha virava uma faixa vazia de ponta a ponta com um
        select solitário na direita, e empurrava o primeiro card para baixo sem
        entregar nada.
      */}
      <div className="rounded-2xl border border-[#E5E9F2] bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="dealer-sale-filters-panel"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E9F2] bg-white px-4 text-[13px] font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] lg:hidden"
            data-testid="dealer-sale-opportunity-filters-toggle"
          >
            Filtros
            {activeCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0e62d8] px-1.5 text-[11px] font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>

          {/* No desktop o rótulo dá contexto à linha inteira de campos abaixo. */}
          <span className="hidden text-[13px] font-bold text-[#1D2440] lg:inline">Filtros</span>

          <div className="ml-auto flex min-w-0 flex-col gap-1">
            <label htmlFor="dealer-sale-sort" className="text-[11px] font-semibold text-[#64748b]">
              Ordenar por
            </label>
            <select
              id="dealer-sale-sort"
              value={sort}
              onChange={(event) =>
                onSortChange(event.target.value as DealerSaleOpportunitySort)
              }
              className="h-11 rounded-xl border border-[#E5E9F2] bg-white px-3 text-[13px] text-[#1D2440] outline-none focus:border-[#0e62d8]"
              data-testid="dealer-sale-opportunity-sort"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/*
          Escondido no mobile até abrir; sempre visível a partir de `lg`. O mesmo
          markup nas duas larguras — dois blocos de campos separados exigiriam
          dois ids por campo e quebrariam a associação `label`/`input`.
        */}
        <div
          id="dealer-sale-filters-panel"
          className={`${open ? "block" : "hidden"} mt-4 border-t border-[#F2F4F7] pt-4 lg:block`}
        >
          {fields}
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(Object.keys(filters) as Array<keyof DealerSaleOpportunityFilters>)
            .filter((key) => filters[key] != null && String(filters[key]).trim() !== "")
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => set(key, null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe7fb] bg-[#eff5ff] px-3 py-1.5 text-[12px] font-semibold text-[#0e62d8] transition hover:bg-[#e2edff]"
                data-testid="dealer-sale-opportunity-chip"
              >
                {chipLabel(key, String(filters[key]))}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remover filtro</span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-[12px] font-semibold text-[#64748b] underline hover:text-[#1D2440]"
            data-testid="dealer-sale-opportunity-clear-filters"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}
