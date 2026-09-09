// src/modules/ads/search-policy/product-resolver.js
//
// Resolvedor de produto do caminho v1 (D2). Lê o texto livre `q` e devolve os
// filtros estruturados que o CandidateScope entende, mais o `q` residual
// ("versão", §4.3). Parâmetros explícitos da URL sempre vencem o inferido.
//
// Diferenças deliberadas em relação ao parser legado (que segue intocado):
//   1. Casamento por FRONTEIRA DE PALAVRA (text.js#matchWordBoundary), não
//      por substring. Corrige "at" ⊂ "atibaia"/"fiat" → automático.
//   2. Cidade NÃO é inferida aqui: é o LocationResolver quem decide, e só
//      pelos padrões explícitos de §4.2 ("em <cidade>"), com cidade que tenha
//      estoque. Corrige "ico" ⊂ "automático" → Icó-CE.
//   3. Modelo resolve para `commercial_model` (rótulo, ex.: "Onix"), pela
//      coluna da F1 — não para a descrição FIPE inteira.
//
// Puro dado os dicionários: `resolveProduct(q, filters, dictionaries)`.

import {
  BODY_TYPE_SYNONYMS,
  FUEL_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "../ads.canonical.constants.js";
import { BELOW_FIPE_TERMS } from "../filters/ads-free-query.constants.js";
import {
  buildResidualQuery,
  extractPriceSignals,
  extractYearSignals,
  matchWordBoundary,
  normalizeText,
} from "./text.js";

function pickLongestMatch(normalizedText, candidates, keys) {
  let best = null;
  for (const candidate of candidates) {
    for (const key of keys) {
      const phrase = candidate[key];
      if (!phrase) continue;
      const re = matchWordBoundary(normalizedText, phrase);
      if (!re) continue;
      const len = phrase.length;
      if (!best || len > best.len || (len === best.len && candidate.total > best.candidate.total)) {
        best = { candidate, re, len };
      }
    }
  }
  return best;
}

function matchSynonym(normalizedText, map) {
  let best = null;
  for (const [canonical, variants] of Object.entries(map)) {
    for (const variant of variants) {
      const re = matchWordBoundary(normalizedText, variant);
      if (!re) continue;
      const len = normalizeText(variant).length;
      if (!best || len > best.len) best = { canonical, re, len };
    }
  }
  return best;
}

/**
 * @param {string} q texto livre (pode ser vazio)
 * @param {object} filters filtros explícitos da URL (nomes da API: brand,
 *   commercial_model, transmission, fuel_type, body_type, year_min/max,
 *   price_min/max, mileage_max, below_fipe, seller_kind, opportunity, priority_tier)
 * @param {{ brands, commercialModels }} dictionaries
 * @returns {{ filters: object, residual_q: string, consumed: string[] }}
 *   `filters` com os nomes INTERNOS da spec (year_from/year_to, price_min/max, fuel…)
 */
export function resolveProduct(q, filters = {}, dictionaries = {}) {
  const text = normalizeText(q);
  const consumed = [];
  const consumedRegexes = [];
  const inferred = {};

  if (text) {
    const brands = dictionaries.brands || [];
    const brandHit = pickLongestMatch(text, brands, ["normalized", "suffix"]);
    if (brandHit) {
      inferred.brand = brandHit.candidate.original;
      consumed.push("brand");
      consumedRegexes.push(brandHit.re);
    }

    let models = dictionaries.commercialModels || [];
    if (brandHit) {
      const same = models.filter((m) => m.brandNormalized === brandHit.candidate.normalized);
      if (same.length) models = same;
    }
    const modelHit = pickLongestMatch(text, models, ["normalized"]);
    if (modelHit) {
      inferred.commercial_model = modelHit.candidate.label;
      consumed.push("commercial_model");
      consumedRegexes.push(modelHit.re);
      // A marca NÃO é inferida do modelo: "onix" resolve para commercial_model
      // apenas. Um chip "Chevrolet" redundante e uma dimensão a mais em
      // specificity não são o que o gate aprovado descreve (specificity 3).
    }

    const transmission = matchSynonym(text, TRANSMISSION_SYNONYMS);
    if (transmission) {
      inferred.transmission = transmission.canonical;
      consumed.push("transmission");
      consumedRegexes.push(transmission.re);
    }
    const fuel = matchSynonym(text, FUEL_SYNONYMS);
    if (fuel) {
      inferred.fuel = fuel.canonical;
      consumed.push("fuel");
      consumedRegexes.push(fuel.re);
    }
    const body = matchSynonym(text, BODY_TYPE_SYNONYMS);
    if (body) {
      inferred.body_type = body.canonical;
      consumed.push("body_type");
      consumedRegexes.push(body.re);
    }

    const price = extractPriceSignals(text);
    if (price.min_price !== undefined) inferred.price_min = price.min_price;
    if (price.max_price !== undefined) inferred.price_max = price.max_price;
    const year = extractYearSignals(text);
    if (year.year_min !== undefined) inferred.year_from = year.year_min;
    if (year.year_max !== undefined) inferred.year_to = year.year_max;

    for (const term of BELOW_FIPE_TERMS) {
      const re = matchWordBoundary(text, term);
      if (re) {
        inferred.below_fipe = true;
        consumedRegexes.push(re);
        break;
      }
    }
  }

  // Explícito vence inferido.
  const explicit = {
    brand: filters.brand,
    commercial_model: filters.commercial_model,
    transmission: filters.transmission,
    fuel: filters.fuel_type ?? filters.fuel,
    body_type: filters.body_type,
    year_from: filters.year_min ?? filters.year_from,
    year_to: filters.year_max ?? filters.year_to,
    price_min: filters.price_min ?? filters.min_price,
    price_max: filters.price_max ?? filters.max_price,
    mileage_max: filters.mileage_max,
    below_fipe: filters.below_fipe,
    seller_kind: filters.seller_kind,
    opportunity: filters.opportunity,
    priority_tier: filters.priority_tier,
  };

  // Explícito vence inferido — mas só quando VEIO na URL. Espalhar chaves com
  // undefined por cima do inferido apagaria o que o texto resolveu.
  const out = {};
  for (const [key, value] of Object.entries(inferred)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  for (const [key, value] of Object.entries(explicit)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }

  const residual_q = text ? buildResidualQuery(text, consumedRegexes) : "";
  return { filters: out, residual_q, consumed };
}
