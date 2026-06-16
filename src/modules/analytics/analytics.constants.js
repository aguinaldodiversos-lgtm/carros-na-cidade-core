import crypto from "node:crypto";

/**
 * Constantes e validação PURA do analytics interno (Fase 4.4).
 *
 * Sem I/O — só whitelist de eventos, limites de campo, normalização do
 * payload e derivação anônima de dispositivo/hash de UA. Consumido pelo
 * service e pelos testes.
 *
 * Privacidade: NÃO coletamos nome/cpf/telefone/e-mail/geo precisa. O
 * session_id é um UUID aleatório de primeira-parte; user_agent_hash é um
 * SHA-256 do UA (não reversível para identidade).
 */

export const ANALYTICS_EVENT_TYPES = Object.freeze([
  "page_view",
  "ad_view",
  "city_page_view",
  "region_page_view",
  "below_fipe_page_view",
  "blog_view",
  "whatsapp_click",
  "phone_click",
  "finance_click",
  "search_performed",
  "seller_store_view",
]);

const EVENT_TYPE_SET = new Set(ANALYTICS_EVENT_TYPES);

/** Eventos que contam como "visualização" para a métrica de views. */
export const VIEW_EVENT_TYPES = Object.freeze([
  "page_view",
  "ad_view",
  "city_page_view",
  "region_page_view",
  "below_fipe_page_view",
  "blog_view",
  "seller_store_view",
]);

/** Eventos de intenção comercial (mais importantes que page view). */
export const COMMERCIAL_EVENT_TYPES = Object.freeze([
  "whatsapp_click",
  "phone_click",
  "finance_click",
]);

export const DEVICE_TYPES = Object.freeze(["mobile", "tablet", "desktop"]);

/** Limite de caracteres por campo string (defesa contra payload abusivo). */
export const FIELD_LIMITS = Object.freeze({
  path: 512,
  canonical_path: 512,
  entity_type: 40,
  entity_id: 64,
  city_slug: 80,
  city_name: 120,
  state: 8,
  region_slug: 80,
  referrer: 512,
  utm_source: 120,
  utm_medium: 120,
  utm_campaign: 160,
  device_type: 16,
  session_id: 64,
});

/** Tamanho máximo do corpo serializado — rejeita "payload gigante". */
export const MAX_EVENT_BYTES = 4096;

export function isValidEventType(value) {
  return EVENT_TYPE_SET.has(value);
}

/** true quando o corpo serializado excede MAX_EVENT_BYTES. */
export function isPayloadTooLarge(body) {
  try {
    return JSON.stringify(body || {}).length > MAX_EVENT_BYTES;
  } catch {
    return true;
  }
}

/** SHA-256 do User-Agent (anônimo). null quando ausente. */
export function hashUserAgent(ua) {
  if (typeof ua !== "string" || !ua.trim()) return null;
  return crypto.createHash("sha256").update(ua.trim()).digest("hex").slice(0, 32);
}

/** Deriva o tipo de dispositivo a partir do User-Agent (heurística simples). */
export function deriveDeviceType(ua) {
  if (typeof ua !== "string" || !ua.trim()) return "unknown";
  const lower = ua.toLowerCase();
  if (/\b(ipad|tablet|playbook|silk)\b/.test(lower) || (/android/.test(lower) && !/mobile/.test(lower))) {
    return "tablet";
  }
  if (/\b(mobile|iphone|ipod|android|blackberry|iemobile|opera mini)\b/.test(lower)) {
    return "mobile";
  }
  return "desktop";
}

function capString(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function toBigIntOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Normaliza/valida o payload do evento (PURO). Trunca strings aos limites,
 * coerge ad_id/blog_post_id para inteiro-ou-null e valida o event_type.
 * Retorna { ok: true, value } ou { ok: false, error }.
 */
export function normalizeEventInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Payload inválido." };
  }
  if (!isValidEventType(body.event_type)) {
    return { ok: false, error: "event_type inválido." };
  }

  const device = DEVICE_TYPES.includes(body.device_type) ? body.device_type : null;

  return {
    ok: true,
    value: {
      event_type: body.event_type,
      path: capString(body.path, FIELD_LIMITS.path),
      canonical_path: capString(body.canonical_path, FIELD_LIMITS.canonical_path),
      entity_type: capString(body.entity_type, FIELD_LIMITS.entity_type),
      entity_id: capString(body.entity_id, FIELD_LIMITS.entity_id),
      city_slug: capString(body.city_slug, FIELD_LIMITS.city_slug),
      city_name: capString(body.city_name, FIELD_LIMITS.city_name),
      state: capString(body.state, FIELD_LIMITS.state),
      region_slug: capString(body.region_slug, FIELD_LIMITS.region_slug),
      ad_id: toBigIntOrNull(body.ad_id),
      blog_post_id: toBigIntOrNull(body.blog_post_id),
      referrer: capString(body.referrer, FIELD_LIMITS.referrer),
      utm_source: capString(body.utm_source, FIELD_LIMITS.utm_source),
      utm_medium: capString(body.utm_medium, FIELD_LIMITS.utm_medium),
      utm_campaign: capString(body.utm_campaign, FIELD_LIMITS.utm_campaign),
      device_type: device, // null → service deriva do UA
      session_id: capString(body.session_id, FIELD_LIMITS.session_id),
    },
  };
}
