// src/modules/ads/filters/ads-filter.parser.js

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { AdsFacetFilterSchema, AdsFilterSchema } from "./ads-filter.schema.js";
import { ADS_SCOPE_CONFIG } from "./ads-filter.constants.js";
import { inferAdsFiltersFromFreeQuery } from "./ads-free-query.parser.js";

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "")
  );
}

function applyScope(scope, parsed) {
  const scopeConfig = ADS_SCOPE_CONFIG[scope];

  if (!scopeConfig) {
    throw new AppError(`Escopo de filtro inválido: ${scope}`, 500);
  }

  return {
    ...parsed,
    ...scopeConfig.force,
  };
}

function validateNormalizedRanges(data) {
  if (
    data.min_price !== undefined &&
    data.max_price !== undefined &&
    data.min_price > data.max_price
  ) {
    throw new AppError("Faixa de preço inválida", 400);
  }

  if (data.year_min !== undefined && data.year_max !== undefined && data.year_min > data.year_max) {
    throw new AppError("Faixa de ano inválida", 400);
  }

  return data;
}

/**
 * Filtro canônico: highlight_only (somente anúncios com destaque ativo).
 * highlight= (schema) é alias legado — mesmo efeito. Não confundir com sort=highlight (ordenação).
 */
function normalizeHighlightFilter(data) {
  if (!data || typeof data !== "object") return data;

  const ho = data.highlight_only;
  const hl = data.highlight;

  if (ho === true || hl === true) {
    return { ...data, highlight_only: true };
  }
  if (ho === false || hl === false) {
    return { ...data, highlight_only: false };
  }

  return { ...data };
}

/**
 * Território canônico: city_slug > city_slugs > city_id > city+state (legado).
 * Remove AND redundante entre slug, lista, id e texto/UF.
 *
 * Diferenças entre city_slug e city_slugs:
 *   - city_slug (singular): wins sobre tudo, strip TUDO mais (slug encoda UF).
 *   - city_slugs (plural):  multi-cidade. Strip city/city_id; mantém `state`
 *     se presente (defesa em profundidade contra slug com UF errada/corrupta;
 *     a confiança no slug não é total como no caso single-city porque é
 *     possível alguém compor uma lista grande mal-formada).
 *
 * SEGURANÇA — `base_city_id`:
 *   A "cidade-base" do filtro multi-cidade é DERIVADA INTERNAMENTE de
 *   city_slugs[0] (ver ads-filter.builder.js). NUNCA aceitamos
 *   `base_city_id` ou `base_city_slug` vindos do query string público —
 *   permitir isso deixaria o visitante manipular o boost de ranking
 *   (impulsionar artificialmente um anúncio de cidade específica).
 *
 *   O Zod schema usa `passthrough()`, então um caller pode enviar
 *   `?base_city_id=42` e o campo sobrevive ao parse. O builder atual não
 *   destrutura essa chave, mas stripamos defensivamente aqui para
 *   eliminar QUALQUER chance de uso futuro acidental por outro consumer
 *   (autocomplete, facets, etc).
 *
 * Mantém a regra atual de city_slug intacta — pré-requisito da trava
 * "não quebrar city_slug atual".
 */
function normalizeTerritoryFilters(data) {
  if (!data || typeof data !== "object") return data;

  // Strip defensivo: base_city_id NUNCA é input público. Idem base_city_slug.
  // Belt-and-suspenders contra futuros consumers que esquecam de filtrar.
  if ("base_city_id" in data || "base_city_slug" in data) {
    const sanitized = { ...data };
    delete sanitized.base_city_id;
    delete sanitized.base_city_slug;
    data = sanitized;
  }

  const slug = typeof data.city_slug === "string" ? data.city_slug.trim() : "";
  if (slug) {
    const next = { ...data, city_slug: slug };
    delete next.city_slugs;
    delete next.city_id;
    delete next.city;
    delete next.state;
    return next;
  }

  if (Array.isArray(data.city_slugs) && data.city_slugs.length > 0) {
    const next = { ...data, city_slugs: data.city_slugs };
    delete next.city_slug;
    delete next.city;
    delete next.city_id;
    // state PERMANECE se foi enviado: AND-ed com c.slug = ANY($n) no builder
    // como safety net contra slugs com UF inconsistente.
    return next;
  }

  if (data.city_id != null && Number.isFinite(Number(data.city_id))) {
    const next = { ...data, city_id: Number(data.city_id) };
    delete next.city_slug;
    delete next.city_slugs;
    delete next.city;
    delete next.state;
    return next;
  }

  return data;
}

export async function parseAdsFilters(raw = {}, scope = "public_global") {
  const candidate = compactObject(raw);
  const parsed = AdsFilterSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AppError("Filtros de busca inválidos", 400);
  }

  const scoped = applyScope(scope, parsed.data);
  const inferred = await inferAdsFiltersFromFreeQuery(scoped);

  return validateNormalizedRanges(normalizeTerritoryFilters(normalizeHighlightFilter(inferred)));
}

export async function parseAdsFacetFilters(raw = {}) {
  const candidate = compactObject(raw);
  const parsed = AdsFacetFilterSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AppError("Filtros de facet inválidos", 400);
  }

  const inferred = await inferAdsFiltersFromFreeQuery(parsed.data);
  return normalizeTerritoryFilters(normalizeHighlightFilter(inferred));
}
