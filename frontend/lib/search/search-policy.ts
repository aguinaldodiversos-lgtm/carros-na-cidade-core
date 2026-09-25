// frontend/lib/search/search-policy.ts
//
// Leitura do bloco `search_policy` que o Search Policy Engine (v1) devolve.
// No caminho legado o bloco não existe, e toda função aqui devolve null — a
// página se comporta como antes.
//
// Por que existe: DEC-03 obriga a página a DECLARAR o raio quando o território
// passa de 0 km, e DEC-29 fez o território começar no piso regional. Sem isto,
// a página de Atibaia mostra carros de Bragança dizendo apenas "e região" —
// que é verdade vaga demais para quem precisa decidir se vai buscar o carro.

export type SearchPolicyCity = {
  slug: string;
  name: string;
  state: string | null;
  distance_km: number | null;
  count: number | null;
};

export type SearchPolicyFacetOption = { value: string; label: string; count: number };

export type SearchPolicyFacet = {
  key: string;
  label: string;
  open: boolean;
  active_value: string | null;
  options: SearchPolicyFacetOption[];
};

export type SearchPolicySummary = {
  geo_mode: string | null;
  reason: string | null;
  effective_radius_km: number | null;
  requested_radius_km: number | null;
  user_geo_explicit: boolean;
  origin_city: { slug: string; name: string; state: string | null } | null;
  /** Cidades do território com candidatos, a origem inclusa. */
  cities: SearchPolicyCity[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Interpreta o bloco bruto. Qualquer shape inesperado vira `null`. */
export function readSearchPolicy(raw: unknown): SearchPolicySummary | null {
  const block = asRecord(raw);
  if (!block) return null;
  const origin = asRecord(block.origin_city);
  const originSlug = origin ? asText(origin.slug) : null;
  const originName = origin ? asText(origin.name) : null;
  const cities = Array.isArray(block.cities)
    ? block.cities
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          slug: asText(entry.slug) || "",
          name: asText(entry.name) || "",
          state: asText(entry.state),
          distance_km: asNumber(entry.distance_km),
          count: asNumber(entry.count),
        }))
        .filter((entry) => entry.slug)
    : [];

  return {
    geo_mode: asText(block.geo_mode),
    reason: asText(block.reason),
    effective_radius_km: asNumber(block.effective_radius_km),
    requested_radius_km: asNumber(block.requested_radius_km),
    user_geo_explicit: block.user_geo_explicit === true,
    origin_city:
      originSlug && originName
        ? { slug: originSlug, name: originName, state: asText(origin?.state) }
        : null,
    cities,
  };
}

/** Facetas do motor, já no formato que a sidebar consome. */
export function readSearchPolicyFacets(raw: unknown): SearchPolicyFacet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      key: asText(entry.key) || "",
      label: asText(entry.label) || "",
      open: entry.open === true,
      active_value: asText(entry.active_value),
      options: Array.isArray(entry.options)
        ? entry.options
            .map((opt) => asRecord(opt))
            .filter((opt): opt is Record<string, unknown> => Boolean(opt))
            .map((opt) => ({
              value: asText(opt.value) || "",
              label: asText(opt.label) || "",
              count: asNumber(opt.count) ?? 0,
            }))
            .filter((opt) => opt.value)
        : [],
    }))
    .filter((facet) => facet.key);
}

/** Contagem por valor de uma faceta do motor (`{}` quando ela não veio). */
export function facetCounts(facets: SearchPolicyFacet[], key: string): Record<string, number> {
  const facet = facets.find((f) => f.key === key);
  if (!facet) return {};
  return Object.fromEntries(facet.options.map((opt) => [opt.value, opt.count]));
}

/**
 * Texto que declara o território ao usuário (DEC-03).
 *
 * `null` quando não há o que declarar: legado, sem origem, ou raio efetivo 0 —
 * e o raio efetivo é 0 justamente quando todos os resultados estão na própria
 * cidade (DEC-28), caso em que dizer "até 25 km" seria anunciar uma região que
 * o resultado não ocupa.
 */
export function territoryNotice(policy: SearchPolicySummary | null): string | null {
  if (!policy || !policy.origin_city) return null;
  const radius = policy.effective_radius_km;
  if (!radius || radius <= 0) return null;
  const origin = policy.origin_city.name;
  const neighbours = policy.cities.filter(
    (city) => city.slug !== policy.origin_city?.slug && (city.count ?? 0) > 0
  ).length;
  const base = `Mostrando ofertas em até ${radius} km de ${origin}`;
  if (neighbours <= 0) return base;
  return neighbours === 1
    ? `${base}, incluindo 1 cidade vizinha`
    : `${base}, incluindo ${neighbours} cidades vizinhas`;
}

export type EngineOfferCounts = { opportunity: number; below_fipe: number; highlight: number };

export type EngineControlTotals = {
  sellerKind?: { dealer: number; private: number };
  offers?: EngineOfferCounts;
  transmission?: Record<string, number>;
};

/**
 * Bloco `offer_counts` do motor (F3-B): Destaques, Oportunidades e Abaixo da
 * FIPE contados sobre o MESMO CandidateScope do grid.
 *
 * `null` quando o bloco não veio — motor antigo ou caminho legado. Devolver
 * zeros nesse caso seria pior que devolver nada: "Destaques (0)" afirma que não
 * existe destaque nenhum, quando a verdade é que ninguém contou.
 */
export function readOfferCounts(raw: unknown): EngineOfferCounts | null {
  const block = asRecord(raw);
  if (!block) return null;
  const opportunity = asNumber(block.opportunity);
  const belowFipe = asNumber(block.below_fipe);
  const highlight = asNumber(block.highlight);
  if (opportunity === null || belowFipe === null || highlight === null) return null;
  return { opportunity, below_fipe: belowFipe, highlight };
}

/**
 * Contagens dos controles da sidebar a partir das facetas do MOTOR.
 *
 * `null` quando o motor não respondeu — aí quem manda é a facet do BFF legado.
 * `offers` continua `undefined` quando o motor não mandou `offer_counts`: a
 * sidebar renderiza o chip sem número, que é o certo quando ninguém contou.
 * Repetir ali o número da cidade ao lado de um grid regional seria mentir com
 * confiança — o defeito que esta camada existe para corrigir.
 */
export function engineControlTotals(
  facets: SearchPolicyFacet[],
  offers: EngineOfferCounts | null = null
): EngineControlTotals | null {
  if (!facets.length) return null;
  const sellers = facetCounts(facets, "seller_kind");
  const transmissions = facetCounts(facets, "transmission");
  return {
    sellerKind: { dealer: sellers.dealer ?? 0, private: sellers.private ?? 0 },
    offers: offers ?? undefined,
    transmission: Object.keys(transmissions).length > 0 ? transmissions : undefined,
  };
}

/** "a 18 km" para o card. `null` na própria cidade e no caminho legado. */
export function distanceLabel(distanceKm: unknown): string | null {
  const km = asNumber(distanceKm);
  if (km === null || km <= 0) return null;
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `a ${String(rounded).replace(".", ",")} km`;
}
