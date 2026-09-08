// src/modules/ads/search-policy/policy-config.js
//
// Search Policy Engine v2.1 — parâmetros de política (§2 do prompt).
//
// Fonte de verdade em runtime: `platform_settings.search_policy` (migration
// 065). Fallback: `SEARCH_POLICY_DEFAULT` abaixo — o MESMO JSON, byte a byte
// (provado por tests/search-policy/policy-config.test.js, que lê a migration).
//
// Regra §2: nenhum destes números pode aparecer hardcoded em outro lugar. Todo
// consumidor (F2+) passa por `loadSearchPolicy()`.
//
// Fase F1 cria só a constante e o loader; não há consumidor ainda (o motor é F2).

import { getSetting } from "../../platform/settings.service.js";
import { logger } from "../../../shared/logger.js";

export const SEARCH_POLICY_SETTING_KEY = "search_policy";

export const SEARCH_POLICY_DEFAULT = Object.freeze({
  version: "v1",
  rings_auto: [0, 25, 50, 75, 150],
  rings_manual: [0, 25, 50, 75],
  profiles: {
    BROWSE_CITY: { target: 20, max_auto_radius: 75 },
    BROWSE_CATEGORY: { target: 16, max_auto_radius: 75 },
    SEARCH_BRAND: { target: 16, max_auto_radius: 150 },
    SEARCH_MODEL: { target: 12, max_auto_radius: 150 },
    SEARCH_MODEL_YEAR: { target: 8, max_auto_radius: 150 },
    SEARCH_VERSION: { target: 4, max_auto_radius: 150 },
  },
  liquidity_cache_ttl_seconds: 900,
  facets: {
    open_max: 3,
    min_options_to_render: 2,
    price_buckets: [40000, 60000, 80000, 100000, 150000, 200000, 300000],
    always_available_in_more_filters: [
      "brand",
      "commercial_model",
      "price",
      "year",
      "mileage",
      "transmission",
      "fuel",
      "body_type",
      "seller_kind",
    ],
  },
  relaxations: {
    show_when_total_below_target: true,
    max_items: 3,
    steps: {
      radius: "next_ring",
      year_from: -2,
      price_max: 0.15,
      mileage_max: 0.25,
      transmission: "remove",
      fuel: "remove",
      body_type: "remove",
      seller_kind: "remove",
    },
    priority_order: [
      "radius",
      "transmission",
      "price_max",
      "year_from",
      "mileage_max",
      "fuel",
      "body_type",
      "seller_kind",
    ],
  },
  explicit_query_patterns: [
    "\\bem\\s+",
    "\\bde\\s+",
    "\\bperto\\s+de\\s+",
    "\\bna\\s+cidade\\s+de\\s+",
  ],
});

/** Validação mínima de shape — evita que um JSON parcial no banco quebre o motor. */
export function isValidSearchPolicy(value) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.rings_auto) || !Array.isArray(value.rings_manual)) return false;
  if (!value.profiles || typeof value.profiles !== "object") return false;
  for (const key of Object.keys(SEARCH_POLICY_DEFAULT.profiles)) {
    const p = value.profiles[key];
    if (!p || !Number.isFinite(Number(p.target)) || !Number.isFinite(Number(p.max_auto_radius)))
      return false;
  }
  if (!value.facets || !value.relaxations) return false;
  return true;
}

/**
 * Lê a política de `platform_settings` (cache de 60 s do settings.service).
 * Qualquer falha, ausência ou shape inválido → `SEARCH_POLICY_DEFAULT` + warn
 * (DEFAULT §12: "platform_settings inacessível → SEARCH_POLICY_DEFAULT e log.warn").
 */
export async function loadSearchPolicy() {
  try {
    const value = await getSetting(SEARCH_POLICY_SETTING_KEY, null);
    if (value == null) {
      logger.warn(
        "[search-policy] platform_settings.search_policy ausente — usando SEARCH_POLICY_DEFAULT"
      );
      return SEARCH_POLICY_DEFAULT;
    }
    if (!isValidSearchPolicy(value)) {
      logger.warn(
        "[search-policy] platform_settings.search_policy com shape inválido — usando SEARCH_POLICY_DEFAULT"
      );
      return SEARCH_POLICY_DEFAULT;
    }
    return value;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[search-policy] falha ao ler platform_settings.search_policy — usando SEARCH_POLICY_DEFAULT"
    );
    return SEARCH_POLICY_DEFAULT;
  }
}
