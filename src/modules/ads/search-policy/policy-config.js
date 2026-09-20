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

/**
 * F2.2-A2 — faixa do raio EXPLÍCITO (v3 §4, DEC-19/DEC-24; INV-075).
 *
 * "Um raio explícito válido é um inteiro de quilômetros entre 0 e 150,
 * inclusive; o máximo corresponde à cobertura pré-computada de
 * `region_memberships`."
 *
 * Esta faixa é uma propriedade do DADO (até onde a malha foi pré-computada),
 * não um parâmetro sintonizável de produto — por isso vive aqui como constante
 * do código e NÃO como chave de `platform_settings`. Criar uma chave nova no
 * banco para ela abriria uma segunda política de raio, editável pelo admin,
 * capaz de divergir silenciosamente da malha que a sustenta.
 *
 * Distinção que o §3 da A2 exige e que o bug corrigido nesta fase confundia:
 *
 *   faixa VÁLIDA do backend  →  qualquer inteiro em [0, 150]  (estas constantes)
 *   presets/sugestões de UX  →  `rings_manual` ([0,25,50,75] hoje)
 *
 * `rings_manual` é lista de DEGRAUS OFERECIDOS, nunca o conjunto dos valores
 * aceitos: v3 §4 "os degraus são presets de UX, não o conjunto dos valores
 * válidos". Nada no backend pode validar um raio por `rings_manual.includes()`.
 */
export const MANUAL_RADIUS_MIN_KM = 0;
export const MANUAL_RADIUS_MAX_KM = 150;

/**
 * Um raio explícito é válido? (INV-075, puro.)
 *
 * Aceita apenas inteiro em [0,150]. Rejeita negativo, > 150, fracionário,
 * não numérico, vazio e representação múltipla ("25,50"), sem NUNCA aproximar
 * para um valor aceito (INV-077).
 */
export function isValidExplicitRadius(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return false;
  const raw = String(value).trim();
  if (raw === "") return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= MANUAL_RADIUS_MIN_KM && n <= MANUAL_RADIUS_MAX_KM;
}

export const SEARCH_POLICY_DEFAULT = Object.freeze({
  version: "v1",
  rings_auto: [0, 25, 50, 75],
  rings_manual: [0, 25, 50, 75],
  profiles: {
    BROWSE_CITY: { target: 20, max_auto_radius: 75 },
    BROWSE_CATEGORY: { target: 16, max_auto_radius: 75 },
    SEARCH_BRAND: { target: 16, max_auto_radius: 75 },
    SEARCH_MODEL: { target: 12, max_auto_radius: 75 },
    SEARCH_MODEL_YEAR: { target: 8, max_auto_radius: 75 },
    SEARCH_VERSION: { target: 4, max_auto_radius: 75 },
  },
  liquidity_cache_ttl_seconds: 900,
  facets: {
    open_max: 3,
    min_options_to_render: 2,
    // D6 (F2): preço abre sempre; open_max inclui as always_open.
    always_open: ["price"],
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
  // F2.2-B1 — política de Guided Relaxation da DEC-26 (v3 §9).
  //
  // O bloco anterior (`max_items` + `steps` + priority_order começando em
  // radius) era a política que a DEC-26 declarou superada: preço +15% fixo,
  // ano −2 fixo, quilometragem +25% fixa e raio pelo "próximo anel". Saiu
  // inteiro — não fica como chave morta que um JSON antigo no banco possa
  // reativar.
  //
  // O que entra são FRONTEIRAS e QUANTUMS, não degraus: o degrau vem do
  // estoque (boundary real) e estes números só dizem quanto ele custa. São
  // parâmetros versionados de política, recalibráveis por nova decisão
  // normativa (DEC-26, "Natureza dos valores"); o que é estrutural — bandas,
  // ordem de decisão, boundary real, arredondamento para cima, teto de 150 e a
  // cadeia de desempates — está no código, não aqui.
  relaxations: {
    show_when_total_below_target: true,
    max_options: 3,
    min_delta_to_offer: 1,
    price: { quantum: 1000, small_max_pct: 0.05, medium_max_pct: 0.1 },
    year: { small_max_delta: 1, medium_max_delta: 2 },
    mileage: { quantum: 5000, small_max_delta: 10000, medium_max_delta: 25000 },
    // `max_km` é o teto da CONCESSÃO. Nunca pode passar de MANUAL_RADIUS_MAX_KM
    // (a cobertura pré-computada de region_memberships): o código aplica
    // Math.min dos dois, de modo que a configuração só consegue ser mais
    // restritiva que a malha, nunca prometer território que a malha não tem.
    radius: { quantum: 5, small_max_delta: 25, medium_max_delta: 50, max_km: 150 },
    transmission: { band: "GRANDE" },
    priority_order: ["price", "year", "mileage", "radius", "transmission"],
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
  if (!isValidRelaxationsPolicy(value.relaxations)) return false;
  return true;
}

/**
 * Shape da política de relaxação da DEC-26 (F2.2-B1).
 *
 * Existe para que um `platform_settings.search_policy` ANTIGO — o da 065, com
 * `steps`/`max_items` — não passe como válido. Se passasse, o motor leria
 * `relaxations.price` como undefined e devolveria zero concessões em silêncio:
 * o mesmo formato de falha do cache que escondeu um backend fora do ar por
 * semanas. Com esta checagem, o JSON velho cai no SEARCH_POLICY_DEFAULT com
 * warn — a política certificada continua valendo mesmo antes da 068 rodar.
 */
export function isValidRelaxationsPolicy(relaxations) {
  if (!relaxations || typeof relaxations !== "object") return false;
  if (!Array.isArray(relaxations.priority_order) || relaxations.priority_order.length === 0)
    return false;
  if (!Number.isFinite(Number(relaxations.max_options))) return false;
  if (!Number.isFinite(Number(relaxations.min_delta_to_offer))) return false;
  const numeric = [
    ["price", ["quantum", "small_max_pct", "medium_max_pct"]],
    ["year", ["small_max_delta", "medium_max_delta"]],
    ["mileage", ["quantum", "small_max_delta", "medium_max_delta"]],
    ["radius", ["quantum", "small_max_delta", "medium_max_delta", "max_km"]],
  ];
  for (const [dimension, keys] of numeric) {
    const cfg = relaxations[dimension];
    if (!cfg || typeof cfg !== "object") return false;
    for (const key of keys) if (!Number.isFinite(Number(cfg[key]))) return false;
  }
  if (!relaxations.transmission || typeof relaxations.transmission.band !== "string") return false;
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
