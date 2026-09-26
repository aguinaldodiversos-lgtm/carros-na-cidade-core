import { CatalogBreadcrumb } from "@/components/buy/CatalogBreadcrumb";
import {
  formatPriceRange,
  formatYearRange,
  pluralize,
  type ModelLandingCopy,
  type ModelLandingLink,
  type ModelLandingSummary,
} from "@/lib/buy/model-landing";

/**
 * Topo da landing cidade + marca + modelo — Server Component (zero JS).
 *
 * Compacto de propósito: sem banner, sem imagem decorativa, sem hero alto. O
 * comprador que buscou "Onix em Atibaia" tem de ver um Onix na primeira tela
 * do celular, então o topo é só o que identifica a página e resume o estoque:
 * breadcrumb, eyebrow, o ÚNICO h1, uma descrição curta e até quatro
 * indicadores — todos derivados dos anúncios devolvidos pelo motor.
 *
 * Indicador sem dado confiável não aparece (faixa de preço de página parcial,
 * "0 abaixo da FIPE"). Sem estoque, só identificação: nada de página "rica"
 * afirmando uma oferta que não existe.
 */

type ModelLandingHeaderProps = {
  copy: ModelLandingCopy;
  breadcrumbs: ModelLandingLink[];
  summary: ModelLandingSummary | null;
  /** O conjunto inclui anúncios de cidades vizinhas (decisão do motor). */
  regional: boolean;
  cityName: string;
};

function CarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 16.5 6.6 11a2 2 0 0 1 1.9-1.4h7a2 2 0 0 1 1.9 1.4l1.6 5.5" />
      <path d="M4 16.5h16v2.2a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-.7H7.2v.7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <circle cx="7.6" cy="14.2" r=".8" fill="currentColor" />
      <circle cx="16.4" cy="14.2" r=".8" fill="currentColor" />
    </svg>
  );
}

function BelowFipeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-emerald-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 4c-8 0-14 4.5-14 11.5V20" />
      <path d="M6 15.5C6 10 10.5 6 20 4c-.5 7.5-4.5 13-11 13.5" />
    </svg>
  );
}

function PriceTagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    >
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.4 7.2a2 2 0 0 1 0 2.6z" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

const STAT_CLASS =
  "flex min-h-[44px] items-center gap-2 rounded-xl border border-cnc-line bg-cnc-surface px-3 py-2 text-[13px] font-semibold leading-tight text-cnc-text-strong shadow-card sm:px-4 sm:text-sm";

export function ModelLandingHeader({
  copy,
  breadcrumbs,
  summary,
  regional,
  cityName,
}: ModelLandingHeaderProps) {
  const priceRange = summary ? formatPriceRange(summary.minPrice, summary.maxPrice) : null;
  const singlePrice =
    summary !== null && summary.minPrice !== null && summary.minPrice === summary.maxPrice;
  const yearRange = summary ? formatYearRange(summary.minYear, summary.maxYear) : null;
  const singleYear =
    summary !== null && summary.minYear !== null && summary.minYear === summary.maxYear;

  return (
    <header
      data-testid="model-landing-header"
      className="mx-auto w-full max-w-[1600px] px-4 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-5 lg:pt-6"
    >
      <CatalogBreadcrumb items={breadcrumbs} />

      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-primary sm:mt-4 sm:text-xs">
        {copy.eyebrow}
      </p>
      <h1 className="mt-1 text-[24px] font-extrabold leading-[1.15] tracking-tight text-cnc-text-strong sm:text-[30px] lg:text-[36px]">
        {copy.h1}
      </h1>

      {summary ? (
        <>
          <p className="mt-1.5 max-w-4xl text-[13.5px] leading-snug text-cnc-muted sm:mt-2 sm:text-[15px]">
            {copy.lead}
          </p>

          <ul
            aria-label="Resumo dos anúncios"
            data-testid="model-landing-stats"
            className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap sm:gap-3"
          >
            <li className={STAT_CLASS}>
              <CarIcon />
              <span>{pluralize(summary.total, "anúncio", "anúncios")}</span>
            </li>
            {summary.belowFipe ? (
              <li className={`${STAT_CLASS} text-emerald-700`}>
                <BelowFipeIcon />
                <span>
                  {new Intl.NumberFormat("pt-BR").format(summary.belowFipe)} abaixo da FIPE
                </span>
              </li>
            ) : null}
            {priceRange ? (
              <li className={STAT_CLASS}>
                <PriceTagIcon />
                <span>
                  <span className="sr-only sm:not-sr-only">
                    {singlePrice ? "Preço: " : "Faixa de preço: "}
                  </span>
                  {priceRange}
                </span>
              </li>
            ) : null}
            {yearRange ? (
              <li className={STAT_CLASS}>
                <CalendarIcon />
                <span>
                  <span className="sr-only sm:not-sr-only">{singleYear ? "Ano: " : "Anos: "}</span>
                  {yearRange}
                </span>
              </li>
            ) : null}
          </ul>

          {regional ? (
            <p
              data-testid="model-landing-regional-notice"
              className="mt-2 flex items-center gap-1.5 text-[12.5px] text-cnc-muted sm:mt-3 sm:text-[13px]"
            >
              <PinIcon />
              Resultados em {cityName} e cidades próximas dentro da região.
            </p>
          ) : null}
        </>
      ) : null}
    </header>
  );
}
