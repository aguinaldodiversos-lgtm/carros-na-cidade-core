import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";
import type { BrandCount, CityCount } from "@/lib/regions/regional-facets";
import { AdGrid } from "@/components/ads/AdGrid";

/**
 * View server-render-friendly da Página Regional.
 *
 * - Pure server component (sem "use client"). Renderiza static + grid.
 * - Reaproveita `<AdGrid>` (mesmo grid das páginas territoriais), que já
 *   trata fallback "nenhum anúncio".
 * - Sobrescreve a mensagem de empty state com texto regional específico
 *   ("Ainda não encontramos veículos nesta região...") só quando não há
 *   nenhum anúncio. Para isso renderiza o fallback inline em vez de
 *   delegar ao AdGrid quando `ads.length === 0`.
 *
 * Estilo: tailwind direto, sem novos componentes globais.
 */

interface RegionPageViewProps {
  base: RegionBase;
  members: RegionMember[];
  ads: AdItem[];
  radiusKm: number;
  /**
   * Total agregado de anúncios na região, devolvido pelo backend em
   * `pagination.total`. Distinto de `ads.length` (apenas a amostra
   * exibida nesta página). Usado na "contagem destacada" e nas seções
   * SEO contextuais para refletir o número real do estoque regional,
   * sem inventar quantidades.
   */
  totalAds: number;
  /**
   * Top marcas agregadas da amostra de anúncios (até 5). Vazio quando
   * a amostra é insuficiente. Por ser amostra, exibimos com label
   * "marcas frequentes" em vez de "top marcas da região" — ver
   * `lib/regions/regional-facets.ts` para o contrato.
   */
  topBrands?: BrandCount[];
  /**
   * Contagem de anúncios por cidade (cidade-base + membros) derivada
   * da amostra. Quando vazio, caímos para a UI antiga de chips sem
   * contagem.
   */
  cityCounts?: CityCount[];
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return "<1 km";
  return `${Math.round(km)} km`;
}

