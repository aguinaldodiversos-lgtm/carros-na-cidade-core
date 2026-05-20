import "server-only";
import Link from "next/link";
import { slugToRegionHref } from "@/lib/regions/ancora-url";

/**
 * Bloco "Também encontramos veículos na região de [cidade]".
 *
 * Renderizado apenas quando a Página Cidade tem poucos anúncios E a flag
 * regional está ativa. Mantém a listagem principal limpa (só anúncios da
 * cidade) e oferece saída clara para o catálogo regional sem misturar
 * automaticamente carros de outras cidades — política territorial do
 * briefing (2026-05-20): a Página Cidade prova presença local; a Página
 * Regional resolve volume e liquidez.
 *
 * Server component (`"server-only"`) — a flag regional é server-only e
 * essa decisão deve ser tomada antes da hydration.
 */

interface AlsoInRegionBlockProps {
  slug: string;
  cityName: string;
  /** Total de anúncios encontrados na cidade. Usado só para microcopy. */
  cityAdsTotal?: number;
}

export function AlsoInRegionBlock({
  slug,
  cityName,
  cityAdsTotal = 0,
}: AlsoInRegionBlockProps) {
  if (!slug) return null;

  const headline = cityAdsTotal > 0
    ? `Poucas opções em ${cityName}?`
    : `Sem ofertas em ${cityName} no momento?`;

  return (
    <section
      aria-labelledby="also-in-region-heading"
      className="mx-auto w-full max-w-7xl px-3 pb-6 sm:px-6 lg:px-8"
      data-testid="also-in-region-block"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div className="min-w-0">
          <h2
            id="also-in-region-heading"
            className="text-base font-extrabold text-cnc-text-strong sm:text-lg"
          >
            {headline}
          </h2>
          <p className="mt-1 text-sm text-cnc-muted">
            Também encontramos veículos na região de {cityName} — cidades próximas
            no mesmo entorno.
          </p>
        </div>
        <Link
          href={slugToRegionHref(slug)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
          data-testid="also-in-region-cta"
          aria-label={`Ver veículos na região de ${cityName}`}
        >
          Ver veículos na região
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
