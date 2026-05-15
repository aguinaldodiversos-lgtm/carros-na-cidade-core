import "server-only";

import { isValidCitySlug } from "@/lib/buy/territory-variant";
import { fetchCityMetaBySlug } from "@/lib/city/fetch-city-meta-server";
import { fetchRegionByCitySlug } from "@/lib/regions/fetch-region";

import {
  getDefaultTerritoryState,
  stateFromUf,
  ufFromCitySlug,
} from "./territory-defaults";
import type {
  TerritoryBreadcrumb,
  TerritoryContext,
  TerritoryLevel,
  TerritoryState,
} from "./territory-context";

/**
 * Resolução territorial unificada — usado por Home, /comprar, /comprar/estado,
 * /comprar/cidade e /carros-usados/regiao para construir uma representação
 * única do contexto (state/region/city/canonical/title/breadcrumbs).
 *
 * Princípio: a hierarquia do portal é Estado → Região → Cidade. Brasil-todo
 * (busca livre) é ferramenta, nunca produto. O resolver nunca retorna
 * `null` — em falha (cidade inexistente, região indisponível) ele degrada
 * graciosamente para o nível superior (region→city→state→default).
 *
 * Prioridade dos inputs:
 *   1. `regionSlug` (resolve via BFF privado /api/internal/regions).
 *   2. `citySlug` (resolve via /api/public/cities; sem auto-region).
 *   3. `stateUf`, `query.state`, `cookie.state` (level "state").
 *   4. Fallback: DEFAULT_TERRITORY_STATE (SP por padrão).
 *
 * Importante: o cookie da cidade NÃO promove o nível para "city" no Home.
 * Ele só infere a UF para a vitrine estadual continuar fazendo sentido para
 * o usuário (ex: cookie atibaia-sp → Home estadual de SP). Isso evita o
 * bug histórico em que a Home começava em SP-capital e zerava inventário.
 */

type CookieHint = { slug?: string | null; state?: string | null; name?: string | null } | null;

export type TerritoryResolverInput = {
  /** Hint opcional — força o nível mesmo que outros sinais existam. */
  level?: TerritoryLevel | null;
  citySlug?: string | null;
  stateUf?: string | null;
  regionSlug?: string | null;
  cookie?: CookieHint;
  query?: {
    city_slug?: string | null;
    state?: string | null;
    region_slug?: string | null;
  } | null;
};

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function cityNameFromSlug(slug: string): string {
  const parts = slug.trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length === 0) return "Cidade";
  const tail = parts[parts.length - 1];
  const cityParts = /^[a-z]{2}$/.test(tail) ? parts.slice(0, -1) : parts;
  return titleCase(cityParts.join(" ")) || "Cidade";
}

function buildStateBreadcrumbs(state: TerritoryState): TerritoryBreadcrumb[] {
  return [
    { label: "Início", href: "/" },
    { label: state.name, href: `/comprar/estado/${state.slug}` },
  ];
}

function buildCityBreadcrumbs(
  state: TerritoryState,
  city: { slug: string; name: string }
): TerritoryBreadcrumb[] {
  return [
    { label: "Início", href: "/" },
    { label: state.name, href: `/comprar/estado/${state.slug}` },
    { label: city.name, href: `/comprar/cidade/${city.slug}` },
  ];
}

function buildRegionBreadcrumbs(
  state: TerritoryState,
  region: { slug: string; name: string }
): TerritoryBreadcrumb[] {
  return [
    { label: "Início", href: "/" },
    { label: state.name, href: `/comprar/estado/${state.slug}` },
    { label: region.name, href: `/carros-usados/regiao/${region.slug}` },
  ];
}

function pickRegionSlug(input: TerritoryResolverInput): string | null {
  const candidates = [input.regionSlug, input.query?.region_slug];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed && isValidCitySlug(trimmed)) return trimmed;
  }
  return null;
}

function pickCitySlug(input: TerritoryResolverInput): string | null {
  const candidates = [input.citySlug, input.query?.city_slug, input.cookie?.slug];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed && isValidCitySlug(trimmed)) return trimmed;
  }
  return null;
}

function pickStateUf(input: TerritoryResolverInput): string | null {
  const explicit = (input.stateUf || input.query?.state || "").trim();
  if (explicit && /^[A-Za-z]{2}$/.test(explicit)) return explicit.toUpperCase();

  const cookieState = (input.cookie?.state || "").trim();
  if (cookieState && /^[A-Za-z]{2}$/.test(cookieState)) return cookieState.toUpperCase();

  const cookieInferred = ufFromCitySlug(input.cookie?.slug);
  return cookieInferred;
}

