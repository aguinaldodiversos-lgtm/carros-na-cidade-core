// src/modules/ads/search-policy/facets-policy.js
//
// Facetas vivas e abertas (§4.6, §5.1, §5.2, D6, E2).
//
// • Toda faceta de veículo usa o CandidateScope. Opção com count 0 não é
//   emitida — salvo a opção ATIVA, sempre emitida e marcada active:true (E2).
// • Faceta com menos de min_options_to_render opções não é emitida, salvo se
//   tiver filtro ativo (precisa aparecer para permitir remoção).
// • Self-excluding: faceta com filtro ativo conta com o CandidateScope SEM o
//   próprio filtro — uma query por faceta ativa. As demais saem de UMA query
//   com GROUPING SETS (§10: 1 + 1 por faceta ativa).
// • "Modelo" agrega commercial_model (NULL fora). "Versão" (a.model) só existe
//   quando commercial_model está selecionado, sempre em "Mais filtros".
// • Abertas: always_open (D6) + as de maior entropia até open_max (que inclui
//   as always_open); faceta com filtro ativo abre sempre e não conta no
//   limite. Empate pela ordem fixa de §5.2.

import { pool } from "../../../infrastructure/database/db.js";
import { sellerKindExpr } from "../filters/ads-ranking.sql.js";
import { buildCandidateScope } from "./candidate-scope.js";

/** DEFAULT §12 registrado: faixas de quilometragem (a política não as define). */
export const MILEAGE_BUCKETS = Object.freeze([20000, 50000, 80000, 120000, 200000]);

/** Ordem de desempate da entropia (§5.2). */
export const FACET_TIEBREAK_ORDER = Object.freeze([
  "price",
  "brand",
  "commercial_model",
  "year",
  "transmission",
  "body_type",
  "fuel",
  "mileage",
  "seller_kind",
]);

const FACET_LABELS = Object.freeze({
  price: "Preço",
  brand: "Marca",
  commercial_model: "Modelo",
  year: "Ano",
  transmission: "Câmbio",
  body_type: "Carroceria",
  fuel: "Combustível",
  mileage: "Quilometragem",
  seller_kind: "Vendedor",
  version: "Versão",
});

/** Filtros internos que cada faceta representa (self-excluding e active_value). */
export const FACET_FILTER_KEYS = Object.freeze({
  price: ["price_min", "price_max"],
  brand: ["brand"],
  commercial_model: ["commercial_model"],
  year: ["year_from", "year_to"],
  transmission: ["transmission"],
  body_type: ["body_type"],
  fuel: ["fuel"],
  mileage: ["mileage_max"],
  seller_kind: ["seller_kind"],
  version: ["q"],
});

function fmtMil(value) {
  const n = Number(value);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR")} mi`;
  return `R$ ${Math.round(n / 1000)} mil`;
}

export function priceBucketOptions(buckets) {
  const edges = [0, ...buckets];
  const out = [];
  for (let i = 0; i < edges.length; i += 1) {
    const lo = edges[i];
    const hi = edges[i + 1];
    if (hi === undefined) out.push({ index: i, value: `${lo}-`, label: `acima de ${fmtMil(lo)}` });
    else if (lo === 0) out.push({ index: i, value: `0-${hi}`, label: `até ${fmtMil(hi)}` });
    else out.push({ index: i, value: `${lo}-${hi}`, label: `${fmtMil(lo)} a ${fmtMil(hi)}` });
  }
  return out;
}

function mileageBucketOptions() {
  const edges = [0, ...MILEAGE_BUCKETS];
  const km = (v) => `${v.toLocaleString("pt-BR")} km`;
  const out = [];
  for (let i = 0; i < edges.length; i += 1) {
    const lo = edges[i];
    const hi = edges[i + 1];
    if (hi === undefined) out.push({ index: i, value: `${lo}-`, label: `acima de ${km(lo)}` });
    else if (lo === 0) out.push({ index: i, value: `0-${hi}`, label: `até ${km(hi)}` });
    else out.push({ index: i, value: `${lo}-${hi}`, label: `${km(lo)} a ${km(hi)}` });
  }
  return out;
}

function cap(s) {
  const t = String(s || "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const VALUE_LABELS = Object.freeze({
  transmission: { manual: "Manual", automatico: "Automático", cvt: "CVT" },
  fuel: {
    flex: "Flex",
    gasolina: "Gasolina",
    diesel: "Diesel",
    eletrico: "Elétrico",
    hibrido: "Híbrido",
    gnv: "GNV",
    etanol: "Etanol",
  },
  body_type: {
    suv: "SUV",
    hatch: "Hatch",
    sedan: "Sedan",
    picape: "Picape",
    coupe: "Coupé",
    minivan: "Minivan",
    wagon: "Wagon",
    van: "Van",
    outro: "Outro",
  },
  seller_kind: { dealer: "Lojas", private: "Particulares" },
});

