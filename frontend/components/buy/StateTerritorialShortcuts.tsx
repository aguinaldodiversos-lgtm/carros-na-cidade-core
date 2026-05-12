import Link from "next/link";

import { stateNameFromUf } from "@/lib/buy/territory-variant";
import {
  getStateCuratedCities,
  type StateCuratedCity,
} from "@/lib/buy/state-territorial-cities";

/**
 * Bloco leve de navegação territorial renderizado no fim da Página
 * Estadual (`/comprar/estado/[uf]`).
 *
 * Por que existe?
 *   A auditoria 2026-05-11 detectou que /comprar/estado/sp não oferecia
 *   nenhum caminho navegacional para cidades canônicas (`/carros-em/*`)
 *   nem para a Página Regional (`/carros-usados/regiao/*`). O catálogo
 *   listava apenas 17 cards de anúncios + 6 cidades no footer global
 *   via `/cidade/[slug]` (rota local-seo, não a canônica). Cidades como
 *   Atibaia ficavam invisíveis como destino.
 *
 *   Este bloco corrige isso adicionando uma grade compacta de cidades
 *   curadas, cada uma linkando para a **canônica** `/carros-em/[slug]`
 *   + a **regional** `/carros-usados/regiao/[slug]`. Sem fetch novo,
 *   sem afetar o catálogo ou o ranking.
 *
 * Não-mudanças (escopo cirúrgico):
 *   - JSON-LD, canonical, robots da página estadual: intocados.
 *   - Layout do BuyMarketplacePageClient: bloco entra no fim da coluna
 *     principal (depois da grade e antes/aoa lado do tile FIPE).
 *   - Server component puro — sem state, sem hooks.
 */

type StateTerritorialShortcutsProps = {
  /** UF de duas letras (ex.: "SP"). Lowercase é aceito; normalizamos. */
  uf: string;
};

function CityCard({ city, ufUpper }: { city: StateCuratedCity; ufUpper: string }) {
  const citySlug = encodeURIComponent(city.slug);
  return (
    <li className="rounded-xl border border-cnc-line bg-white p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-cnc-text-strong sm:text-base">{city.name}</h3>
        <span className="text-[11px] font-bold uppercase tracking-wide text-cnc-muted-soft">
          {ufUpper}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <Link
          href={`/carros-em/${citySlug}`}
          className="inline-flex items-center gap-1 font-semibold text-primary transition hover:text-primary-strong"
        >
          Carros em {city.name}
          <span aria-hidden="true">→</span>
        </Link>
        <Link
          href={`/carros-usados/regiao/${citySlug}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-cnc-muted transition hover:text-primary"
        >
          Região de {city.name}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </li>
  );
}

export function StateTerritorialShortcuts({ uf }: StateTerritorialShortcutsProps) {
  const ufLower = String(uf || "").trim().toLowerCase();
  const ufUpper = ufLower.toUpperCase();
  const cities = getStateCuratedCities(ufLower);

  // Suprime o bloco quando a UF não tem curadoria. Melhor render zero
  // do que listar 0 cidades (visualmente quebrado) ou cair em fallback
  // genérico que pode prometer cidade inexistente.
  if (cities.length === 0) return null;

  const stateName = stateNameFromUf(ufUpper);

  return (
    <section
      aria-label={`Cidades e regiões em ${stateName}`}
      className="mt-8"
      data-testid="state-territorial-shortcuts"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-cnc-text-strong sm:text-xl">
            Cidades e regiões em <span className="text-primary">{stateName}</span>
          </h2>
          <p className="mt-1 text-sm text-cnc-muted">
            Explore o catálogo local de uma cidade ou amplie para a região no entorno.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((c) => (
          <CityCard key={c.slug} city={c} ufUpper={ufUpper} />
        ))}
      </ul>
    </section>
  );
}
