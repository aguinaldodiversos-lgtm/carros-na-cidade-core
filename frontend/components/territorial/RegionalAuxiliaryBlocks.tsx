import Link from "next/link";

import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";
import type { BrandCount, CityCount } from "@/lib/regions/regional-facets";

/**
 * Blocos auxiliares da Página Regional — renderizados DEPOIS do
 * `BuyMarketplacePageClient` para complementar o catálogo principal sem
 * competir visualmente com ele:
 *
 *   1. "Cidades nesta região" — chips com a cidade-base + members,
 *      cada chip leva para a Página Cidade canônica `/carros-em/[slug]`.
 *      Briefing: "Cidades incluídas nesta região".
 *   2. "Marcas frequentes em [cidade]" — chips de marcas agregadas da
 *      amostra atual, levam para `/carros-em/[slug]?brand=...` (mantém
 *      o usuário no contexto territorial canônico, não desce ao
 *      /comprar genérico).
 *   3. SEO blocks — 3 artigos curtos sobre a região (por que comprar,
 *      cidades próximas, como funciona o alcance regional). Texto
 *      indexável e útil para o leitor humano.
 *
 * Server component puro — sem state, sem listeners.
 */

interface RegionalAuxiliaryBlocksProps {
  base: RegionBase;
  members: RegionMember[];
  radiusKm: number;
  topBrands?: BrandCount[];
  cityCounts?: CityCount[];
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return "<1 km";
  return `${Math.round(km)} km`;
}

