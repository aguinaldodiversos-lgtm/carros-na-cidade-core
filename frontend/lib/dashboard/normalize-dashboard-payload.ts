import type {
  BoostOption,
  DashboardAd,
  DashboardPayload,
  DashboardPlanSummary,
  DashboardStats,
  DashboardUser,
  PublishEligibility,
} from "@/lib/dashboard-types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toStr(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function normalizeUser(raw: unknown): DashboardUser | null {
  if (!isRecord(raw)) return null;
  const id = toStr(raw.id);
  const name = toStr(raw.name, "Usuário");
  const email = toStr(raw.email);
  const type = raw.type === "CNPJ" || raw.type === "CPF" ? raw.type : "CPF";
  if (!id) return null;
  return {
    id,
    name,
    email,
    type,
    cnpj_verified: Boolean(raw.cnpj_verified),
  };
}

function normalizePlan(raw: unknown): DashboardPlanSummary | null {
  if (!raw || !isRecord(raw)) return null;
  const id = toStr(raw.id);
  const name = toStr(raw.name, "Plano");
  if (!id) return null;
  const billing = raw.billing_model;
  const billing_model =
    billing === "free" || billing === "one_time" || billing === "monthly" ? billing : "free";
  return {
    id,
    name,
    ad_limit: toNum(raw.ad_limit, 0),
    billing_model,
  };
}

function normalizeStats(raw: unknown): DashboardStats {
  const base: DashboardStats = {
    active_ads: 0,
    paused_ads: 0,
    featured_ads: 0,
    total_views: 0,
    free_limit: 0,
    plan_limit: 0,
    available_limit: 0,
    plan_name: "Plano gratuito",
    is_verified_store: false,
  };
  if (!isRecord(raw)) return base;
  return {
    active_ads: toNum(raw.active_ads, 0),
    paused_ads: toNum(raw.paused_ads, 0),
    featured_ads: toNum(raw.featured_ads, 0),
    total_views: toNum(raw.total_views, 0),
    free_limit: toNum(raw.free_limit, 0),
    plan_limit: toNum(raw.plan_limit, 0),
    available_limit: toNum(raw.available_limit, 0),
    plan_name: toStr(raw.plan_name, base.plan_name),
    is_verified_store: Boolean(raw.is_verified_store),
  };
}

function normalizeAd(raw: unknown): DashboardAd | null {
  if (!isRecord(raw)) return null;
  const id = toStr(raw.id);
  if (!id) return null;
  const status = raw.status === "paused" ? "paused" : "active";
  const pl = raw.priority_level === "high" ? "high" : "normal";
  return {
    id,
    user_id: toStr(raw.user_id),
    title: toStr(raw.title, "Anúncio"),
    price: toNum(raw.price, 0),
    image_url: toStr(raw.image_url, "/images/vehicle-placeholder.svg"),
    status,
    is_featured: Boolean(raw.is_featured),
    featured_until: typeof raw.featured_until === "string" ? raw.featured_until : null,
    priority_level: pl,
    views: toNum(raw.views, 0),
    expires_at: typeof raw.expires_at === "string" ? raw.expires_at : new Date().toISOString(),
  };
}

function normalizeAds(raw: unknown): DashboardAd[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAd).filter((x): x is DashboardAd => x !== null);
}

function normalizeBoostOptions(raw: unknown): BoostOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = toStr(item.id);
      if (!id) return null;
      return {
        id,
        days: toNum(item.days, 0),
        price: toNum(item.price, 0),
        label: toStr(item.label, "Destaque"),
        description: toStr(item.description, ""),
      };
    })
    .filter((x): x is BoostOption => x !== null);
}

function normalizePublishEligibility(raw: unknown): PublishEligibility | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.allowed !== "boolean") return undefined;
  return {
    allowed: raw.allowed,
    reason: typeof raw.reason === "string" ? raw.reason : null,
  };
}

/**
 * Garante shape estável para o painel mesmo com respostas parciais ou evolução da API.
 */
export function normalizeDashboardPayload(raw: unknown): DashboardPayload | null {
  if (!isRecord(raw)) return null;
  const user = normalizeUser(raw.user);
  if (!user) return null;

  return {
    user,
    current_plan: normalizePlan(raw.current_plan),
    stats: normalizeStats(raw.stats),
    publish_eligibility: normalizePublishEligibility(raw.publish_eligibility),
    active_ads: normalizeAds(raw.active_ads),
    paused_ads: normalizeAds(raw.paused_ads),
    boost_options: normalizeBoostOptions(raw.boost_options),
  };
}
