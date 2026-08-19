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
 * SEIS CONTROLES NA FRENTE, CINCO ATRÁS DE UM BOTÃO
 * ────────────────────────────────────────────────────────────────────────────
 * A versão anterior mostrava os ONZE filtros de uma vez, em duas fileiras de
 * selects de altura cheia. No desktop isso comia quase um terço do primeiro
 * viewport e empurrava o primeiro card para fora da tela — o lojista abria um
 * catálogo de veículos e via um formulário.
 *
 * A divisão não é arbitrária. Ficam à vista os cinco que respondem "que carro eu
 * quero olhar" (marca, ano, km, câmbio, estado) mais a ordenação; vão para
 * "Mais filtros" os cinco de RISCO (pneus, laudo, leilão, financiamento,
 * combustível), que o lojista aplica depois de já estar olhando o conjunto.
 *
 * O botão mostra a contagem do que está escondido, então nada fica invisível por
 * acidente — e os chips abaixo continuam listando TODOS os filtros ativos,
 * inclusive os de dentro do painel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NADA DE FAIXA DE PREÇO NEM CIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * A referência visual traz os dois. Nenhum existe aqui: uma solicitação de venda
 * NÃO tem preço pedido (é justamente o que a disputa descobre), e a cidade é
 * resolvida no servidor a partir da loja — aceitá-la como filtro daria ao cliente
 * o poder de listar demanda privada de qualquer cidade.
 */

const YEAR_MIN = 1950;

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
  const active = value != null && value !== "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-[#667085]">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        className={`h-10 w-full rounded-lg border bg-white px-2.5 text-[13px] text-[#1D2440] outline-none transition focus:border-[#0e62d8] focus:ring-1 focus:ring-[#0e62d8] ${
          active ? "border-[#0e62d8] font-semibold" : "border-[#E5E9F2]"
        }`}
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
  const active = value != null && value !== "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-[#667085]">
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
        className={`h-10 w-full rounded-lg border bg-white px-2.5 text-[13px] text-[#1D2440] outline-none transition placeholder:font-normal placeholder:text-[#B6C0D4] focus:border-[#0e62d8] focus:ring-1 focus:ring-[#0e62d8] ${
          active ? "border-[#0e62d8] font-semibold" : "border-[#E5E9F2]"
        }`}
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

