type AdEventType = "view" | "click" | "lead" | "boost_start";

function getApiBaseUrl() {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  return value.replace(/\/+$/, "");
}

export async function trackAdEvent(adId: string | number, eventType: AdEventType) {
  const apiBase = getApiBaseUrl();
  if (!apiBase || !adId) return;

  try {
    await fetch(`${apiBase}/api/ads/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ad_id: String(adId),
        event_type: eventType,
      }),
      keepalive: true,
    });
  } catch {
    // best effort only
  }
}
