"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DistanceRadiusSlider } from "@/components/buy/DistanceRadiusSlider";
import { useNearbyRegionRedirect } from "@/hooks/useNearbyRegionRedirect";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import { DEFAULT_RADIUS_KM, DISTANCE_OPTIONS_KM } from "@/lib/buy/regional-radius-config";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { formatTotal, type BrandFacet, type BuyCityContext } from "@/lib/buy/catalog-helpers";

/**
 * Sidebar de filtros do catálogo — redesign "painel-filtros v2" (2026-07-09).
 *
 * A CAMADA VISUAL segue o mock de referência (`painel-filtros.html`): cabeçalho
 * com ícone + "Limpar filtros" (refresh que gira), chips de Ofertas (multi),
 * segmentado de Vendedor (único), botão geo, Estado/Cidade lado a lado, o CARTÃO
 * AZUL de Distância com slider que trava em 25/50/75/100 km, e os campos de
 * veículo (Marca → Modelo dependente, Preço, Ano De/Até validado, KM, Câmbio,
 * Combustível, Carroceria).
 *
 * A LÓGICA é intocada: cada mudança chama `onPatch(patch)` (o pai converte em
 * `router.push` com a query string), o raio chama `onRadiusChange` (`?raio=`) e
 * `Limpar` chama `onClear`. Fonte de verdade continua sendo a URL — sem store.
 *
 * NOTA sobre "defaults visuais" do mock: o mock exibe "Destaques" e "Lojas"
 * ativos como estado ilustrativo. NÃO forçamos isso — ativar por padrão
 * esconderia todo o estoque não-destaque / de particulares na carga inicial
 * (quebraria a busca e o SEO da vitrine). Os chips refletem o estado REAL dos
 * filtros; o padrão é "nenhum ativo" (mostra tudo), e `Limpar` volta a isso.
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
  showApplyCta?: boolean;
  onApply?: () => void;
  regionalEnabled?: boolean;
  /** Raio atual (km) do bloco "Próximos". Alimenta o slider de Distância. */
  radiusKm?: number;
  /** Muda o raio de vizinhança (ação do usuário → `?raio=`). */
  onRadiusChange?: (km: number) => void;
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

const KM_RANGES: SelectOption[] = [
  { label: "Qualquer km", value: "" },
  { label: "Até 20.000 km", value: "20000" },
  { label: "Até 40.000 km", value: "40000" },
  { label: "Até 60.000 km", value: "60000" },
  { label: "Até 100.000 km", value: "100000" },
  { label: "Até 150.000 km", value: "150000" },
];

const BODY_TYPES: SelectOption[] = [
  { label: "Todas as carrocerias", value: "" },
  { label: "SUV", value: "SUV" },
  { label: "Sedã", value: "Sedan" },
  { label: "Hatch", value: "Hatch" },
  { label: "Picape", value: "Picape" },
  { label: "Utilitário", value: "Utilitario" },
  { label: "Esportivo", value: "Esportivo" },
];

const FUEL_TYPES: SelectOption[] = [
  { label: "Todos os combustíveis", value: "" },
  { label: "Flex", value: "Flex" },
  { label: "Gasolina", value: "Gasolina" },
  { label: "Diesel", value: "Diesel" },
  { label: "Híbrido", value: "Hibrido" },
  { label: "Elétrico", value: "Eletrico" },
];

const TRANSMISSION_TYPES: SelectOption[] = [
  { label: "Todos os câmbios", value: "" },
  { label: "Automático", value: "Automatico" },
  { label: "Manual", value: "Manual" },
  { label: "CVT", value: "CVT" },
  { label: "Automatizado", value: "Automatizado" },
];

/* ---------------------------------------------------------------- icons ---- */

type IconProps = { className?: string };
const svgBase = "fill-none stroke-current";

function FilterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M7 12h10M10 18h4" />
      <circle cx="7" cy="6" r="1.6" className="fill-current stroke-none" />
      <circle cx="15" cy="12" r="1.6" className="fill-current stroke-none" />
      <circle cx="11" cy="18" r="1.6" className="fill-current stroke-none" />
    </svg>
  );
}
function RefreshIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" />
    </svg>
  );
}
function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z" />
    </svg>
  );
}
function TagIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.4 7.2a2 2 0 0 1 0 2.6z" />
      <circle cx="7.5" cy="7.5" r="1.2" className="fill-current stroke-none" />
    </svg>
  );
}
function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function StoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 20v-6h6v6" />
    </svg>
  );
}
function PersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
function NavIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3L3 10.5l7 2.5 2.5 7z" />
    </svg>
  );
}
function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function BrandIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z" /><circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}
function ModelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 16l1.4-4.2A2 2 0 0 1 8.3 10.5h7.4a2 2 0 0 1 1.9 1.3L19 16M4 16h16v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function PriceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.9-2.6 2s1 1.7 2.6 2 2.7.8 2.7 2.1-1.2 2.1-2.7 2.1c-1.2 0-2.2-.6-2.7-1.5M12 6.5v11" />
    </svg>
  );
}
function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
function KmIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15a8 8 0 0 1 16 0" /><path d="M12 15l4-4" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.3" className="fill-current stroke-none" />
    </svg>
  );
}
function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 5v14M12 5v14M18 5v14" />
      <circle cx="6" cy="8" r="1.6" /><circle cx="12" cy="16" r="1.6" /><circle cx="18" cy="8" r="1.6" />
    </svg>
  );
}
function FuelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15M4 21h11" />
      <path d="M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" strokeLinecap="round" /><path d="M7 8h5" />
    </svg>
  );
}
function BodyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14l1.6-4.4A2 2 0 0 1 6.5 8.3h6l4 1.4 3 1.3a2 2 0 0 1 1.5 1.9V15a1 1 0 0 1-1 1h-1.2M3 14v1a1 1 0 0 0 1 1h1.2M8.8 16h6.4" />
      <circle cx="7" cy="16" r="1.8" /><circle cx="17" cy="16" r="1.8" />
    </svg>
  );
}
function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function RadarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${svgBase} ${className ?? ""}`} strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" className="fill-current stroke-none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------- primitives -- */

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={`mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-cnc-muted ${className ?? ""}`}>
      {children}
    </p>
  );
}

const fieldSelectClasses =
  "h-[52px] w-full appearance-none rounded-xl border border-cnc-line-strong bg-cnc-surface pr-10 text-[15px] font-medium text-cnc-text-strong outline-none transition hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

function SelectField({
  label,
  id,
  value,
  onChange,
  options,
  lead,
  disabled,
  testId,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  lead?: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-cnc-muted">
        {label}
      </label>
      <div className="relative">
        {lead ? (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {lead}
          </span>
        ) : null}
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
          className={`${fieldSelectClasses} ${lead ? "pl-11" : "pl-4"}`}
        >
          {options.map((opt) => (
            <option key={`${id}-${opt.value || "all"}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
          <ChevronDownIcon />
        </span>
      </div>
    </div>
  );
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
  radiusKm,
  onRadiusChange,
  className = "",
}: FilterSidebarProps) {
  const router = useRouter();
  const { trigger: triggerGeo, state: geoState } = useNearbyRegionRedirect({ regionalEnabled });
  const [clearSpin, setClearSpin] = useState(false);

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

  // Anos: De/Até como dropdowns (mock de referência) com validação De ≤ Até.
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let y = now + 1; y >= 1990; y -= 1) years.push(y);
    return years;
  }, []);

  const yearMinOptions = useMemo<SelectOption[]>(
    () => [
      { label: "De", value: "" },
      ...yearOptions
        .filter((y) => !filters.year_max || y <= filters.year_max)
        .map((y) => ({ label: String(y), value: String(y) })),
    ],
    [yearOptions, filters.year_max]
  );

  const yearMaxOptions = useMemo<SelectOption[]>(
    () => [
      { label: "Até", value: "" },
      ...yearOptions
        .filter((y) => !filters.year_min || y >= filters.year_min)
        .map((y) => ({ label: String(y), value: String(y) })),
    ],
    [yearOptions, filters.year_min]
  );

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
      const min = value.trim() ? Number(value) : undefined;
      const patch: Partial<AdsSearchFilters> = { year_min: min, page: 1 };
      // Validação: se De ultrapassa o Até atual, sobe o Até junto (nunca De > Até).
      if (min && filters.year_max && filters.year_max < min) patch.year_max = min;
      onPatch(patch);
    },
    [onPatch, filters.year_max]
  );

  const handleYearMax = useCallback(
    (value: string) => {
      const max = value.trim() ? Number(value) : undefined;
      onPatch({ year_max: max, page: 1 });
    },
    [onPatch]
  );

  const handleClear = useCallback(() => {
    setClearSpin(true);
    window.setTimeout(() => setClearSpin(false), 550);
    onClear();
  }, [onClear]);

  const geoLocating = geoState.kind === "locating" || geoState.kind === "redirecting";
  const showDistance = Boolean(currentCitySlug && onRadiusChange);

  const chipBase =
    "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[11px] border px-3 py-2.5 text-[14px] font-semibold transition motion-reduce:transition-none [&>svg]:h-[17px] [&>svg]:w-[17px]";
  const chipOn = "border-primary bg-primary-soft text-primary shadow-[inset_0_0_0_1px_var(--tw-shadow-color)] shadow-primary";
  const chipOff = "border-cnc-line-strong bg-cnc-surface text-cnc-muted hover:border-primary/40";
  const chipCls = (on: boolean) => `${chipBase} ${on ? chipOn : chipOff}`;

  const segBase =
    "inline-flex items-center justify-center gap-2.5 rounded-[11px] border px-3 py-3.5 text-[15px] font-semibold transition motion-reduce:transition-none [&>svg]:h-[18px] [&>svg]:w-[18px]";
  const segCls = (on: boolean) => `${segBase} ${on ? chipOn : chipOff}`;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="overflow-hidden rounded-2xl border border-cnc-line bg-cnc-surface shadow-card">
        {/* -------------------------------------------------------- header -- */}
        <div className="flex items-center gap-3.5 border-b border-cnc-line px-5 py-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-cnc-line-strong text-primary [&>svg]:h-[22px] [&>svg]:w-[22px]">
            <FilterIcon />
          </span>
          <h2 className="text-[22px] font-bold tracking-[-0.01em] text-cnc-text-strong">Filtros</h2>
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-[15px] font-semibold text-primary transition hover:text-primary-strong motion-reduce:transition-none"
          >
            Limpar filtros
            <RefreshIcon
              className={`h-[18px] w-[18px] transition-transform duration-500 motion-reduce:transition-none ${clearSpin ? "rotate-[360deg]" : ""}`}
            />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* ----------------------------------------------------- ofertas -- */}
          <section aria-labelledby="filter-ofertas">
            <Eyebrow>
              <span id="filter-ofertas">Ofertas</span>
            </Eyebrow>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                aria-pressed={filters.priority_tier === 4}
                onClick={() => onPatch({ priority_tier: filters.priority_tier === 4 ? undefined : 4, page: 1 })}
                className={chipCls(filters.priority_tier === 4)}
              >
                <StarIcon /> Destaques
              </button>
              <button
                type="button"
                aria-pressed={filters.opportunity === true}
                onClick={() => onPatch({ opportunity: filters.opportunity === true ? undefined : true, page: 1 })}
                className={chipCls(filters.opportunity === true)}
              >
                <TagIcon /> Oportunidades
              </button>
              <button
                type="button"
                aria-pressed={filters.below_fipe === true}
                onClick={() => onPatch({ below_fipe: filters.below_fipe === true ? undefined : true, page: 1 })}
                className={chipCls(filters.below_fipe === true)}
              >
                <ShieldIcon /> Abaixo da FIPE
              </button>
            </div>
          </section>

          {/* ---------------------------------------------------- vendedor -- */}
          <section aria-labelledby="filter-vendedor">
            <Eyebrow>
              <span id="filter-vendedor">Vendedor</span>
            </Eyebrow>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={filters.seller_kind === "dealer"}
                onClick={() => onPatch({ seller_kind: filters.seller_kind === "dealer" ? undefined : "dealer", page: 1 })}
                className={segCls(filters.seller_kind === "dealer")}
              >
                <StoreIcon /> Lojas
              </button>
              <button
                type="button"
                aria-pressed={filters.seller_kind === "private"}
                onClick={() => onPatch({ seller_kind: filters.seller_kind === "private" ? undefined : "private", page: 1 })}
                className={segCls(filters.seller_kind === "private")}
              >
                <PersonIcon /> Particulares
              </button>
            </div>
          </section>

          <div className="h-px bg-cnc-line" />

          {/* ------------------------------------------------- localização -- */}
          <section className="space-y-4" aria-labelledby="filter-localizacao">
            <div>
              <Eyebrow>
                <span id="filter-localizacao">Localização</span>
              </Eyebrow>
              <button
                type="button"
                onClick={triggerGeo}
                disabled={geoLocating}
                data-testid="sidebar-nearby-region-button"
                className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-primary/30 bg-cnc-surface px-3 py-4 text-[16px] font-bold text-primary transition hover:border-primary hover:bg-primary-soft disabled:opacity-60 motion-reduce:transition-none [&>svg]:h-[19px] [&>svg]:w-[19px]"
              >
                <NavIcon />
                {geoLocating ? "Localizando…" : "Ver carros perto de mim"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 min-[360px]:grid-cols-2">
              <SelectField
                label="Estado"
                id="fs-state"
                value={currentUf}
                onChange={handleStateChange}
                options={stateOptions}
                lead={<PinIcon />}
              />
              {currentCitySlug ? (
                <div className="space-y-2">
                  <p className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-cnc-muted">Cidade</p>
                  <Link
                    href={`/carros-em/${encodeURIComponent(currentCitySlug)}`}
                    data-testid="sidebar-city-link"
                    className="flex h-[52px] w-full items-center justify-between rounded-xl border border-cnc-line-strong bg-cnc-surface px-4 text-[15px] font-semibold text-primary transition hover:border-primary motion-reduce:transition-none"
                  >
                    Apenas {currentCityName || currentCitySlug}
                    <ChevronDownIcon className="h-[18px] w-[18px] -rotate-90 text-cnc-muted" />
                  </Link>
                </div>
              ) : null}
            </div>

            {/* --------------------------------------- distância (cartão) -- */}
            {showDistance ? (
              <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-[#f1f5ff] via-[#e7eeff] to-[#e1eaff] px-5 pb-5 pt-5">
                <svg className="pointer-events-none absolute bottom-0 right-0 top-0 w-[58%] opacity-55" viewBox="0 0 220 200" fill="none" aria-hidden="true">
                  <circle cx="130" cy="105" r="70" stroke="#9db4ea" strokeWidth="1.5" opacity=".5" />
                  <circle cx="130" cy="105" r="48" stroke="#8aa6e8" strokeWidth="1.5" opacity=".55" />
                  <circle cx="130" cy="105" r="26" fill="#c3d3f7" opacity=".5" />
                  <path d="M40 60 C90 40 150 70 200 40" stroke="#9db4ea" strokeWidth="1.5" strokeDasharray="4 5" opacity=".6" />
                  <path d="M60 150 C110 130 150 160 205 150" stroke="#9db4ea" strokeWidth="1.5" strokeDasharray="4 5" opacity=".5" />
                  <path d="M130 88a11 11 0 0 1 11 11c0 8-11 18-11 18s-11-10-11-18a11 11 0 0 1 11-11z" fill="#0e62d8" />
                  <circle cx="130" cy="99" r="4" fill="#fff" />
                </svg>

                <Eyebrow className="text-[#5b6b8a]">Distância (km)</Eyebrow>
                <div className="relative z-[1] mb-5 flex items-start gap-3.5">
                  <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-primary text-white shadow-[0_8px_24px_rgba(14,98,216,0.28)] [&>svg]:h-6 [&>svg]:w-6">
                    <RadarIcon />
                  </span>
                  <div>
                    <h3 className="mb-1 text-[18px] font-bold text-cnc-text-strong">Raio de busca</h3>
                    <p className="max-w-[230px] text-[13.5px] leading-snug text-[#5f6b82]">
                      Mostramos veículos perto de você e cidades vizinhas dentro do raio.
                    </p>
                  </div>
                </div>

                <DistanceRadiusSlider
                  stops={DISTANCE_OPTIONS_KM}
                  value={radiusKm ?? DEFAULT_RADIUS_KM}
                  defaultValue={DEFAULT_RADIUS_KM}
                  onChange={(km) => onRadiusChange?.(km)}
                  testId="sidebar-distance-slider"
                />
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------- veículo (campos) */}
          <SelectField
            label="Marca"
            id="fs-brand"
            value={filters.brand || ""}
            onChange={(v) => onPatch({ brand: v || undefined, model: undefined, page: 1 })}
            options={brandOptions}
            lead={<BrandIcon />}
          />

          <SelectField
            label="Modelo"
            id="fs-model"
            value={filters.model || ""}
            onChange={(v) => onPatch({ model: v || undefined, page: 1 })}
            options={modelOptions}
            lead={<ModelIcon />}
            disabled={!filters.brand}
          />

          <SelectField
            label="Preço"
            id="fs-price"
            value={String(filters.max_price || "")}
            onChange={(v) => onPatch({ max_price: v ? Number(v) : undefined, page: 1 })}
            options={PRICE_RANGES}
            lead={<PriceIcon />}
          />

          {/* Ano — De / Até (validação De ≤ Até via opções filtradas) */}
          <div className="space-y-2">
            <p className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-cnc-muted">Ano</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[17px] [&>svg]:w-[17px]">
                  <CalendarIcon />
                </span>
                <select
                  aria-label="Ano mínimo"
                  value={filters.year_min ?? ""}
                  onChange={(e) => handleYearMin(e.target.value)}
                  className={`${fieldSelectClasses} pl-11`}
                >
                  {yearMinOptions.map((opt) => (
                    <option key={`ymin-${opt.value || "all"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
                  <ChevronDownIcon />
                </span>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[17px] [&>svg]:w-[17px]">
                  <CalendarIcon />
                </span>
                <select
                  aria-label="Ano máximo"
                  value={filters.year_max ?? ""}
                  onChange={(e) => handleYearMax(e.target.value)}
                  className={`${fieldSelectClasses} pl-11`}
                >
                  {yearMaxOptions.map((opt) => (
                    <option key={`ymax-${opt.value || "all"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cnc-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">
                  <ChevronDownIcon />
                </span>
              </div>
            </div>
          </div>

          <SelectField
            label="KM"
            id="fs-km"
            value={String(filters.mileage_max || "")}
            onChange={(v) => onPatch({ mileage_max: v ? Number(v) : undefined, page: 1 })}
            options={KM_RANGES}
            lead={<KmIcon />}
          />

          <SelectField
            label="Câmbio"
            id="fs-trans"
            value={filters.transmission || ""}
            onChange={(v) => onPatch({ transmission: v || undefined, page: 1 })}
            options={TRANSMISSION_TYPES}
            lead={<GearIcon />}
          />

          <SelectField
            label="Combustível"
            id="fs-fuel"
            value={filters.fuel_type || ""}
            onChange={(v) => onPatch({ fuel_type: v || undefined, page: 1 })}
            options={FUEL_TYPES}
            lead={<FuelIcon />}
          />

          <SelectField
            label="Carroceria"
            id="fs-body"
            value={filters.body_type || ""}
            onChange={(v) => onPatch({ body_type: v || undefined, page: 1 })}
            options={BODY_TYPES}
            lead={<BodyIcon />}
          />

          {/* Marcas populares — atalho de descoberta (aditivo ao mock). */}
          {popularBrands.length > 0 ? (
            <div className="space-y-2">
              <p className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-cnc-muted">Marcas populares</p>
              <div className="flex flex-wrap gap-1.5">
                {popularBrands.slice(0, 8).map((item) => (
                  <button
                    key={`pop-${item.brand}`}
                    type="button"
                    onClick={() => onPatch({ brand: item.brand, model: undefined, page: 1 })}
                    className="inline-flex items-center gap-1 rounded-full border border-cnc-line bg-cnc-bg px-2.5 py-1 text-[12px] font-semibold text-cnc-text transition hover:border-primary/40 hover:bg-cnc-surface hover:text-primary motion-reduce:transition-none"
                  >
                    {item.brand}
                    {item.total > 0 ? (
                      <span className="text-[11px] font-bold text-cnc-muted-soft">{formatTotal(item.total)}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {showApplyCta ? (
          <div className="border-t border-cnc-line px-5 py-4">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong motion-reduce:transition-none"
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
