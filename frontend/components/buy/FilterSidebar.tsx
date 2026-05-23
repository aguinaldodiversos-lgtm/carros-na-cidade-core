"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";

import { useNearbyRegionRedirect } from "@/hooks/useNearbyRegionRedirect";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import { slugToRegionHref } from "@/lib/regions/ancora-url";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { formatTotal, type BrandFacet, type BuyCityContext } from "@/lib/buy/catalog-helpers";

/**
 * Sidebar de filtros do catálogo. Briefing 2026-05-22 — "Atualizar
 * página Comprar/Catálogo conforme base visual obrigatória":
 *
 *   "Complexidade dentro dos filtros; simplicidade na vitrine."
 *
 * Seções na ordem do briefing (item 8):
 *   1. Ofertas    — chips Destaques / Oportunidades / Abaixo da FIPE
 *   2. Vendedor   — chips Lojas / Particulares (mutuamente exclusivos)
 *   3. Localização— Ver carros perto de mim + Estado/Região/Cidade
 *   4. Marca / Modelo / Preço / Ano / KM / Câmbio / Combustível /
 *      Carroceria / Opcionais / Cor / Apenas anúncios com foto
 *
 * Tokens do DS (cnc-*) em vez de slate / blue hardcoded. Aside
 * "Quer vender seu carro?" removido — Anuncie grátis já está no
 * header global e no `PublicFooter` de 6 colunas.
 *
 * `Opcionais` e `Apenas anúncios com foto` são UI presente mas
 * desabilitada ("em breve") porque `features[]` e `has_photo` ainda
 * não fazem parte de `AdsSearchFilters` — habilitam quando o backend
 * aceitar.
 */

type SelectOption = { label: string; value: string };

type FilterSidebarProps = {
  filters: AdsSearchFilters;
  city: BuyCityContext;
  brandOptions: SelectOption[];
  modelOptions: SelectOption[];
  popularBrands: BrandFacet[];
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  onClear: () => void;
  /**
   * Quando true, exibe o CTA inferior "Ver N ofertas" que confirma a
   * seleção e fecha a sheet. Useful no painel mobile. No desktop a
   * sidebar é persistente e o CTA é redundante.
   */
  showApplyCta?: boolean;
  /** Callback do botão "Ver N ofertas" (default: noop). */
  onApply?: () => void;
  /**
   * Flag REGIONAL_PAGE_ENABLED — gate para que o link "Ver carros perto
   * de mim" use o hook geo apontando para a Regional (default). Quando
   * false, o hook cai para `/carros-em/[slug]`.
   */
  regionalEnabled?: boolean;
  className?: string;
};

const PRICE_RANGES: SelectOption[] = [
  { label: "Qualquer preço", value: "" },
  { label: "Até R$ 40.000", value: "40000" },
  { label: "Até R$ 60.000", value: "60000" },
  { label: "Até R$ 80.000", value: "80000" },
  { label: "Até R$ 100.000", value: "100000" },
  { label: "Até R$ 150.000", value: "150000" },
  { label: "Até R$ 200.000", value: "200000" },
  { label: "Até R$ 300.000", value: "300000" },
];

const BODY_TYPES: SelectOption[] = [
  { label: "Todas carrocerias", value: "" },
  { label: "SUV", value: "SUV" },
  { label: "Sedã", value: "Sedan" },
  { label: "Hatch", value: "Hatch" },
  { label: "Picape", value: "Picape" },
  { label: "Utilitário", value: "Utilitario" },
  { label: "Esportivo", value: "Esportivo" },
];

const FUEL_TYPES: SelectOption[] = [
  { label: "Todos combustíveis", value: "" },
  { label: "Flex", value: "Flex" },
  { label: "Gasolina", value: "Gasolina" },
  { label: "Diesel", value: "Diesel" },
  { label: "Híbrido", value: "Hibrido" },
  { label: "Elétrico", value: "Eletrico" },
];

const TRANSMISSION_TYPES: SelectOption[] = [
  { label: "Todos câmbios", value: "" },
  { label: "Automático", value: "Automatico" },
  { label: "Manual", value: "Manual" },
  { label: "CVT", value: "CVT" },
  { label: "Automatizado", value: "Automatizado" },
];

const COLOR_OPTIONS: SelectOption[] = [
  { label: "Todas cores", value: "" },
  { label: "Branco", value: "Branco" },
  { label: "Preto", value: "Preto" },
  { label: "Prata", value: "Prata" },
  { label: "Cinza", value: "Cinza" },
  { label: "Vermelho", value: "Vermelho" },
  { label: "Azul", value: "Azul" },
];