export function RegionPageView({
  base,
  members,
  ads,
  radiusKm,
  totalAds,
  topBrands = [],
  cityCounts = [],
}: RegionPageViewProps) {
  const memberCount = members.length;
  const stateUF = base.state.toUpperCase();
  const cityHref = `/carros-em/${encodeURIComponent(base.slug)}`;
  // `totalAds` é o número agregado do backend; `ads.length` é só a
  // amostra desta página. Para a contagem destacada e os blocos SEO
  // contextuais, sempre preferir `totalAds` quando > 0; cair para o
  // tamanho da amostra apenas quando o backend não devolveu pagination
  // (defesa contra envelope legado).
  const safeTotal = totalAds > 0 ? totalAds : ads.length;
  const memberPreviewNames = members.slice(0, 4).map((m) => m.name);
  const remainingMembers = Math.max(0, memberCount - memberPreviewNames.length);
  // URL canônica da Página Estadual: `/comprar/estado/[uf]` (lowercase).
  // `/comprar?state=UF` ainda funciona via 307 → canonical, mas adiciona
  // um hop e Search Console pode interpretar como link "fraco". Como
  // conhecemos a canonical, apontamos direto.
  const stateHref = `/comprar/estado/${stateUF.toLowerCase()}`;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:py-10">
      <nav className="text-xs text-cnc-muted mb-3" aria-label="Navegação">
        <Link href="/" className="hover:text-cnc-text">
          Início
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={stateHref} className="hover:text-cnc-text">
          {stateUF}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={cityHref} className="hover:text-cnc-text">
          {base.name}
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-cnc-text">Região</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-cnc-text">
          Carros usados na região de {base.name}
        </h1>
        <p className="mt-2 text-sm md:text-base text-cnc-muted">
          Veja veículos anunciados em <strong className="text-cnc-text">{base.name}</strong> e
          cidades próximas em até <strong className="text-cnc-text">{radiusKm} km</strong>.
        </p>
      </header>

      {safeTotal > 0 && (
        <section
          aria-label="Total de anúncios na região"
          className="mb-6 rounded-xl border border-cnc-line bg-white px-4 py-3 md:px-5 md:py-4"
          data-testid="regional-count-highlight"
        >
          <p className="text-base md:text-lg text-cnc-text">
            <strong className="text-xl md:text-2xl font-bold text-primary">
              {safeTotal.toLocaleString("pt-BR")}
            </strong>{" "}
            <span className="font-semibold">
              {safeTotal === 1 ? "carro" : "carros"}
            </span>{" "}
            <span className="text-cnc-muted">
              em uma região de até{" "}
              <strong className="text-cnc-text">{radiusKm} km</strong> ao redor de{" "}
              <strong className="text-cnc-text">{base.name}</strong>
            </span>
          </p>
        </section>
      )}

      {memberCount > 0 && (
        <section aria-label="Cidades incluídas na região" className="mb-6">
          <p className="text-xs uppercase tracking-wide text-cnc-muted-soft mb-2">
            Cidades nesta região
          </p>
          <div className="flex flex-wrap gap-2">
            {cityCounts.length > 0 ? (
              cityCounts.map((c) => {
                if (c.is_base) {
                  return (
                    <span
                      key={`base-${c.slug}`}
                      className="inline-flex items-center rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                      title={`${c.name} (cidade base) — ${c.count} anúncio(s) nesta página`}
                    >
                      {c.name}
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-80">
                        base
                      </span>
                      {c.count > 0 && (
                        <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold">
                          {c.count}
                        </span>
                      )}
                    </span>
                  );
                }
                return (
                  <Link
                    key={`chip-${c.slug}`}
                    href={`/carros-em/${encodeURIComponent(c.slug)}`}
                    className="inline-flex items-center rounded-full border border-cnc-line bg-white px-3 py-1 text-xs text-cnc-text hover:border-primary hover:text-primary transition-colors"
                    title={
                      c.distance_km != null
                        ? `${c.name} — ${formatDistance(c.distance_km)} de ${base.name}`
                        : c.name
                    }
                  >
                    {c.name}
                    {c.distance_km != null && (
                      <span className="ml-1.5 text-[10px] text-cnc-muted-soft">
                        {formatDistance(c.distance_km)}
                      </span>
                    )}
                    {c.count > 0 && (
                      <span className="ml-1.5 rounded-full bg-cnc-bg px-1.5 text-[10px] font-semibold text-cnc-text">
                        {c.count}
                      </span>
                    )}
                  </Link>
                );
              })
            ) : (
              <>
                <span
                  className="inline-flex items-center rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                  title={`${base.name} (cidade base)`}
                >
                  {base.name}
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-80">
                    base
                  </span>
                </span>
                {members.map((m) => (
                  <Link
                    key={`${m.city_id}-${m.slug}`}
                    href={`/carros-em/${encodeURIComponent(m.slug)}`}
                    className="inline-flex items-center rounded-full border border-cnc-line bg-white px-3 py-1 text-xs text-cnc-text hover:border-primary hover:text-primary transition-colors"
                    title={`${m.name} — ${formatDistance(m.distance_km)} de ${base.name}`}
                  >
                    {m.name}
                    {m.distance_km != null && (
                      <span className="ml-1.5 text-[10px] text-cnc-muted-soft">
                        {formatDistance(m.distance_km)}
                      </span>
                    )}
                  </Link>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {topBrands.length > 0 && (
        <section
          aria-label="Top marcas nesta região"
          className="mb-6"
          data-testid="regional-top-brands"
        >
          <p className="text-xs uppercase tracking-wide text-cnc-muted-soft mb-2">
            Marcas frequentes na região de {base.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {topBrands.map((b) => (
              <span
                key={b.brand}
                className="inline-flex items-center rounded-full border border-cnc-line bg-white px-3 py-1 text-xs text-cnc-text"
                title={`${b.brand} — ${b.count} anúncio(s) nesta página`}
              >
                <strong className="font-semibold text-cnc-text">{b.brand}</strong>
                <span className="ml-1.5 rounded-full bg-cnc-bg px-1.5 text-[10px] font-semibold text-cnc-text">
                  {b.count}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {ads.length === 0 ? (
        <section className="rounded-xl border border-dashed border-cnc-line bg-cnc-bg/40 p-8 text-center">
          <p className="text-base font-semibold text-cnc-text">
            Ainda não encontramos veículos nesta região
          </p>
          <p className="mt-2 text-sm text-cnc-muted">
            Veja anúncios em todo o estado de {stateUF} ou anuncie grátis o seu carro.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href={stateHref}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Ver anúncios em {stateUF}
            </Link>
            <Link
              href="/anunciar"
              className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
            >
              Anunciar grátis
            </Link>
          </div>
        </section>
      ) : (
        <section aria-label="Anúncios da região">
          <AdGrid items={ads} />
        </section>
      )}

      <section
        aria-label="Sobre a região de busca"
        className="mt-10 grid gap-4 md:grid-cols-3"
        data-testid="regional-seo-blocks"
      >
        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h2 className="text-sm md:text-base font-semibold text-cnc-text">
            Por que comprar na região de {base.name}
          </h2>
          <p className="mt-2 text-sm text-cnc-muted leading-relaxed">
            Quando você amplia a busca para a região de {base.name}, encontra mais
            oferta, mais variedade de marcas e mais flexibilidade para negociar
            sem precisar viajar para longe. Carros de cidades vizinhas costumam
            estar a poucos quilômetros e podem ser visitados no mesmo dia.
          </p>
        </article>

        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h2 className="text-sm md:text-base font-semibold text-cnc-text">
            Cidades próximas incluídas
          </h2>
          <p className="mt-2 text-sm text-cnc-muted leading-relaxed">
            {memberCount > 0 ? (
              <>
                Esta região inclui {base.name} e mais{" "}
                <strong className="text-cnc-text">
                  {memberCount} cidade{memberCount === 1 ? "" : "s"}
                </strong>{" "}
                próxima{memberCount === 1 ? "" : "s"}
                {memberPreviewNames.length > 0 ? (
                  <>
                    , como <strong className="text-cnc-text">{memberPreviewNames.join(", ")}</strong>
                    {remainingMembers > 0 ? ` e mais ${remainingMembers}` : ""}
                  </>
                ) : null}
                . Todas dentro do alcance de até {radiusKm} km a partir da
                cidade-base.
              </>
            ) : (
              <>
                No momento, a região de {base.name} mostra anúncios apenas da
                própria cidade-base. Conforme novos veículos forem cadastrados
                em cidades vizinhas, eles aparecem aqui automaticamente.
              </>
            )}
          </p>
        </article>

        <article className="rounded-xl border border-cnc-line bg-white p-4 md:p-5">
          <h2 className="text-sm md:text-base font-semibold text-cnc-text">
            Como funciona o alcance regional inteligente
          </h2>
          <p className="mt-2 text-sm text-cnc-muted leading-relaxed">
            O alcance regional inteligente une {base.name} às cidades vizinhas
            dentro de {radiusKm} km e prioriza anúncios mais próximos da
            cidade-base. Você vê primeiro o que está perto, sem precisar
            configurar filtros, e sem perder ofertas que estariam de fora numa
            busca só por cidade.
          </p>
        </article>
      </section>

      <footer className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link
          href={cityHref}
          className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
        >
          Voltar para {base.name}
        </Link>
        <Link
          href={stateHref}
          className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
        >
          Ver catálogo de {stateUF}
        </Link>
        <Link
          href="/comprar"
          className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
        >
          Buscar em outra cidade
        </Link>
      </footer>
    </main>
  );
}
