import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";
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
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return "<1 km";
  return `${Math.round(km)} km`;
}

export function RegionPageView({ base, members, ads, radiusKm }: RegionPageViewProps) {
  const memberCount = members.length;
  const stateUF = base.state.toUpperCase();
  const cityHref = `/carros-em/${encodeURIComponent(base.slug)}`;
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

      {memberCount > 0 && (
        <section aria-label="Cidades incluídas na região" className="mb-6">
          <p className="text-xs uppercase tracking-wide text-cnc-muted-soft mb-2">
            Cidades nesta região
          </p>
          <div className="flex flex-wrap gap-2">
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
