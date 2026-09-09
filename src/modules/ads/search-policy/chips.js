// src/modules/ads/search-policy/chips.js
//
// Chips (§5.4, §7.2, §7.6, DEFAULT §12). Puro. Um chip por parâmetro ativo da
// URL, 1:1, removível — remove_params são os nomes da API. O chip de origem
// não é removível na página de cidade (a origem É a página).

import { optionLabel } from "./facets-policy.js";
import { GEO_MODE } from "./scope-resolver.js";
import { LOCATION_SOURCE } from "./location-resolver.js";

function fmtMil(value) {
  return `R$ ${Math.round(Number(value) / 1000)} mil`;
}

const TIER_LABELS = Object.freeze({ 4: "Destaques", 3: "Pró", 2: "Start", 1: "Grátis" });

export function buildChips(ctx, scope) {
  const f = ctx.filters;
  const chips = [];
  const add = (key, label, remove_params) => chips.push({ key, label, remove_params });

  if (f.q) add("q", String(f.q), ["q"]);
  if (f.brand) add("brand", optionLabel("brand", f.brand), ["brand"]);
  if (f.commercial_model) add("commercial_model", String(f.commercial_model), ["commercial_model"]);
  if (f.year_from !== undefined || f.year_to !== undefined) {
    let label;
    if (f.year_from !== undefined && f.year_to !== undefined)
      label = f.year_from === f.year_to ? String(f.year_from) : `${f.year_from}–${f.year_to}`;
    else if (f.year_from !== undefined) label = `${f.year_from}+`;
    else label = `até ${f.year_to}`;
    add("year", label, ["year_min", "year_max"]);
  }
  if (f.price_min !== undefined || f.price_max !== undefined) {
    let label;
    if (f.price_min !== undefined && f.price_max !== undefined)
      label = `${fmtMil(f.price_min)} a ${fmtMil(f.price_max)}`;
    else if (f.price_max !== undefined) label = `até ${fmtMil(f.price_max)}`;
    else label = `a partir de ${fmtMil(f.price_min)}`;
    add("price", label, ["price_min", "price_max"]);
  }
  if (f.mileage_max !== undefined)
    add("mileage", `até ${Number(f.mileage_max).toLocaleString("pt-BR")} km`, ["mileage_max"]);
  if (f.transmission)
    add("transmission", optionLabel("transmission", f.transmission), ["transmission"]);
  if (f.fuel) add("fuel", optionLabel("fuel", f.fuel), ["fuel_type"]);
  if (f.body_type) add("body_type", optionLabel("body_type", f.body_type), ["body_type"]);
  if (f.seller_kind) add("seller_kind", optionLabel("seller_kind", f.seller_kind), ["seller_kind"]);
  if (f.below_fipe === true) add("below_fipe", "Abaixo da FIPE", ["below_fipe"]);
  if (f.opportunity === true) add("opportunity", "Oportunidades", ["opportunity"]);
  if (f.priority_tier !== undefined)
    add("priority_tier", TIER_LABELS[Number(f.priority_tier)] || `Camada ${f.priority_tier}`, [
      "priority_tier",
    ]);

  if (ctx.origin && scope.geo_mode !== GEO_MODE.NATIONAL && scope.geo_mode !== GEO_MODE.STATE) {
    const name = ctx.origin.name;
    const r = scope.effective_radius_km;
    let label;
    if (scope.geo_mode === GEO_MODE.EXACT_CITY || r === 0) label = `Apenas ${name}`;
    else if (scope.geo_mode === GEO_MODE.AUTO_RADIUS) label = `${name} · ${r} km (automático)`;
    else label = `${name} · ${r} km`;
    chips.push({
      key: "geo",
      label,
      removable: ctx.location_source !== LOCATION_SOURCE.CITY_PAGE,
      remove_params:
        ctx.location_source === LOCATION_SOURCE.CITY_PAGE ? [] : ["origem", "origem_src", "raio"],
    });
  } else if (scope.geo_mode === GEO_MODE.STATE && ctx.uf) {
    chips.push({
      key: "geo",
      label: `Estado de ${ctx.uf}`,
      removable: true,
      remove_params: ["escopo", "state"],
    });
  }
  return chips;
}
