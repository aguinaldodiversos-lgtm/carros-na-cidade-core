"use client";

import { useState } from "react";
import {
  BODY_TYPE_OPTIONS,
  DEALER_SORT_OPTIONS,
  EMPTY_DEALER_FILTERS,
  PURCHASE_TIMEFRAME_OPTIONS,
  TRANSMISSION_OPTIONS,
  countActiveDealerFilters,
  type DealerOpportunityFilters,
  type DealerOpportunitySort,
} from "@/lib/purchase-intents/api";

/**
 * Filtros de "Compradores ativos".
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TODO CONTROLE AQUI ALTERA A QUERY DO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 * Cada `<select>` deste arquivo tem uma coluna correspondente em
 * `purchase_intents` e um `AND` correspondente em
 * `buildDealerFeedSource` (`purchase-intents.repository.js`). Nenhum filtra a
 * lista já carregada: trocar qualquer valor refaz a request desde a primeira
 * página, e a contagem do cabeçalho vem da MESMA consulta.
 *
 * Isso não é detalhe de implementação — é o que separa um filtro de um enfeite.
 * Filtrar no cliente daria um resultado que mente sobre o conjunto: "Manual"
 * mostraria os manuais das vinte procuras carregadas, não os da cidade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A REFERÊNCIA VISUAL TEM E ESTA BARRA NÃO
 * ════════════════════════════════════════════════════════════════════════════
 * COMBUSTÍVEL. `purchase_intents` não tem a coluna: o formulário do comprador
 * nunca pergunta. Um `<select>` de combustível aqui abriria, ofereceria "Flex,
 * Gasolina, Diesel…" e devolveria a lista inteira sem filtrar nada — o pior
 * tipo de controle, porque parece funcionar.
 *
 * FAIXA DE ANO, pela mesma razão: a procura não declara ano.
 *
 * No lugar deles entraram dois filtros que EXISTEM no domínio e que a referência
 * não previa: o tipo de procura (que é a distinção mais importante desta tela) e
 * o prazo de compra declarado — quem quer comprar "o quanto antes" é uma
 * oportunidade diferente de quem tem trinta dias.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A CIDADE É TEXTO, NÃO SELETOR
 * ════════════════════════════════════════════════════════════════════════════
 * O escopo territorial é resolvido no servidor a partir da loja
 * (`resolveDealerCityId`), e `parseDealerFeedFilters` não lê `city_id`. Um
 * `<select>` de cidade prometeria ao lojista consultar demanda de outras praças
 * — que é exatamente o que o backend recusa a fazer. Mostrar a cidade como
 * etiqueta fixa diz a verdade: "é aqui que estamos olhando".
 */

/** Um select rotulado. `""` significa "sem filtro" e é normalizado para `null`. */
function Select({
  id,
  label,
  value,
  options,
  allLabel = "Todos",
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  allLabel?: string;
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
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Campo de dinheiro do filtro de orçamento.
 *
 * Só dígitos. O backend aceita `\d+(\.\d{1,2})?` e responde 400 para o resto —
 * deixar passar "R$ 55.000" daqui transformaria um filtro num erro de tela.
 */
function MoneyField({
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
      <div className="relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#98a2b3]"
          aria-hidden="true"
        >
          R$
        </span>
        <input
          id={id}
          inputMode="numeric"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            onChange(digits === "" ? null : digits);
          }}
          className={`h-10 w-full rounded-lg border bg-white pl-8 pr-2.5 text-[13px] text-[#1D2440] outline-none transition placeholder:font-normal placeholder:text-[#B6C0D4] focus:border-[#0e62d8] focus:ring-1 focus:ring-[#0e62d8] ${
            active ? "border-[#0e62d8] font-semibold" : "border-[#E5E9F2]"
          }`}
        />
      </div>
    </div>
  );
}

const INTENT_TYPE_OPTIONS = [
  { value: "specific_model", label: "Compra específica" },
  { value: "open_category", label: "Categoria aberta" },
];

