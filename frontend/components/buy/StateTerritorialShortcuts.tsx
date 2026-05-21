import Link from "next/link";

import { stateNameFromUf } from "@/lib/buy/territory-variant";
import { slugToRegionHref } from "@/lib/regions/ancora-url";
import {
  getStateCuratedCities,
  type StateCuratedCity,
} from "@/lib/buy/state-territorial-cities";

/**
 * Bloco de navegação territorial ao final da Página Estadual.
 *
 * Briefing 2026-05-21 (Estado → Regional → Cidade):
 *   - CTA principal de cada card aponta para a Página REGIONAL
 *     (`/carros-usados/regiao/[slug]`). A Página Estadual nunca
 *     manda seleção territorial direto para a Página Cidade.
 *   - Link secundário (texto discreto) aponta para a Página Cidade
 *     como atalho de "ver apenas anúncios desta cidade".
 *
 * Seção contextual (briefing item 12 — seleção inteligente):
 *   - Quando o caller fornece `nearbyCities` (resolvidas a partir da
 *     cidade detectada/selecionada do visitante), renderiza um
 *     sub-bloco "Cidades próximas de [cidade]" ANTES da grade de
 *     destaque estadual.
 *   - Quando não há contexto, renderiza apenas a grade de
 *     "Principais cidades em [estado]" como fallback claramente
 *     rotulado.
 *
 * Os dois sub-blocos têm rótulos distintos para não passar a impressão
 * de que "Santos" e "Atibaia" são igualmente relevantes para alguém
 * em Bragança Paulista.
 */

type StateTerritorialShortcutsProps = {
  /** UF de duas letras (ex.: "SP"). Lowercase é aceito; normalizamos. */
  uf: string;
  /**
   * Cidades a renderizar no sub-bloco "Cidades próximas de [cidade]".
   * O caller resolve isso a partir da região que contém a cidade
   * detectada/selecionada do visitante. Quando ausente ou vazio, o
   * sub-bloco é suprimido.
   */
  nearbyCities?: StateCuratedCity[];
  /**
   * Nome da cidade que ancora o sub-bloco contextual (usado no
   * título "Cidades próximas de [cidade]"). Obrigatório quando
   * `nearbyCities` é fornecido.
   */
  activeCityName?: string;
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
        {/* CTA primário — afunilamento da Estadual para a Regional.
            Briefing 2026-05-21: seleção territorial na Estadual nunca
            vai direto para a Página Cidade. */}
        <Link
          href={slugToRegionHref(city.slug)}
          className="inline-flex items-center gap-1 font-semibold text-primary transition hover:text-primary-strong"
          data-testid={`state-shortcut-region-${city.slug}`}
        >
          Ver ofertas na região de {city.name}
          <span aria-hidden="true">→</span>
        </Link>
        {/* Link secundário discreto — atalho para quem realmente quer
            só a cidade. Mantido para não esconder o caminho da Cidade,
            mas sem prioridade visual. */}
        <Link
          href={`/carros-em/${citySlug}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-cnc-muted transition hover:text-primary"
          data-testid={`state-shortcut-city-${city.slug}`}
        >
          Carros em {city.name}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </li>
  );
}

function CityGrid({ cities, ufUpper }: { cities: StateCuratedCity[]; ufUpper: string }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cities.map((c) => (
        <CityCard key={c.slug} city={c} ufUpper={ufUpper} />
      ))}
    </ul>
  );
}

export function StateTerritorialShortcuts({
  uf,
  nearbyCities,
  activeCityName,
}: StateTerritorialShortcutsProps) {
  const ufLower = String(uf || "").trim().toLowerCase();
  const ufUpper = ufLower.toUpperCase();
  const fallbackCities = getStateCuratedCities(ufLower);

  const hasNearby =
    Array.isArray(nearbyCities) &&
    nearbyCities.length > 0 &&
    Boolean(activeCityName?.trim());

  // Suprime o componente inteiro se não há nem fallback nem contexto.
  // Melhor render zero do que listar 0 cidades.
  if (fallbackCities.length === 0 && !hasNearby) return null;

  const stateName = stateNameFromUf(ufUpper);

  return (
    <section
      aria-label={`Cidades e regiões em ${stateName}`}
      className="mt-8"
      data-testid="state-territorial-shortcuts"
    >
      {hasNearby ? (
        <div data-testid="state-shortcuts-nearby">
          <header>
            <h2 className="text-lg font-bold text-cnc-text-strong sm:text-xl">
              Cidades próximas de <span className="text-primary">{activeCityName}</span>
            </h2>
            <p className="mt-1 text-sm text-cnc-muted">
              Mesma região no entorno — clique para ver as ofertas regionais.
            </p>
          </header>
          <CityGrid cities={nearbyCities!} ufUpper={ufUpper} />
        </div>
      ) : null}

      {fallbackCities.length > 0 ? (
        <div
          className={hasNearby ? "mt-8" : undefined}
          data-testid="state-shortcuts-fallback"
        >
          <header>
            <h2 className="text-lg font-bold text-cnc-text-strong sm:text-xl">
              {hasNearby ? "Outras cidades em" : "Principais cidades em"}{" "}
              <span className="text-primary">{stateName}</span>
            </h2>
            <p className="mt-1 text-sm text-cnc-muted">
              {hasNearby
                ? "Polos do estado fora da sua região atual."
                : "Polos regionais e capitais — escolha uma para ver as ofertas na região."}
            </p>
          </header>
          <CityGrid
            cities={
              hasNearby
                ? fallbackCities.filter(
                    (c) => !nearbyCities!.some((n) => n.slug === c.slug)
                  )
                : fallbackCities
            }
            ufUpper={ufUpper}
          />
        </div>
      ) : null}
    </section>
  );
}
