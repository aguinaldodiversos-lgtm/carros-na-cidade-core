import "server-only";

import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * Loader de "descoberta" da Home — alimenta a seção "Busca por perfil"
 * (chips temáticos) da reestruturação 2026-07-11.
 *
 * (Histórico: também alimentava o bloco SEO "Continue sua busca" com colunas
 * Por cidade/modelo/preço. Esse bloco foi removido por duplicar o rodapé —
 * que já tem "Modelos mais buscados" e "Cidades com mais carros" em todas as
 * páginas — e a faixa de preço já viver no filtro lateral. Só os PERFIS
 * seguem aqui.)
 *
 * REGRA DE OURO (briefing): nenhum chip pode levar a 404 ou a página vazia.
 *
 * ESTRATÉGIA — 1 FETCH, DERIVA. Buscamos UMA amostra do catálogo do estado
 * (`/api/ads/search?state=UF&limit=50`) e derivamos os perfis a partir dos
 * anúncios retornados. Vantagens:
 *   1. Um chip só aparece se HÁ ≥1 anúncio real que o satisfaz — o destino
 *      nunca é vazio (impossível gerar falso-positivo).
 *   2. Um único request ao backend — não dispara o rate limiter (a abordagem
 *      anterior, com probes concorrentes por render, era bloqueada e escondia
 *      chips válidos por engano).
 *
 * Limite conhecido: com inventário acima de 50, um perfil que só tem anúncios
 * FORA da amostra pode ficar oculto (falso-negativo). É o lado seguro do
 * trade-off: escondemos demais, nunca linkamos para vazio. Em estados de
 * baixo volume a amostra ≈ catálogo inteiro.
 */

const SAMPLE_LIMIT = 50;

export interface HomeProfileChip {
  key: string;
  label: string;
  href: string;
}

export interface HomeDiscovery {
  profiles: HomeProfileChip[];
}

const EMPTY: HomeDiscovery = { profiles: [] };

/** Linha crua de anúncio — só os campos que os perfis usam. */
export interface SampleAd {
  price: number | null;
  year: number | null;
  body_type: string | null;
  below_fipe: boolean;
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
        body_type: toStr(r.body_type)?.toLowerCase() ?? null,
        below_fipe: r.below_fipe === true,
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

export async function fetchHomeDiscovery(stateUf: string): Promise<HomeDiscovery> {
  const uf = (stateUf || "").trim().toUpperCase();
  if (!uf) return EMPTY;

  const ads = await fetchStateSample(uf);
  return deriveHomeDiscovery(ads, uf);
}

/**
 * Derivação PURA (testável) — dada a amostra de anúncios reais do estado,
 * monta os chips de perfil. INVARIANTE: um chip só entra se ≥1 anúncio da
 * amostra o satisfaz, garantindo destino não-vazio. Sem I/O aqui.
 */
export function deriveHomeDiscovery(ads: SampleAd[], stateUf: string): HomeDiscovery {
  const uf = (stateUf || "").trim().toUpperCase();
  if (!uf || ads.length === 0) return EMPTY;

  const profiles: HomeProfileChip[] = PROFILE_CANDIDATES.filter((c) => ads.some(c.match)).map(
    (c) => ({ key: c.key, label: c.label, href: comprarHref(uf, c.filters) })
  );

  return { profiles };
}
