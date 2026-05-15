import Link from "next/link";

import type { StateRegionSummary } from "@/lib/territory/fetch-state-regions";

/**
 * Bloco "Explore por região" da Página Estadual e da Home.
 *
 * Server component puro: recebe regiões já resolvidas via BFF (caller
 * decide quando fetcha, com que limite, e se a flag REGIONAL_PAGE_ENABLED
 * está ativa). Suprime-se quando `regions` é vazio — sem caixa promissora
 * sem conteúdo.
 *
 * Hierarquia esperada na página:
 *   - Header estadual
 *   - **Bloco "Explore por região"** ← este componente
 *   - Filtros + grade estadual
 *   - SEO blocks
 *
 * Cada card mostra:
 *   - Nome da região (Região de Atibaia)
 *   - Cidades incluídas (primeiras 3 + "e mais N")
 *   - adsCount + featuredCount quando disponíveis
 *   - CTA "Ver ofertas da região →"
 *
 * Política territorial: NUNCA inclui "Brasil" ou links nacionais.
 * Quando o flag regional estiver OFF em produção, o caller não monta
 * este bloco — não há fallback nacional aqui.
 */

interface StateRegionsBlockProps {
  /** Nome do estado em foco (ex: "São Paulo"). Vai no título do bloco. */
  stateName: string;
  /** Regiões retornadas pelo BFF. Bloco oculto se vazio. */
  regions: StateRegionSummary[];
  /**
   * Limite visual de cards (default 8). Útil em contextos onde o bloco
   * vai na Home (4–6 cards) vs Página Estadual (8–12 cards).
   */
  maxCards?: number;
  /** Variante visual: "grid" (default, página estadual) ou "row" (Home, mais compacta). */
  variant?: "grid" | "row";
}

function formatAdsCount(count: number, featured: number): string | null {
  if (count <= 0) return null;
  const offers = `${count} ${count === 1 ? "oferta" : "ofertas"}`;
  if (featured > 0) return `${offers} · ${featured} em destaque`;
  return offers;
}

function formatCityList(cityNames: string[]): string {
  if (cityNames.length === 0) return "";
  const preview = cityNames.slice(0, 3);
  const remaining = cityNames.length - preview.length;
  if (remaining <= 0) return preview.join(", ");
  return `${preview.join(", ")} e mais ${remaining}`;
}

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="ml-1 inline-block h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function StateRegionsBlock({
  stateName,
  regions,
  maxCards = 8,
  variant = "grid",
}: StateRegionsBlockProps) {
  if (!regions || regions.length === 0) return null;
  const visible = regions.slice(0, Math.max(1, maxCards));

  const gridClasses =
    variant === "row"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section
      aria-labelledby="state-regions-heading"
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      data-testid="state-regions-block"
    >
      <header className="mb-4 sm:mb-5">
        <h2
          id="state-regions-heading"
          className="text-lg font-extrabold tracking-tight text-cnc-text-strong sm:text-xl md:text-2xl"
        >
          Explore carros por região em {stateName}
        </h2>
        <p className="mt-1 text-sm text-cnc-muted sm:text-[15px]">
          Encontre ofertas próximas sem limitar a busca a uma única cidade.
        </p>
      </header>

      <ul className={gridClasses}>
        {visible.map((region) => {
          const adsLine = formatAdsCount(region.adsCount, region.featuredCount);
          const cityLine = formatCityList(region.cityNames);

          return (
            <li key={region.slug}>
              <Link
                href={region.href}
                className="group flex h-full flex-col justify-between rounded-xl border border-cnc-line bg-white p-4 transition hover:border-primary hover:shadow-card"
                data-testid={`state-region-card-${region.slug}`}
              >
                <div>
                  <h3 className="text-[15px] font-bold text-cnc-text-strong group-hover:text-primary sm:text-base">
                    {region.name}
                  </h3>
                  {cityLine ? (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-cnc-muted">
                      {cityLine}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-semibold text-cnc-text">
                    {adsLine ?? "Ver ofertas da região"}
                  </span>
                  <span className="font-semibold text-primary group-hover:underline">
                    Ver
                    <ArrowRight />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
