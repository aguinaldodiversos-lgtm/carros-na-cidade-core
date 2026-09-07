export const QUEUE_NAMES = {
  WHATSAPP: "whatsapp",
  // F1 §3.1 — recompute de region_memberships de UMA cidade ao preencher lat/lng.
  CITY_GEO_CHANGED: "cities.geo-changed",
};

export const QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 1000,
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 3000,
  },
};