export function RegionalAuxiliaryBlocks({
  base,
  members,
  radiusKm,
  topBrands = [],
  cityCounts = [],
}: RegionalAuxiliaryBlocksProps) {
  const stateUF = base.state.toUpperCase();
  const stateHref = `/comprar/estado/${stateUF.toLowerCase()}`;
  const cityHref = `/carros-em/${encodeURIComponent(base.slug)}`;
  const memberCount = members.length;
  const memberPreviewNames = members.slice(0, 4).map((m) => m.name);
  const remainingMembers = Math.max(0, memberCount - memberPreviewNames.length);

  // Cidades: usa cityCounts (com contagem da amostra) quando disponível;
  // cai para a lista crua de members se a amostra não derivou contagem.
  const cityChips =
    cityCounts.length > 0
      ? cityCounts
      : [
          { slug: base.slug, name: base.name, count: 0, distance_km: null, is_base: true },
          ...members.map((m) => ({
            slug: m.slug,
            name: m.name,
            count: 0,
            distance_km: m.distance_km,
            is_base: false,
          })),
        ];
  const visibleCityChips = cityChips.slice(0, 12);
  const hasMoreCities = cityChips.length > visibleCityChips.length;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-8 pt-2 sm:px-6 lg:px-8">
      {memberCount > 0 && visibleCityChips.length > 0 && (
        <section
          aria-labelledby="regional-cities-heading"
          className="mb-6"
          data-testid="regional-cities-block"
        >
          <h2
            id="regional-cities-heading"
            className="mb-3 text-base font-bold text-cnc-text-strong sm:text-lg"
          >
            Cidades incluídas nesta região
          </h2>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {visibleCityChips.map((c) =>
              c.is_base ? (
                <span
                  key={`base-${c.slug}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-primary-soft px-3 text-sm font-semibold text-primary-strong sm:shrink"
                  title={`${c.name} — cidade base da região`}
                >
                  {c.name}
                  <span className="text-[10px] uppercase tracking-wide opacity-80">
                    base
                  </span>
                </span>
              ) : (
                <Link
                  key={`chip-${c.slug}`}
                  href={`/carros-em/${encodeURIComponent(c.slug)}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-sm font-medium text-cnc-text transition hover:border-primary hover:text-primary sm:shrink"
                  title={
                    c.distance_km != null
                      ? `${c.name} — ${formatDistance(c.distance_km)} de ${base.name}`
                      : c.name
                  }
                  data-testid={`regional-city-chip-${c.slug}`}
                >
                  {c.name}
                  {c.distance_km != null && (
                    <span className="text-[11px] text-cnc-muted-soft">
                      {formatDistance(c.distance_km)}
                    </span>
                  )}
                </Link>
              )
            )}
            {hasMoreCities && (
              <Link
                href={stateHref}
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-sm font-semibold text-primary transition hover:border-primary sm:shrink"
              >
                Ver todas →
              </Link>
            )}
          </div>
        </section>
      )}

      {topBrands.length > 0 && (
        <section
          aria-labelledby="regional-brands-heading"
          className="mb-6"
          data-testid="regional-top-brands"
        >
          <h2
            id="regional-brands-heading"
            className="mb-3 text-base font-bold text-cnc-text-strong sm:text-lg"
          >
            Marcas frequentes em {base.name}
          </h2>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {topBrands.map((b) => (
              <Link
                key={b.brand}
                href={`/carros-em/${encodeURIComponent(base.slug)}?brand=${encodeURIComponent(b.brand)}`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-medium text-cnc-text transition hover:border-primary hover:text-primary sm:shrink"
                title={`${b.brand} — ${b.count} anúncio(s) nesta amostra`}
              >
                <span className="font-semibold">{b.brand}</span>
                <span className="rounded-full bg-cnc-bg px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {b.count}
                </span>
              </Link>
            ))}
            <Link
              href={cityHref}
              className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-cnc-line bg-white px-3 text-xs font-semibold text-primary transition hover:border-primary sm:shrink"
            >
              Ver mais →
            </Link>
          </div>
        </section>
      )}

      <section
        aria-label="Sobre a região de busca"
        className="grid gap-4 md:grid-cols-3"
        data-testid="regional-seo-blocks"
      >
        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h3 className="text-sm font-semibold text-cnc-text-strong md:text-base">
            Por que comprar na região de {base.name}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
            Quando você amplia a busca para a região de {base.name}, encontra mais
            oferta, mais variedade de marcas e mais flexibilidade para negociar sem
            precisar viajar para longe. Carros de cidades vizinhas costumam estar a
            poucos quilômetros e podem ser visitados no mesmo dia.
          </p>
          <Link
            href={cityHref}
            className="mt-3 inline-flex text-xs font-semibold text-primary hover:text-primary-strong"
          >
            Ver apenas {base.name} →
          </Link>
        </article>

        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h3 className="text-sm font-semibold text-cnc-text-strong md:text-base">
            Cidades próximas incluídas
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
            {memberCount > 0 ? (
              <>
                Esta região inclui {base.name} e mais{" "}
                <strong className="text-cnc-text-strong">
                  {memberCount} cidade{memberCount === 1 ? "" : "s"}
                </strong>{" "}
                próxima{memberCount === 1 ? "" : "s"}
                {memberPreviewNames.length > 0 ? (
                  <>
                    , como{" "}
                    <strong className="text-cnc-text-strong">
                      {memberPreviewNames.join(", ")}
                    </strong>
                    {remainingMembers > 0 ? ` e mais ${remainingMembers}` : ""}
                  </>
                ) : null}
                . Todas dentro do alcance de até {radiusKm} km a partir da
                cidade-base.
              </>
            ) : (
              <>
                No momento, a região de {base.name} mostra anúncios apenas da própria
                cidade-base. Conforme novos veículos forem cadastrados em cidades
                vizinhas, eles aparecem aqui automaticamente.
              </>
            )}
          </p>
        </article>

        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h3 className="text-sm font-semibold text-cnc-text-strong md:text-base">
            Como funciona o alcance regional
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-cnc-muted">
            O alcance regional une {base.name} às cidades vizinhas dentro de{" "}
            {radiusKm} km e prioriza anúncios mais próximos da cidade-base — você
            vê primeiro o que está perto, sem precisar configurar filtros. Dentro do
            mesmo tipo de anúncio, anúncios em {base.name} aparecem antes dos das
            cidades vizinhas.
          </p>
          <Link
            href={stateHref}
            className="mt-3 inline-flex text-xs font-semibold text-primary hover:text-primary-strong"
          >
            Ver catálogo de {stateUF} →
          </Link>
        </article>
      </section>

    </div>
  );
}
