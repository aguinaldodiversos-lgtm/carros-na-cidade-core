import "server-only";

import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { isValidBrazilianCitySlug } from "@/lib/buy/territory-variant";

/**
 * Loader de "descoberta" da Home — alimenta as seções NOVAS da reestruturação
 * 2026-07-11 que dependem de inventário real:
 *   - Busca por perfil (chips temáticos)
 *   - Bloco SEO "Continue sua busca" → colunas "Por cidade", "Por modelo" e
 *     "Por preço"
 *
 * REGRA DE OURO (briefing): nenhum link pode levar a 404 ou a página vazia.
 *
 * ESTRATÉGIA — 1 FETCH, DERIVA TUDO. Buscamos UMA amostra do catálogo do
 * estado (`/api/ads/search?state=UF&limit=50`) e derivamos cidades, modelos,
 * faixas de preço e perfis a partir dos anúncios retornados. Vantagens:
 *   1. Um item só aparece se HÁ pelo menos 1 anúncio real que o satisfaz —
 *      logo o destino nunca é vazio (impossível gerar falso-positivo).
 *   2. Um único request ao backend — não dispara o rate limiter (a
 *      abordagem anterior, com ~18 probes concorrentes por render, era
 *      bloqueada e escondia seções válidas por engano).
 *   3. Cidades vêm com `city_slug` REAL do banco (`c.slug`) — sem
 *      reconstrução frágil e sem os slugs corrompidos/de outros estados que
 *      `featuredCities` trazia (ex.: "sæo-paulo" sem UF → 404).
 *
 * Limite conhecido: com inventário acima de 50, uma faixa/perfil que só tem
 * anúncios FORA da amostra pode ficar oculto (falso-negativo). É o lado
 * seguro do trade-off: escondemos demais, nunca linkamos para vazio. Em
 * estados de baixo volume a amostra ≈ catálogo inteiro.
 */

const SAMPLE_LIMIT = 50;

export interface HomeProfileChip {
  key: string;
  label: string;
  href: string;
}

export interface HomeModelLink {
  label: string;
  href: string;
  total: number;
}

export interface HomePriceBucketLink {
  key: string;
  label: string;
  href: string;
}

export interface HomeSeoCity {
  id: number;
  name: string;
  slug: string;
}

export interface HomeDiscovery {
  profiles: HomeProfileChip[];
  models: HomeModelLink[];
  priceBuckets: HomePriceBucketLink[];
  cities: HomeSeoCity[];
}

const EMPTY: HomeDiscovery = { profiles: [], models: [], priceBuckets: [], cities: [] };