/** Os filtros que vivem atrás do botão "Mais filtros". */
const ADVANCED_KEYS: ReadonlyArray<keyof DealerSaleOpportunityFilters> = [
  "fuel_type",
  "tire_condition",
  "caution_report_status",
  "auction_history",
  "financing_status",
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
  const advancedCount = ADVANCED_KEYS.filter(
    (key) => filters[key] != null && String(filters[key]).trim() !== ""
  ).length;

  // Ano de referência resolvido no cliente, depois da hidratação: usar
  // `new Date()` durante o render do servidor produziria um valor que pode
  // divergir do cliente e disparar aviso de hidratação na virada do ano.
  const [yearMax, setYearMax] = useState(YEAR_MIN + 1);
  useEffect(() => setYearMax(new Date().getFullYear() + 1), []);

  const set = (key: keyof DealerSaleOpportunityFilters, value: string | null) =>
    onChange({ ...filters, [key]: value });

  return (
    <section className="mb-5" data-testid="dealer-sale-opportunity-filters">
      <div className="rounded-2xl border border-[#E5E9F2] bg-white p-3 sm:p-4">
        {/*
          A LINHA PRINCIPAL. No mobile ela guarda só o botão "Filtros" e a
          ordenação; a partir de `lg` os cinco controles primários aparecem
          inline, na mesma altura, como na referência.
        */}
        <div className="flex flex-wrap items-end gap-2.5 lg:gap-3">
          <div
            className={`min-w-0 basis-full grid-cols-2 gap-2.5 sm:grid-cols-3 lg:min-w-0 lg:flex-1 lg:basis-0 lg:grid-cols-5 lg:gap-2.5 ${open ? "grid" : "hidden"} lg:grid`}
          >
            <Select
              id="filter-brand"
              label="Marca"
              value={filters.brand}
              options={brandOptions}
              onChange={(value) => set("brand", value)}
            />
            <NumberField
              id="filter-year-min"
              label="Ano de"
              value={filters.year_min}
              placeholder={String(YEAR_MIN)}
              onChange={(value) => set("year_min", value)}
            />
            <NumberField
              id="filter-year-max"
              label="Ano até"
              value={filters.year_max}
              placeholder={String(yearMax)}
              onChange={(value) => set("year_max", value)}
            />
            <NumberField
              id="filter-mileage-max"
              label="Km até"
              value={filters.mileage_max}
              placeholder="100.000"
              onChange={(value) => set("mileage_max", value)}
            />
            <Select
              id="filter-condition"
              label="Estado geral"
              value={filters.declared_condition}
              options={
                DECLARED_CONDITION_OPTIONS as ReadonlyArray<{ value: string; label: string }>
              }
              onChange={(value) => set("declared_condition", value)}
            />
          </div>

          {/* Botão "Filtros": abre os primários no mobile e os avançados em
              qualquer largura. A contagem mostra o que está escondido. */}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="dealer-sale-filters-panel"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#E5E9F2] bg-white px-3 text-[13px] font-bold text-[#1D2440] transition hover:border-[#CFE0FB] hover:bg-[#F9FBFF]"
            data-testid="dealer-sale-opportunity-filters-toggle"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <span className="lg:hidden">Filtros</span>
            <span className="hidden lg:inline">Mais filtros</span>
            {/*
              A contagem conta o que está ESCONDIDO, e isso muda por largura: no
              mobile o botão guarda os onze filtros; no desktop, só os cinco
              avançados (os outros estão inline, à vista). Um número só ficaria
              errado numa das duas larguras — por isso são dois, cada um visível
              onde é verdade.
            */}
            {activeCount > 0 ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#0e62d8] px-1 text-[10.5px] font-bold leading-none text-white lg:hidden">
                {activeCount}
              </span>
            ) : null}
            {advancedCount > 0 ? (
              <span className="hidden h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#0e62d8] px-1 text-[10.5px] font-bold leading-none text-white lg:inline-flex">
                {advancedCount}
              </span>
            ) : null}
          </button>

          <div className="ml-auto flex min-w-0 flex-col gap-1">
            <label htmlFor="dealer-sale-sort" className="text-[11px] font-semibold text-[#667085]">
              Ordenar por
            </label>
            <select
              id="dealer-sale-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as DealerSaleOpportunitySort)}
              className="h-10 rounded-lg border border-[#E5E9F2] bg-white px-2.5 text-[13px] font-semibold text-[#1D2440] outline-none transition focus:border-[#0e62d8] focus:ring-1 focus:ring-[#0e62d8]"
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
          PAINEL. No mobile traz os onze (os primários não cabem inline); a
          partir de `lg` traz só os cinco avançados, já que os outros estão na
          linha acima. O mesmo markup nas duas larguras evitaria ids duplicados,
          então cada bloco tem os seus e a visibilidade é por breakpoint.
        */}
        {/*
          AVANÇADOS. Montados SEMPRE no DOM, escondidos por CSS.

          A alternativa — renderizar condicionalmente — teria obrigado a
          duplicar os cinco controles primários (um bloco para mobile, outro
          para desktop), e dois <select> com o mesmo rótulo confundem leitor de
          tela tanto quanto confundem teste. Com `display:none` o controle sai
          do fluxo E da ordem de tabulação, que é o comportamento correto para
          um painel fechado.
        */}
        <div
          id="dealer-sale-filters-panel"
          className={`${open ? "block" : "hidden"} mt-4 border-t border-[#F2F4F7] pt-4`}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
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
              id="filter-tires"
              label="Pneus"
              value={filters.tire_condition}
              options={TIRE_CONDITION_OPTIONS}
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
              options={YES_NO_UNKNOWN_OPTIONS}
              onChange={(value) => set("auction_history", value)}
            />
            <Select
              id="filter-financing"
              label="Financiamento"
              value={filters.financing_status}
              options={YES_NO_UNKNOWN_OPTIONS}
              onChange={(value) => set("financing_status", value)}
            />
          </div>
        </div>
      </div>

      {/* CHIPS — todos os filtros ativos, inclusive os do painel fechado. */}
      {activeCount > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(Object.keys(filters) as Array<keyof DealerSaleOpportunityFilters>)
            .filter((key) => filters[key] != null && String(filters[key]).trim() !== "")
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => set(key, null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DBE7FB] bg-[#F5F9FF] py-1 pl-2.5 pr-2 text-[12px] font-semibold text-[#0e62d8] transition hover:bg-[#E8F1FE]"
                data-testid="dealer-sale-opportunity-chip"
              >
                {chipLabel(key, String(filters[key]))}
                <span aria-hidden="true" className="text-[13px] leading-none">×</span>
                <span className="sr-only">Remover filtro</span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-1 text-[12px] font-semibold text-[#667085] underline underline-offset-2 transition hover:text-[#1D2440]"
            data-testid="dealer-sale-opportunity-clear-filters"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}