/** Os filtros que vivem atrás do botão "Mais filtros". */
const ADVANCED_KEYS: ReadonlyArray<keyof DealerOpportunityFilters> = [
  "purchase_timeframe",
  "budget_min",
  "budget_max",
];

const money = (value: string) => `R$ ${Number(value).toLocaleString("pt-BR")}`;

/** Rótulo legível de um filtro ativo, para o chip. */
function chipLabel(
  key: keyof DealerOpportunityFilters,
  value: string,
  brandOptions: ReadonlyArray<{ value: string; label: string }>
): string {
  const find = (options: ReadonlyArray<{ value: string; label: string }>) =>
    options.find((option) => option.value === value)?.label ?? value;

  switch (key) {
    case "intent_type":
      return find(INTENT_TYPE_OPTIONS);
    case "brand":
      return `Marca: ${find(brandOptions)}`;
    case "body_type":
      return `Carroceria: ${find(BODY_TYPE_OPTIONS)}`;
    case "transmission":
      return `Câmbio: ${find(TRANSMISSION_OPTIONS)}`;
    case "purchase_timeframe":
      return `Prazo: ${find(PURCHASE_TIMEFRAME_OPTIONS)}`;
    case "budget_min":
      return `A partir de ${money(value)}`;
    case "budget_max":
      return `Até ${money(value)}`;
    default:
      return value;
  }
}

