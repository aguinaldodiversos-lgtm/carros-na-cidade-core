// frontend/lib/analytics/track.ts
//
// Coletor client-side do analytics interno (Fase 4.4).
//
// - sendBeacon (com fallback fetch keepalive) para não bloquear navegação;
// - falha silenciosa (analytics nunca quebra a UI);
// - infere o tipo de evento por rota;
// - anexa session_id anônimo, device, referrer externo e UTM.
//
// Endpoint same-origin `/api/analytics/events` (BFF) → backend público.

import { extractCitySlugFromPathname } from "@/lib/city/city-from-pathname";
import { getAnalyticsSessionId } from "@/lib/analytics/session";

export const ANALYTICS_EVENT_TYPES = [
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
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

const ENDPOINT = "/api/analytics/events";

export type AnalyticsExtra = {
  entity_type?: string | null;
  entity_id?: string | number | null;
  city_slug?: string | null;
  city_name?: string | null;
  state?: string | null;
  region_slug?: string | null;
  ad_id?: string | number | null;
  blog_post_id?: string | number | null;
};

export type InferredPageEvent = {
  event_type: AnalyticsEventType;
  entity_type: string | null;
  entity_id: string | null;
  city_slug: string | null;
  region_slug: string | null;
};

function lastSegment(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return parts[parts.length - 1];
  }
}

/**
 * Infere o evento de page-view a partir do pathname. Retorna null quando a
 * rota NÃO deve ser rastreada pelo tracker global:
 *   - áreas privadas (/admin, /painel, /api);
 *   - /veiculo/* e /blog* — têm trackers dedicados com ad_id/blog_post_id.
 */
export function inferPageEvent(pathname: string): InferredPageEvent | null {
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";

  if (p.startsWith("/admin") || p.startsWith("/painel") || p.startsWith("/api")) return null;
  if (p.startsWith("/veiculo/")) return null;
  if (p === "/blog" || p.startsWith("/blog/")) return null;

  if (p.startsWith("/carros-usados/regiao/")) {
    return {
      event_type: "region_page_view",
      entity_type: "region",
      entity_id: lastSegment(p),
      city_slug: extractCitySlugFromPathname(p),
      region_slug: lastSegment(p),
    };
  }
  if (p.startsWith("/carros-baratos-em/")) {
    return {
      event_type: "below_fipe_page_view",
      entity_type: "city",
      entity_id: lastSegment(p),
      city_slug: lastSegment(p),
      region_slug: null,
    };
  }
  if (p.startsWith("/carros-em/")) {
    return {
      event_type: "city_page_view",
      entity_type: "city",
      entity_id: lastSegment(p),
      city_slug: lastSegment(p),
      region_slug: null,
    };
  }
  if (p.startsWith("/lojas/")) {
    return {
      event_type: "seller_store_view",
      entity_type: "store",
      entity_id: lastSegment(p),
      city_slug: null,
      region_slug: null,
    };
  }

  return {
    event_type: "page_view",
    entity_type: null,
    entity_id: null,
    city_slug: extractCitySlugFromPathname(p),
    region_slug: null,
  };
}

function clientDeviceType(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent || "";
  if (/\b(ipad|tablet|playbook|silk)\b/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return "tablet";
  }
  if (/\b(mobi|iphone|ipod|android|blackberry|iemobile|opera mini)\b/i.test(ua)) return "mobile";
  return "desktop";
}

function readUtmAndReferrer(): Partial<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};
  try {
    const sp = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
    const ref = document.referrer || "";
    if (ref) {
      const refOrigin = new URL(ref).origin;
      if (refOrigin !== window.location.origin) out.referrer = ref;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function postEvent(payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch {
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    /* fallthrough to fetch */
  }
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

/** Dispara um evento (best-effort). Nunca lança. */
export function trackEvent(eventType: AnalyticsEventType, extra: AnalyticsExtra = {}) {
  if (typeof window === "undefined") return;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== "") clean[k] = v;
  }
  postEvent({
    event_type: eventType,
    path: window.location.pathname,
    session_id: getAnalyticsSessionId(),
    device_type: clientDeviceType(),
    ...readUtmAndReferrer(),
    ...clean,
  });
}

/** Dispara o page-view inferido da rota (usado pelo tracker global). */
export function trackPageView(pathname: string) {
  const inferred = inferPageEvent(pathname);
  if (!inferred) return;
  trackEvent(inferred.event_type, {
    entity_type: inferred.entity_type,
    entity_id: inferred.entity_id,
    city_slug: inferred.city_slug,
    region_slug: inferred.region_slug,
  });
}