/** Linha crua de anúncio que nos interessa para derivar as seções. */
export interface SampleAd {
  price: number | null;
  year: number | null;
  brand: string | null;
  model: string | null;
  body_type: string | null;
  below_fipe: boolean;
  city: string | null;
  city_slug: string | null;
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    const internal = getInternalBackendApiBaseUrl();
    if (internal) return internal.replace(/\/+$/, "");
  }
  return getBackendApiBaseUrl().replace(/\/+$/, "");
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchStateSample(uf: string): Promise<SampleAd[]> {
  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/ads/search?state=${encodeURIComponent(uf)}&sort=recent&limit=${SAMPLE_LIMIT}`;

  try {
    const res = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: "home-discovery",
      next: { revalidate: 60, tags: ["public-home", `public-home:${uf}`] },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.map((raw): SampleAd => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        price: toNum(r.price),
        year: toNum(r.year),
        brand: toStr(r.brand),
        model: toStr(r.model),
        body_type: toStr(r.body_type)?.toLowerCase() ?? null,
        below_fipe: r.below_fipe === true,
        city: toStr(r.city),
        city_slug: toStr(r.city_slug)?.toLowerCase() ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** Constrói `/comprar?state=UF&...` — o redirector preserva os filtros não-territoriais. */
function comprarHref(uf: string, params: Record<string, string | number | boolean>): string {
  const qs = new URLSearchParams({ state: uf });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  return `/comprar?${qs.toString()}`;
}

function capitalizeWords(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Perfis candidatos. `match` decide se a amostra tem ≥1 anúncio que satisfaz
 * o filtro; `filters` é EXATAMENTE o que vai no href — assim "aparecer" e
 * "ter resultado no destino" são a mesma condição.
 */
const PROFILE_CANDIDATES: Array<{
  key: string;
  label: string;
  filters: Record<string, string | number | boolean>;
  match: (ad: SampleAd) => boolean;
}> = [
  {
    key: "primeiro-carro",
    label: "Primeiro carro",
    filters: { max_price: 50000, sort: "price_asc" },
    match: (a) => a.price != null && a.price <= 50000,
  },
  {
    key: "familia",
    label: "Para família",
    filters: { body_type: "suv" },
    match: (a) => a.body_type === "suv",
  },
  {
    key: "uber-99",
    label: "Uber / 99",
    filters: { year_min: 2016, max_price: 90000 },
    match: (a) => a.year != null && a.year >= 2016 && a.price != null && a.price <= 90000,
  },
  {
    key: "economicos",
    label: "Econômicos",
    filters: { max_price: 60000, sort: "price_asc" },
    match: (a) => a.price != null && a.price <= 60000,
  },
  {
    key: "abaixo-fipe",
    label: "Abaixo da FIPE",
    filters: { below_fipe: true },
    match: (a) => a.below_fipe,
  },
];

const PRICE_BUCKETS: Array<{
  key: string;
  label: string;
  filters: Record<string, number>;
  min: number;
  max: number | null;
}> = [
  { key: "ate-40", label: "Até R$ 40 mil", filters: { max_price: 40000 }, min: 0, max: 40000 },
  {
    key: "40-70",
    label: "R$ 40 mil a R$ 70 mil",
    filters: { min_price: 40000, max_price: 70000 },
    min: 40000,
    max: 70000,
  },
  {
    key: "70-100",
    label: "R$ 70 mil a R$ 100 mil",
    filters: { min_price: 70000, max_price: 100000 },
    min: 70000,
    max: 100000,
  },
  {
    key: "acima-100",
    label: "Acima de R$ 100 mil",
    filters: { min_price: 100000 },
    min: 100000,
    max: null,
  },
];

export async function fetchHomeDiscovery(stateUf: string): Promise<HomeDiscovery> {
  const uf = (stateUf || "").trim().toUpperCase();
  if (!uf) return EMPTY;

  const ads = await fetchStateSample(uf);
  return deriveHomeDiscovery(ads, uf);
}

/**
 * Derivação PURA (testável) — dada a amostra de anúncios reais do estado,
 * monta as seções. INVARIANTE: um item só entra se ≥1 anúncio da amostra o
 * satisfaz, garantindo destino não-vazio. Sem I/O aqui.
 */
export function deriveHomeDiscovery(ads: SampleAd[], stateUf: string): HomeDiscovery {
  const uf = (stateUf || "").trim().toUpperCase();
  if (!uf || ads.length === 0) return EMPTY;

  // Perfis — mostra o chip só se algum anúncio da amostra satisfaz o filtro.
  const profiles: HomeProfileChip[] = PROFILE_CANDIDATES.filter((c) => ads.some(c.match)).map(
    (c) => ({ key: c.key, label: c.label, href: comprarHref(uf, c.filters) })
  );

  // Faixas de preço — mostra a faixa só se há anúncio dentro dela.
  const priceBuckets: HomePriceBucketLink[] = PRICE_BUCKETS.filter((b) =>
    ads.some((a) => a.price != null && a.price >= b.min && (b.max == null || a.price <= b.max))
  ).map((b) => ({ key: b.key, label: b.label, href: comprarHref(uf, b.filters) }));

  // Modelos — agrupa marca+modelo por contagem na amostra (garantido > 0).
  const modelCounts = new Map<string, { brand: string; model: string; total: number }>();
  for (const a of ads) {
    if (!a.brand || !a.model) continue;
    const key = `${a.brand}|||${a.model}`;
    const entry = modelCounts.get(key);
    if (entry) entry.total += 1;
    else modelCounts.set(key, { brand: a.brand, model: a.model, total: 1 });
  }
  const models: HomeModelLink[] = [...modelCounts.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((m) => ({
      label: capitalizeWords(`${m.brand} ${m.model}`),
      href: comprarHref(uf, { brand: m.brand, model: m.model }),
      total: m.total,
    }));

  // Cidades — "cidades com mais anúncios" por contagem na amostra. Slug REAL
  // do banco; validado por defesa (descarta slug malformado → nunca 404).
  const cityCounts = new Map<string, { name: string; slug: string; total: number }>();
  for (const a of ads) {
    if (!a.city_slug || !a.city) continue;
    if (!isValidBrazilianCitySlug(a.city_slug)) continue;
    const entry = cityCounts.get(a.city_slug);
    if (entry) entry.total += 1;
    else cityCounts.set(a.city_slug, { name: a.city, slug: a.city_slug, total: 1 });
  }
  const cities: HomeSeoCity[] = [...cityCounts.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((c, i) => ({ id: i, name: c.name, slug: c.slug }));

  return { profiles, models, priceBuckets, cities };
}