export default function ActiveBuyerFilters({
  filters,
  sort,
  city,
  brandOptions,
  onChange,
  onSortChange,
}: {
  filters: DealerOpportunityFilters;
  sort: DealerOpportunitySort;
  /** Cidade da loja, como o feed a devolveu. Vazio antes da primeira resposta. */
  city: string;
  /** Marcas vistas no feed — derivadas dos dados, nunca de um catálogo fixo. */
  brandOptions: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: DealerOpportunityFilters) => void;
  onSortChange: (next: DealerOpportunitySort) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveDealerFilters(filters);
  const advancedCount = ADVANCED_KEYS.filter(
    (key) => filters[key] != null && String(filters[key]).trim() !== ""
  ).length;

  const set = (key: keyof DealerOpportunityFilters, value: string | null) =>
    onChange({ ...filters, [key]: value } as DealerOpportunityFilters);

  return (
    <section className="mb-5" data-testid="active-buyer-filters">
      <div className="rounded-2xl border border-[#e5eaf3] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-2.5 lg:gap-3">
          {/*
            A CIDADE. Primeiro item da barra, como na referência — mas é um
            `<p>`, não um `<select>`: ver o cabeçalho deste arquivo.
          */}
          {city ? (
            <div className="flex min-w-0 shrink-0 flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#667085]">Cidade</span>
              <p
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#E5E9F2] bg-[#F7F9FC] px-2.5 text-[13px] font-semibold text-[#475467]"
                data-testid="active-buyer-city-scope"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#98a2b3]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.6" />
                </svg>
                {city}
              </p>
            </div>
          ) : null}

          {/*
            Os PRIMÁRIOS. Escondidos no mobile (entram no painel do botão
            "Filtros") e inline a partir de `lg`, como na referência.
          */}
          <div
            className={`min-w-0 basis-full grid-cols-2 gap-2.5 sm:grid-cols-4 lg:min-w-0 lg:flex-1 lg:basis-0 lg:grid-cols-4 lg:gap-2.5 ${
              open ? "grid" : "hidden"
            } lg:grid`}
          >
            <Select
              id="buyer-filter-intent-type"
              label="Tipo de procura"
              value={filters.intent_type}
              options={INTENT_TYPE_OPTIONS}
              allLabel="Todos os tipos"
              onChange={(value) => set("intent_type", value)}
            />
            <Select
              id="buyer-filter-brand"
              label="Marca"
              value={filters.brand}
              options={brandOptions}
              allLabel="Todas as marcas"
              onChange={(value) => set("brand", value)}
            />
            <Select
              id="buyer-filter-body-type"
              label="Carroceria"
              value={filters.body_type}
              options={BODY_TYPE_OPTIONS}
              allLabel="Todas"
              onChange={(value) => set("body_type", value)}
            />
            <Select
              id="buyer-filter-transmission"
              label="Câmbio"
              value={filters.transmission}
              options={TRANSMISSION_OPTIONS}
              allLabel="Todos"
              onChange={(value) => set("transmission", value)}
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="active-buyer-filters-panel"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#E5E9F2] bg-white px-3 text-[13px] font-bold text-[#1D2440] transition hover:border-[#CFE0FB] hover:bg-[#F9FBFF]"
            data-testid="active-buyer-filters-toggle"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <span className="lg:hidden">Filtros</span>
            <span className="hidden lg:inline">Mais filtros</span>
            {/*
              A contagem conta o que está ESCONDIDO, e isso muda por largura: no
              mobile o botão guarda os sete filtros; no desktop, só os três
              avançados. Um número só ficaria errado numa das duas larguras —
              por isso são dois, cada um visível onde é verdade.
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
            <label htmlFor="active-buyer-sort" className="text-[11px] font-semibold text-[#667085]">
              Ordenar por
            </label>
            <select
              id="active-buyer-sort"
              value={sort}
              onChange={(event) => onSortChange(event.target.value as DealerOpportunitySort)}
              className="h-10 rounded-lg border border-[#E5E9F2] bg-white px-2.5 text-[13px] font-semibold text-[#1D2440] outline-none transition focus:border-[#0e62d8] focus:ring-1 focus:ring-[#0e62d8]"
              data-testid="active-buyer-sort"
            >
              {DEALER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/*
          AVANÇADOS. Montados SEMPRE no DOM, escondidos por CSS.

          Renderizar condicionalmente por breakpoint obrigaria a duplicar os
          primários (um bloco para mobile, outro para desktop), e dois `<select>`
          com o mesmo `id` e o mesmo rótulo confundem leitor de tela tanto quanto
          confundem teste. Com `display:none` o controle sai do fluxo E da ordem
          de tabulação, que é o comportamento correto para um painel fechado.
        */}
        <div
          id="active-buyer-filters-panel"
          className={`${open ? "block" : "hidden"} mt-4 border-t border-[#F2F4F7] pt-4`}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:gap-3">
            <Select
              id="buyer-filter-timeframe"
              label="Prazo de compra"
              value={filters.purchase_timeframe}
              options={PURCHASE_TIMEFRAME_OPTIONS}
              allLabel="Qualquer prazo"
              onChange={(value) => set("purchase_timeframe", value)}
            />
            <MoneyField
              id="buyer-filter-budget-min"
              label="Orçamento a partir de"
              value={filters.budget_min}
              placeholder="20.000"
              onChange={(value) => set("budget_min", value)}
            />
            <MoneyField
              id="buyer-filter-budget-max"
              label="Orçamento até"
              value={filters.budget_max}
              placeholder="120.000"
              onChange={(value) => set("budget_max", value)}
            />
          </div>
        </div>
      </div>

      {/* CHIPS — todos os filtros ativos, inclusive os do painel fechado. */}
      {activeCount > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(Object.keys(filters) as Array<keyof DealerOpportunityFilters>)
            .filter((key) => filters[key] != null && String(filters[key]).trim() !== "")
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => set(key, null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DBE7FB] bg-[#F5F9FF] py-1 pl-2.5 pr-2 text-[12px] font-semibold text-[#0e62d8] transition hover:bg-[#E8F1FE]"
                data-testid="active-buyer-chip"
              >
                {chipLabel(key, String(filters[key]), brandOptions)}
                <span aria-hidden="true" className="text-[13px] leading-none">
                  ×
                </span>
                <span className="sr-only">Remover filtro</span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => onChange(EMPTY_DEALER_FILTERS)}
            className="ml-1 text-[12px] font-semibold text-[#667085] underline underline-offset-2 transition hover:text-[#1D2440]"
            data-testid="active-buyer-clear-filters"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}