const OPCIONAIS = [
  "Ar-condicionado",
  "Direção elétrica",
  "Multimídia",
  "Câmera de ré",
  "Sensor de estacionamento",
  "Teto solar",
  "Bancos em couro",
  "Faróis de LED",
];

function FieldGroup({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-cnc-muted"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-cnc-muted-soft">{hint}</p> : null}
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-cnc-text-strong">
      {children}
    </h3>
  );
}

const selectClasses =
  "h-11 w-full rounded-xl border border-cnc-line bg-cnc-surface px-3 text-[14px] font-medium text-cnc-text-strong shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

const inputClasses = selectClasses;

const chipBase =
  "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold transition";

function chipClass(active: boolean): string {
  return active
    ? `${chipBase} border border-primary bg-primary text-white`
    : `${chipBase} border border-cnc-line bg-cnc-bg text-cnc-text hover:border-primary/40 hover:bg-cnc-surface hover:text-primary`;
}

export function FilterSidebar({
  filters,
  city,
  brandOptions,
  modelOptions,
  popularBrands,
  totalResults,
  onPatch,
  onClear,
  showApplyCta = false,
  onApply,
  regionalEnabled = false,
  className = "",
}: FilterSidebarProps) {
  const router = useRouter();
  const { trigger: triggerGeo, state: geoState } = useNearbyRegionRedirect({ regionalEnabled });

  const stateOptions = useMemo<SelectOption[]>(
    () => [
      { label: "Todos os estados", value: "" },
      ...BRAZIL_UFS.map((uf) => ({ label: `${uf.label} (${uf.value})`, value: uf.value })),
    ],
    []
  );

  const currentUf = (filters.state || city.state || "").toUpperCase();
  const currentCitySlug = filters.city_slug || city.slug || "";
  const currentCityName = city.name || "";

  const handleStateChange = useCallback(
    (uf: string) => {
      if (!uf) {
        router.push("/comprar");
        return;
      }
      router.push(`/carros-usados/${uf.toLowerCase()}`);
    },
    [router]
  );

  const handleYearMin = useCallback(
    (value: string) => {
      const parsed = value.trim() ? Number(value) : undefined;
      onPatch({ year_min: Number.isFinite(parsed) ? parsed : undefined, page: 1 });
    },
    [onPatch]
  );

  const handleYearMax = useCallback(
    (value: string) => {
      const parsed = value.trim() ? Number(value) : undefined;
      onPatch({ year_max: Number.isFinite(parsed) ? parsed : undefined, page: 1 });
    },
    [onPatch]
  );

  const geoLocating = geoState.kind === "locating" || geoState.kind === "redirecting";

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-2xl border border-cnc-line bg-cnc-surface shadow-card">
        <div className="flex items-center justify-between border-b border-cnc-line px-5 py-4">
          <h2 className="text-base font-extrabold text-cnc-text-strong">Filtros</h2>
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-primary transition hover:text-primary-strong"
          >
            Limpar filtros
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* 1. OFERTAS — chips Destaques / Oportunidades / Abaixo da FIPE */}
          <section className="space-y-2" aria-labelledby="filter-ofertas">
            <SectionHeading>
              <span id="filter-ofertas">Ofertas</span>
            </SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={filters.priority_tier === 4}
                onClick={() =>
                  onPatch({
                    priority_tier: filters.priority_tier === 4 ? undefined : 4,
                    page: 1,
                  })
                }
                className={chipClass(filters.priority_tier === 4)}
              >
                Destaques
              </button>
              <button
                type="button"
                aria-pressed={filters.opportunity === true}
                onClick={() =>
                  onPatch({
                    opportunity: filters.opportunity === true ? undefined : true,
                    page: 1,
                  })
                }
                className={chipClass(filters.opportunity === true)}
              >
                Oportunidades
              </button>
              <button
                type="button"
                aria-pressed={filters.below_fipe === true}
                onClick={() =>
                  onPatch({
                    below_fipe: filters.below_fipe === true ? undefined : true,
                    page: 1,
                  })
                }
                className={chipClass(filters.below_fipe === true)}
              >
                Abaixo da FIPE
              </button>
            </div>
          </section>

          {/* 2. VENDEDOR — chips Lojas / Particulares (mutex via seller_kind) */}
          <section className="space-y-2" aria-labelledby="filter-vendedor">
            <SectionHeading>
              <span id="filter-vendedor">Vendedor</span>
            </SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={filters.seller_kind === "dealer"}
                onClick={() =>
                  onPatch({
                    seller_kind: filters.seller_kind === "dealer" ? undefined : "dealer",
                    page: 1,
                  })
                }
                className={chipClass(filters.seller_kind === "dealer")}
              >
                Lojas
              </button>
              <button
                type="button"
                aria-pressed={filters.seller_kind === "private"}
                onClick={() =>
                  onPatch({
                    seller_kind: filters.seller_kind === "private" ? undefined : "private",
                    page: 1,
                  })
                }
                className={chipClass(filters.seller_kind === "private")}
              >
                Particulares
              </button>
            </div>
          </section>

          {/* 3. LOCALIZAÇÃO — geo + Estado + atalhos contextuais Região/Cidade */}
          <section className="space-y-3" aria-labelledby="filter-localizacao">
            <SectionHeading>
              <span id="filter-localizacao">Localização</span>
            </SectionHeading>

            <button
              type="button"
              onClick={triggerGeo}
              disabled={geoLocating}
              data-testid="sidebar-nearby-region-button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2.5 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary-soft/80 disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
                <circle cx="12" cy="9" r="2.2" />
              </svg>
              {geoLocating ? "Localizando…" : "Ver carros perto de mim"}
            </button>

            <FieldGroup label="Estado" htmlFor="fs-state">
              <select
                id="fs-state"
                value={currentUf}
                onChange={(event) => handleStateChange(event.target.value)}
                className={selectClasses}
              >
                {stateOptions.map((opt) => (
                  <option key={`fs-state-${opt.value || "all"}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/*
              Região e Cidade são atalhos contextuais quando há cidade
              na rota atual. Sem fetch extra: usamos o slug que o SSR
              já passou e geramos as URLs canônicas (regiao/* e
              carros-em/*). Quando a página é estadual sem cidade
              ativa, escondemos os atalhos para não exibir Selects
              vazios.
            */}
            {currentCitySlug ? (
              <FieldGroup label="Região">
                <Link
                  href={slugToRegionHref(currentCitySlug)}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-cnc-line bg-cnc-surface px-3 py-2.5 text-sm font-semibold text-primary transition hover:border-primary"
                  data-testid="sidebar-region-link"
                >
                  Região de {currentCityName || currentCitySlug}
                  <span aria-hidden="true">→</span>
                </Link>
              </FieldGroup>
            ) : null}

            {currentCitySlug ? (
              <FieldGroup label="Cidade">
                <Link
                  href={`/carros-em/${encodeURIComponent(currentCitySlug)}`}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-cnc-line bg-cnc-surface px-3 py-2.5 text-sm font-semibold text-primary transition hover:border-primary"
                  data-testid="sidebar-city-link"
                >
                  Apenas {currentCityName || currentCitySlug}
                  <span aria-hidden="true">→</span>
                </Link>
              </FieldGroup>
            ) : null}
          </section>

          {/* 4+. CAMPOS PADRÃO de busca */}
          <FieldGroup label="Marca" htmlFor="fs-brand">
            <select
              id="fs-brand"
              value={filters.brand || ""}
              onChange={(event) =>
                onPatch({ brand: event.target.value || undefined, model: undefined, page: 1 })
              }
              className={selectClasses}
            >
              {brandOptions.map((opt) => (
                <option key={`fs-brand-${opt.value}`} value={opt.value}>
                  {opt.label || "Todas"}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Modelo" htmlFor="fs-model">
            <select
              id="fs-model"
              value={filters.model || ""}
              onChange={(event) => onPatch({ model: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {modelOptions.map((opt) => (
                <option key={`fs-model-${opt.value}`} value={opt.value}>
                  {opt.label || "Todos"}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Preço" htmlFor="fs-price">
            <select
              id="fs-price"
              value={String(filters.max_price || "")}
              onChange={(event) =>
                onPatch({
                  max_price: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                })
              }
              className={selectClasses}
            >
              {PRICE_RANGES.map((opt) => (
                <option key={`fs-price-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Ano">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1980}
                max={2030}
                placeholder="De"
                aria-label="Ano mínimo"
                value={filters.year_min ?? ""}
                onChange={(event) => handleYearMin(event.target.value)}
                className={inputClasses}
              />
              <input
                type="number"
                inputMode="numeric"
                min={1980}
                max={2030}
                placeholder="Até"
                aria-label="Ano máximo"
                value={filters.year_max ?? ""}
                onChange={(event) => handleYearMax(event.target.value)}
                className={inputClasses}
              />
            </div>
          </FieldGroup>

          <FieldGroup label="KM" htmlFor="fs-km">
            <select
              id="fs-km"
              value={String(filters.mileage_max || "")}
              onChange={(event) =>
                onPatch({
                  mileage_max: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                })
              }
              className={selectClasses}
            >
              <option value="">Qualquer km</option>
              <option value="20000">Até 20.000 km</option>
              <option value="40000">Até 40.000 km</option>
              <option value="60000">Até 60.000 km</option>
              <option value="100000">Até 100.000 km</option>
              <option value="150000">Até 150.000 km</option>
            </select>
          </FieldGroup>

          <FieldGroup label="Câmbio" htmlFor="fs-trans">
            <select
              id="fs-trans"
              value={filters.transmission || ""}
              onChange={(event) =>
                onPatch({ transmission: event.target.value || undefined, page: 1 })
              }
              className={selectClasses}
            >
              {TRANSMISSION_TYPES.map((opt) => (
                <option key={`fs-trans-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Combustível" htmlFor="fs-fuel">
            <select
              id="fs-fuel"
              value={filters.fuel_type || ""}
              onChange={(event) => onPatch({ fuel_type: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {FUEL_TYPES.map((opt) => (
                <option key={`fs-fuel-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Carroceria" htmlFor="fs-body">
            <select
              id="fs-body"
              value={filters.body_type || ""}
              onChange={(event) => onPatch({ body_type: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {BODY_TYPES.map((opt) => (
                <option key={`fs-body-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          {/* OPCIONAIS — UI presente mas inerte (backend ainda não
              aceita `features[]`). Marcada com hint "Em breve" para
              evitar expectativa de comportamento. */}
          <FieldGroup label="Opcionais" hint="Em breve — backend irá incorporar `features[]`.">
            <div className="grid grid-cols-1 gap-1.5">
              {OPCIONAIS.map((opt) => (
                <label
                  key={opt}
                  className="inline-flex cursor-not-allowed items-center gap-2 text-[13px] text-cnc-muted opacity-70"
                >
                  <input
                    type="checkbox"
                    disabled
                    aria-label={opt}
                    className="h-4 w-4 rounded border-cnc-line text-primary focus:ring-primary"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </FieldGroup>

          {/* COR — agora destravado (briefing item 8 lista no escopo). */}
          <FieldGroup label="Cor" htmlFor="fs-color">
            <select
              id="fs-color"
              value=""
              onChange={() => {
                /* Filtro de cor: o backend não consome `color` hoje;
                   mantemos o select habilitado para alinhar ao mockup
                   mas o submit não envia o valor. Quando o
                   ads-search aceitar `color`, basta dispatch via
                   onPatch. */
              }}
              className={selectClasses}
              aria-describedby="fs-color-hint"
            >
              {COLOR_OPTIONS.map((opt) => (
                <option key={`fs-color-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p id="fs-color-hint" className="text-[11px] text-cnc-muted-soft">
              Em breve — backend irá incorporar `color`.
            </p>
          </FieldGroup>

          {/* APENAS ANÚNCIOS COM FOTO — UI presente mas inerte (toggle
              visual). Quando o backend aceitar `has_photo`, basta
              dispatchar. */}
          <FieldGroup label="Apenas anúncios com foto">
            <label className="inline-flex cursor-not-allowed items-center gap-3 text-[13px] text-cnc-muted opacity-90">
              <input
                type="checkbox"
                disabled
                defaultChecked
                aria-label="Apenas anúncios com foto"
                className="h-4 w-4 rounded border-cnc-line text-primary focus:ring-primary"
              />
              Mostrar somente ofertas com fotos
            </label>
            <p className="text-[11px] text-cnc-muted-soft">
              Em breve — backend irá incorporar `has_photo`.
            </p>
          </FieldGroup>

          {/* Marcas populares — atalho secundário, mantido como aside
              de descoberta. Compacto, dentro da própria seção Marca. */}
          {popularBrands.length > 0 ? (
            <FieldGroup label="Marcas populares">
              <div className="flex flex-wrap gap-1.5">
                {popularBrands.slice(0, 8).map((item) => (
                  <button
                    key={`pop-${item.brand}`}
                    type="button"
                    onClick={() => onPatch({ brand: item.brand, model: undefined, page: 1 })}
                    className="inline-flex items-center gap-1 rounded-full border border-cnc-line bg-cnc-bg px-2.5 py-1 text-[12px] font-semibold text-cnc-text transition hover:border-primary/40 hover:bg-cnc-surface hover:text-primary"
                  >
                    {item.brand}
                    {item.total > 0 ? (
                      <span className="text-[11px] font-bold text-cnc-muted-soft">
                        {formatTotal(item.total)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </FieldGroup>
          ) : null}
        </div>

        {/* CTA inferior — visível só dentro do painel mobile (showApplyCta=true).
            Desktop: a sidebar é persistente e o CTA seria redundante. */}
        {showApplyCta ? (
          <div className="border-t border-cnc-line px-5 py-4">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
            >
              Ver {formatTotal(totalResults)} ofertas
            </button>
            <p className="mt-2 text-center text-[11px] text-cnc-muted-soft">{city.label}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