async function resolveRegionContext(regionSlug: string): Promise<TerritoryContext | null> {
  const region = await fetchRegionByCitySlug(regionSlug);
  if (!region) return null;

  const state = stateFromUf(region.base.state) ?? getDefaultTerritoryState();
  const memberSlugs = region.members.map((m) => m.slug);
  const memberNames = region.members.map((m) => m.name);
  const regionName = `Região de ${region.base.name}`;
  const sample = memberNames.slice(0, 3);

  const description =
    sample.length > 0
      ? `Carros usados em ${region.base.name}, ${sample.join(", ")} e cidades próximas — ofertas regionais no Carros na Cidade.`
      : `Carros usados em ${region.base.name} e cidades próximas — ofertas regionais no Carros na Cidade.`;

  return {
    level: "region",
    state,
    region: {
      slug: region.base.slug,
      name: regionName,
      baseCitySlug: region.base.slug,
      citySlugs: [region.base.slug, ...memberSlugs],
      cityNames: [region.base.name, ...memberNames],
      radiusKm: region.radius_km,
    },
    city: {
      slug: region.base.slug,
      name: region.base.name,
      state: region.base.state,
    },
    canonicalUrl: `/carros-usados/regiao/${region.base.slug}`,
    title: `Carros usados na ${regionName}`,
    description,
    breadcrumbs: buildRegionBreadcrumbs(state, { slug: region.base.slug, name: regionName }),
  };
}

async function resolveCityContext(citySlug: string): Promise<TerritoryContext> {
  const meta = await fetchCityMetaBySlug(citySlug);
  const ufHint = meta?.state || ufFromCitySlug(citySlug) || getDefaultTerritoryState().code;
  const state = stateFromUf(ufHint) ?? getDefaultTerritoryState();
  const cityName = meta?.name || cityNameFromSlug(citySlug);

  return {
    level: "city",
    state,
    city: { slug: citySlug, name: cityName, state: state.code },
    canonicalUrl: `/comprar/cidade/${citySlug}`,
    title: `Carros usados em ${cityName} (${state.code})`,
    description: `Ofertas reais em ${cityName} — confira preço, ano e km direto no Carros na Cidade.`,
    breadcrumbs: buildCityBreadcrumbs(state, { slug: citySlug, name: cityName }),
  };
}

function buildStateContext(state: TerritoryState): TerritoryContext {
  return {
    level: "state",
    state,
    canonicalUrl: `/comprar/estado/${state.slug}`,
    title: `Carros usados em ${state.name}`,
    description: `Ofertas selecionadas em todo o estado de ${state.name} — filtre por cidade ou região quando quiser focar a busca.`,
    breadcrumbs: buildStateBreadcrumbs(state),
  };
}

/**
 * Resolve o território com base nos inputs. Nunca lança; em falha cai para
 * o nível superior.
 *
 * Uso típico:
 *   const ctx = await resolveTerritory({ cookie, query: searchParams });
 *   if (ctx.level === "state") { ... }
 */
export async function resolveTerritory(
  input: TerritoryResolverInput = {}
): Promise<TerritoryContext> {
  const explicitLevel = input.level ?? null;

  // 1. Region — só se nível explícito o pede OU se regionSlug foi passado
  //    e o nível não foi forçado para "state"/"city".
  if (explicitLevel === "region" || (!explicitLevel && pickRegionSlug(input))) {
    const regionSlug = pickRegionSlug(input);
    if (regionSlug) {
      const regionCtx = await resolveRegionContext(regionSlug);
      if (regionCtx) return regionCtx;
      // Região não encontrada → tenta resolver como cidade do mesmo slug.
      const cityCtx = await resolveCityContext(regionSlug);
      return cityCtx;
    }
  }

  // 2. City — explícito (query, prop, ou level=city).
  if (explicitLevel === "city") {
    const citySlug = pickCitySlug(input);
    if (citySlug) return resolveCityContext(citySlug);
    // level=city mas sem slug → cai para state.
  } else if (!explicitLevel) {
    // Sem hint: só promove para "city" se cidade veio via query/prop explícita.
    // Cookie NÃO promove — ele só infere a UF do estado (passo 3).
    const explicitCity = (input.citySlug || input.query?.city_slug || "").trim();
    if (explicitCity && isValidCitySlug(explicitCity)) {
      return resolveCityContext(explicitCity);
    }
  }

  // 3. State — fallback. Usa UF inferida (query/cookie) ou DEFAULT.
  const ufCandidate = pickStateUf(input);
  const state = (ufCandidate && stateFromUf(ufCandidate)) || getDefaultTerritoryState();
  return buildStateContext(state);
}
