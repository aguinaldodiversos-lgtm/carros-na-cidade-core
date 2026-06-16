"use client";

import { useEffect, useRef } from "react";

import { trackEvent, type AnalyticsEventType } from "@/lib/analytics/track";

/**
 * Tracker dedicado de page-view COM contexto de entidade (Fase 4.4).
 *
 * Usado em páginas que têm id numérico de entidade não presente na URL:
 *   - /veiculo/<slug>  → event="ad_view"   + adId (métricas por anúncio §10);
 *   - blog post        → event="blog_view" + blogPostId (blog analytics §11);
 *   - blog hub         → event="blog_view" (sem id).
 *
 * Dispara uma vez por identidade (dedup por chave). Não renderiza nada.
 */
export function AnalyticsPageView({
  event,
  adId = null,
  blogPostId = null,
  citySlug = null,
  cityName = null,
  state = null,
  regionSlug = null,
  entityType = null,
  entityId = null,
}: {
  event: AnalyticsEventType;
  adId?: string | number | null;
  blogPostId?: string | number | null;
  citySlug?: string | null;
  cityName?: string | null;
  state?: string | null;
  regionSlug?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const key = `${event}|${adId ?? ""}|${blogPostId ?? ""}|${entityId ?? ""}`;
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    trackEvent(event, {
      ad_id: adId,
      blog_post_id: blogPostId,
      city_slug: citySlug,
      city_name: cityName,
      state,
      region_slug: regionSlug,
      entity_type: entityType,
      entity_id: entityId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

export default AnalyticsPageView;