/** Rótulo de exibição (DEFAULT §12: marca com prefixo de grupo mostra a parte após " - "). */
export function optionLabel(key, value) {
  if (value == null) return "";
  if (key === "brand") {
    const s = String(value);
    return s.includes(" - ") ? s.split(" - ").pop().trim() : s;
  }
  const map = VALUE_LABELS[key];
  if (map && map[String(value).toLowerCase()]) return map[String(value).toLowerCase()];
  return cap(value);
}

/** Entropia de Shannon em bits sobre as opções emitidas (1 opção → 0). */
export function computeEntropy(options) {
  const total = options.reduce((s, o) => s + Number(o.count || 0), 0);
  if (!total || options.length <= 1) return 0;
  let h = 0;
  for (const o of options) {
    const p = Number(o.count || 0) / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return Number(h.toFixed(4));
}

/** Expressão SQL de agrupamento por faceta. */
export function facetExpression(key, policy) {
  switch (key) {
    case "price":
      return `width_bucket(a.price, ARRAY[${policy.facets.price_buckets.map(Number).join(",")}]::numeric[])`;
    case "brand":
      return "a.brand";
    case "commercial_model":
      return "a.commercial_model";
    case "year":
      return "((a.year / 2) * 2)";
    case "transmission":
      return "COALESCE(a.transmission, a.gearbox, a.cambio)";
    case "body_type":
      return "a.body_type";
    case "fuel":
      return "a.fuel_type";
    case "mileage":
      return `width_bucket(a.mileage, ARRAY[${MILEAGE_BUCKETS.join(",")}]::numeric[])`;
    case "seller_kind":
      return sellerKindExpr;
    case "version":
      return "a.model";
    default:
      throw new Error(`faceta desconhecida: ${key}`);
  }
}

/** Valor ativo (string) de uma faceta a partir dos filtros internos. */
export function activeValueFor(key, filters) {
  switch (key) {
    case "price":
      if (filters.price_min === undefined && filters.price_max === undefined) return null;
      return `${filters.price_min ?? 0}-${filters.price_max ?? ""}`;
    case "year":
      if (filters.year_from === undefined && filters.year_to === undefined) return null;
      return `${filters.year_from ?? ""}-${filters.year_to ?? ""}`;
    case "mileage":
      return filters.mileage_max === undefined ? null : `0-${filters.mileage_max}`;
    case "version":
      return filters.q ? String(filters.q) : null;
    default: {
      const k = FACET_FILTER_KEYS[key][0];
      return filters[k] === undefined || filters[k] === null || filters[k] === ""
        ? null
        : String(filters[k]);
    }
  }
}

export function facetKeysFor(filters) {
  const keys = [...FACET_TIEBREAK_ORDER];
  if (filters.commercial_model) keys.push("version");
  return keys;
}

/** Query única das facetas SEM filtro ativo (GROUPING SETS). Exportada para o teste estrutural. */
export function buildPassiveFacetsQuery(ctx, policy, passiveKeys) {
  const scope = buildCandidateScope(ctx);
  const exprs = passiveKeys.map((k, i) => `${facetExpression(k, policy)} AS f${i}`);
  const groupings = passiveKeys.map((_, i) => `GROUPING(f${i}) AS g${i}`);
  const sql = `
      SELECT ${groupings.join(", ")}, ${passiveKeys.map((_, i) => `f${i}`).join(", ")}, COUNT(*)::int AS count
      FROM (
        SELECT ${exprs.join(", ")}
        FROM ads a ${scope.joins}
        ${scope.whereClause}
      ) x
      GROUP BY GROUPING SETS (${passiveKeys.map((_, i) => `(f${i})`).join(", ")})`;
  return { sql, params: scope.params };
}

/** Query de UMA faceta ativa, sem o próprio filtro (self-excluding). */
export function buildActiveFacetQuery(ctx, policy, key) {
  const scope = buildCandidateScope(ctx, { exclude: FACET_FILTER_KEYS[key] });
  const sql = `
      SELECT ${facetExpression(key, policy)} AS value, COUNT(*)::int AS count
      FROM ads a ${scope.joins}
      ${scope.whereClause}
      GROUP BY 1`;
  return { sql, params: scope.params };
}

function decodeRows(key, rows, policy) {
  const priceOpts = key === "price" ? priceBucketOptions(policy.facets.price_buckets) : null;
  const mileageOpts = key === "mileage" ? mileageBucketOptions() : null;
  const options = [];
  for (const row of rows) {
    const raw = row.value;
    if (raw == null) continue;
    const count = Number(row.count || 0);
    if (key === "price") {
      const o = priceOpts[Number(raw)];
      if (o) options.push({ value: o.value, label: o.label, count });
    } else if (key === "mileage") {
      const o = mileageOpts[Number(raw)];
      if (o) options.push({ value: o.value, label: o.label, count });
    } else if (key === "year") {
      const y = Number(raw);
      options.push({ value: `${y}-${y + 1}`, label: `${y}–${y + 1}`, count });
    } else {
      options.push({ value: String(raw), label: optionLabel(key, raw), count });
    }
  }
  if (key === "year")
    options.sort((a, b) => Number(b.value.split("-")[0]) - Number(a.value.split("-")[0]));
  else if (key === "price" || key === "mileage")
    options.sort((a, b) => Number(a.value.split("-")[0]) - Number(b.value.split("-")[0]));
  else options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  return options;
}

function sameValue(key, optionValue, active) {
  if (key === "price" || key === "mileage" || key === "year") return false; // faixa ativa é intervalo livre
  return String(optionValue).toLowerCase() === String(active).toLowerCase();
}

function activeLabel(key, active, filters) {
  if (key === "price") {
    if (filters.price_min !== undefined && filters.price_max !== undefined)
      return `${fmtMil(filters.price_min)} a ${fmtMil(filters.price_max)}`;
    if (filters.price_max !== undefined) return `até ${fmtMil(filters.price_max)}`;
    return `a partir de ${fmtMil(filters.price_min)}`;
  }
  if (key === "year") {
    if (filters.year_from !== undefined && filters.year_to !== undefined)
      return filters.year_from === filters.year_to
        ? String(filters.year_from)
        : `${filters.year_from}–${filters.year_to}`;
    if (filters.year_from !== undefined) return `${filters.year_from}+`;
    return `até ${filters.year_to}`;
  }
  if (key === "mileage") return `até ${Number(filters.mileage_max).toLocaleString("pt-BR")} km`;
  return optionLabel(key, active);
}

/**
 * Monta as facetas a partir de linhas já contadas (puro; testável sem banco).
 * `rowsByKey`: Map key → [{ value, count }].
 */
export function assembleFacets(rowsByKey, filters, policy) {
  const facets = [];
  for (const k of facetKeysFor(filters)) {
    const active = activeValueFor(k, filters);
    let options = decodeRows(k, rowsByKey.get(k) || [], policy).filter((o) => o.count > 0);
    if (active !== null) {
      // E2: opção ativa sempre emitida, mesmo com count 0.
      const idx = options.findIndex((o) => sameValue(k, o.value, active));
      if (idx >= 0) options[idx] = { ...options[idx], active: true };
      else
        options.unshift({
          value: active,
          label: activeLabel(k, active, filters),
          count: 0,
          active: true,
        });
    }
    const minOptions = Number(policy.facets.min_options_to_render) || 2;
    if (active === null && options.length < minOptions) continue;
    facets.push({
      key: k,
      label: FACET_LABELS[k],
      open: false,
      entropy: computeEntropy(options.filter((o) => o.count > 0)),
      active_value: active,
      options,
    });
  }
  return decideOpenFacets(facets, policy);
}

/**
 * Executa as queries e monta as facetas.
 * @param {object} ctx { filters, territory }
 * @returns {{ facets: Array, queries: number }}
 */
export async function computeFacets(ctx, policy, deps = {}) {
  const db = deps.db || pool;
  const keys = facetKeysFor(ctx.filters);
  const activeKeys = keys.filter((k) => activeValueFor(k, ctx.filters) !== null);
  const passiveKeys = keys.filter((k) => activeValueFor(k, ctx.filters) === null);
  const rowsByKey = new Map();
  let queries = 0;

  if (passiveKeys.length) {
    const { sql, params } = buildPassiveFacetsQuery(ctx, policy, passiveKeys);
    const { rows } = await db.query(sql, params);
    queries += 1;
    passiveKeys.forEach((k, i) => {
      rowsByKey.set(
        k,
        rows
          .filter((r) => Number(r[`g${i}`]) === 0)
          .map((r) => ({ value: r[`f${i}`], count: r.count }))
      );
    });
  }
  for (const k of activeKeys) {
    const { sql, params } = buildActiveFacetQuery(ctx, policy, k);
    const { rows } = await db.query(sql, params);
    queries += 1;
    rowsByKey.set(k, rows);
  }

  return { facets: assembleFacets(rowsByKey, ctx.filters, policy), queries };
}

/** Abertura (§5.2 + D6). Puro. */
export function decideOpenFacets(facets, policy) {
  const alwaysOpen = new Set(policy.facets.always_open || []);
  const openMax = Number(policy.facets.open_max) || 3;
  const byKey = new Map(facets.map((f) => [f.key, f]));

  for (const f of facets) f.open = f.active_value !== null; // ativa abre sempre, fora do limite
  let slots = openMax;
  for (const key of alwaysOpen) {
    const f = byKey.get(key);
    if (!f) continue;
    if (!f.open) {
      f.open = true;
      slots -= 1;
    }
  }
  const candidates = facets
    .filter((f) => !f.open && f.key !== "version")
    .sort(
      (a, b) =>
        b.entropy - a.entropy ||
        FACET_TIEBREAK_ORDER.indexOf(a.key) - FACET_TIEBREAK_ORDER.indexOf(b.key)
    );
  for (const f of candidates) {
    if (slots <= 0) break;
    f.open = true;
    slots -= 1;
  }
  return facets;
}
