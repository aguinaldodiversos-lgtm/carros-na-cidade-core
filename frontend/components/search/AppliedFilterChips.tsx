"use client";

import { formatPricePublic } from "@/lib/public-contracts";
import type { AdsSearchFilters } from "../../lib/search/ads-search";

interface AppliedFilterChipsProps {
  filters: AdsSearchFilters;
  onRemove: (patch: Partial<AdsSearchFilters>) => void;
  onClearAll: () => void;
  lockedKeys?: Array<keyof AdsSearchFilters>;
  /**
   * Classes extras no container. Existe para o caller controlar espaçamento
   * SEM envolver o componente numa div — ele retorna `null` quando não há
   * filtro, e um wrapper com margem viraria espaço fantasma na vitrine
   * limpa. Default "" preserva o layout dos callers existentes.
   */
  className?: string;
}

/**
 * Wrapper sobre formatPricePublic — quando o valor é ausente devolve `null`
 * para que o caller (chip de filtro) renderize a copy semântica
 * ("qualquer valor") em vez de literal "R$ 0".
 *
 * P3-B 2026-05-25: substitui o `formatCurrency` local que retornava
 * "R$ 0" como fallback, criando ruído no smoke público.
 */
function formatChipPrice(value?: number) {
  if (value === undefined || value === null) return null;
  return formatPricePublic(value, { whenAbsent: "null" });
}

export function AppliedFilterChips({
  filters,
  onRemove,
  onClearAll,
  lockedKeys = [],
  className = "",
}: AppliedFilterChipsProps) {
  const locked = new Set<keyof AdsSearchFilters>(lockedKeys);

  const chips: Array<{
    key: string;
    label: string;
    remove: () => void;
    locked?: boolean;
  }> = [];

  if (filters.q) {
    chips.push({
      key: "q",
      label: `Busca: ${filters.q}`,
      remove: () => onRemove({ q: undefined, page: 1 }),
      locked: locked.has("q"),
    });
  }

  if (filters.brand) {
    chips.push({
      key: "brand",
      label: `Marca: ${filters.brand}`,
      remove: () => onRemove({ brand: undefined, model: undefined, page: 1 }),
      locked: locked.has("brand"),
    });
  }

  if (filters.model) {
    chips.push({
      key: "model",
      label: `Modelo: ${filters.model}`,
      remove: () => onRemove({ model: undefined, page: 1 }),
      locked: locked.has("model"),
    });
  }

  if (filters.city) {
    chips.push({
      key: "city",
      label: `Cidade: ${filters.city}`,
      remove: () =>
        onRemove({
          city: undefined,
          city_id: undefined,
          city_slug: undefined,
          state: undefined,
          page: 1,
        }),
      locked: locked.has("city") || locked.has("city_slug") || locked.has("city_id"),
    });
  }

  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    const minLabel = formatChipPrice(filters.min_price) ?? "qualquer valor";
    const maxLabel =
      filters.max_price !== undefined ? ` até ${formatChipPrice(filters.max_price)}` : " ou mais";
    chips.push({
      key: "price",
      label: `Preço: ${minLabel}${maxLabel}`,
      remove: () =>
        onRemove({
          min_price: undefined,
          max_price: undefined,
          page: 1,
        }),
    });
  }

  if (filters.year_min !== undefined || filters.year_max !== undefined) {
    chips.push({
      key: "year",
      label: `Ano: ${filters.year_min || "..."} até ${filters.year_max || "..."}`,
      remove: () =>
        onRemove({
          year_min: undefined,
          year_max: undefined,
          page: 1,
        }),
    });
  }

  if (filters.mileage_max !== undefined) {
    chips.push({
      key: "mileage_max",
      label: `Km até ${filters.mileage_max.toLocaleString("pt-BR")}`,
      remove: () => onRemove({ mileage_max: undefined, page: 1 }),
    });
  }

  if (filters.fuel_type) {
    chips.push({
      key: "fuel_type",
      label: `Combustível: ${filters.fuel_type}`,
      remove: () => onRemove({ fuel_type: undefined, page: 1 }),
      locked: locked.has("fuel_type"),
    });
  }

  if (filters.transmission) {
    chips.push({
      key: "transmission",
      label: `Câmbio: ${filters.transmission}`,
      remove: () => onRemove({ transmission: undefined, page: 1 }),
      locked: locked.has("transmission"),
    });
  }

  if (filters.body_type) {
    chips.push({
      key: "body_type",
      label: `Carroceria: ${filters.body_type}`,
      remove: () => onRemove({ body_type: undefined, page: 1 }),
      locked: locked.has("body_type"),
    });
  }

  if (filters.below_fipe === true) {
    chips.push({
      key: "below_fipe",
      label: "Abaixo da FIPE",
      remove: () => onRemove({ below_fipe: undefined, page: 1 }),
      locked: locked.has("below_fipe"),
    });
  }

  // Filtros canônicos da Fase 3. Faltavam aqui pelo mesmo motivo que
  // faltavam no hasFilters do catálogo, no countQuery e na whitelist da
  // cache key: entraram numa fase e ninguém varreu os consumidores.
  // Rótulos espelham o texto dos controles da sidebar (FilterSidebar) —
  // o visitante tem que reconhecer o chip como "aquilo que eu cliquei".
  if (filters.seller_kind === "dealer" || filters.seller_kind === "private") {
    chips.push({
      key: "seller_kind",
      label: filters.seller_kind === "dealer" ? "Lojas" : "Particulares",
      remove: () => onRemove({ seller_kind: undefined, page: 1 }),
      locked: locked.has("seller_kind"),
    });
  }

  if (filters.opportunity === true) {
    chips.push({
      key: "opportunity",
      label: "Oportunidades",
      remove: () => onRemove({ opportunity: undefined, page: 1 }),
      locked: locked.has("opportunity"),
    });
  }

  // priority_tier é a camada comercial (4=Destaque, 3=Pro, 2=Start,
  // 1=Grátis). A sidebar só expõe o chip "Destaques" (tier 4), mas a URL
  // aceita 1..4 — rotulamos os outros pelo nome da camada em vez de
  // mostrar "priority_tier: 2", que não significa nada para o visitante.
  if (filters.priority_tier !== undefined) {
    const tierLabels: Record<number, string> = {
      4: "Destaques",
      3: "Lojista Pro",
      2: "Lojista Start",
      1: "Anúncios grátis",
    };
    const label = tierLabels[filters.priority_tier];
    if (label) {
      chips.push({
        key: "priority_tier",
        label,
        remove: () => onRemove({ priority_tier: undefined, page: 1 }),
        locked: locked.has("priority_tier"),
      });
    }
  }

  const removableChips = chips.filter((chip) => !chip.locked);

  if (chips.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trimEnd()}>
      {chips.map((chip) =>
        chip.locked ? (
          <span
            key={chip.key}
            className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700"
          >
            {chip.label}
          </span>
        ) : (
          <button
            key={chip.key}
            type="button"
            onClick={chip.remove}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            {chip.label} ×
          </button>
        )
      )}

      {removableChips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
