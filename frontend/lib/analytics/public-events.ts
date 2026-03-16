export const AD_EVENT_TYPES = [
  "view",
  "click",
  "lead",
  "boost_start",
  "favorite",
  "share",
  "finance",
  "whatsapp",
] as const;

export type AdEventType = (typeof AD_EVENT_TYPES)[number];

const AD_EVENT_TYPE_SET = new Set<AdEventType>(AD_EVENT_TYPES);

type TrackAdEventPayload = {
  ad_id: string;
  event_type: AdEventType;
};

function getApiBaseUrl() {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  return value.replace(/\/+$/, "");
}

function getEventUrl() {
  const apiBase = getApiBaseUrl();
  return apiBase ? `${apiBase}/api/ads/event` : "/api/ads/event";
}

function normalizeAdId(adId: string | number) {
  if (typeof adId === "number") {
    if (!Number.isFinite(adId) || adId <= 0) return "";
    return String(adId);
  }

  const normalized = String(adId || "").trim();
  return normalized;
}

function isValidEventType(eventType: string): eventType is AdEventType {
  return AD_EVENT_TYPE_SET.has(eventType as AdEventType);
}

function buildPayload(
  adId: string | number,
  eventType: AdEventType
): TrackAdEventPayload | null {
  const normalizedAdId = normalizeAdId(adId);

  if (!normalizedAdId) return null;
  if (!isValidEventType(eventType)) return null;

  return {
    ad_id: normalizedAdId,
    event_type: eventType,
  };
}

function canUseSendBeacon() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  );
}

function trySendBeacon(url: string, payload: TrackAdEventPayload) {
  if (!canUseSendBeacon()) return false;

  try {
    const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json",
    });

    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}

export async function trackAdEvent(
  adId: string | number,
  eventType: AdEventType
): Promise<void> {
  const payload = buildPayload(adId, eventType);
  if (!payload) return;

  const url = getEventUrl();

  if (trySendBeacon(url, payload)) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // best effort only
  }
}
