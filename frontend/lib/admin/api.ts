type FetchOpts = { method?: string; body?: unknown; params?: Record<string, string | number> };

async function adminFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", body, params } = opts;
  let url = `/api/admin/${path.replace(/^\//, "")}`;
  if (params) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    });
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  let reqBody: string | undefined;
  if (body) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(url, {
    method,
    headers,
    body: reqBody,
    credentials: "include",
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || json?.message || `Erro ${res.status}`);
  return json as T;
}

export type ApiList<T> = { ok: boolean; data: T[]; total: number; limit: number; offset: number };
export type ApiOne<T> = { ok: boolean; data: T };

export const adminApi = {
  dashboard: {
    overview: () => adminFetch<ApiOne<DashboardOverview>>("dashboard/overview"),
    kpis: (days = 30) =>
      adminFetch<ApiOne<DashboardKpis>>("dashboard/kpis", { params: { period_days: days } }),
  },
  ads: {
    list: (p: Record<string, string | number> = {}) =>
      adminFetch<ApiList<AdRow>>("ads", { params: { limit: 50, ...p } }),
    get: (id: string | number) => adminFetch<ApiOne<AdDetail>>(`ads/${id}`),
    changeStatus: (id: string | number, status: string, reason?: string) =>
      adminFetch<ApiOne<AdRow>>(`ads/${id}/status`, { method: "PATCH", body: { status, reason } }),
    setHighlight: (id: string | number, days: number, reason?: string) =>
      adminFetch<ApiOne<AdRow>>(`ads/${id}/highlight`, { method: "PATCH", body: { days, reason } }),
    setPriority: (id: string | number, priority: number) =>
      adminFetch<ApiOne<AdRow>>(`ads/${id}/priority`, { method: "PATCH", body: { priority } }),
    metrics: (id: string | number) => adminFetch<ApiOne<AdMetrics>>(`ads/${id}/metrics`),
    events: (id: string | number, limit = 50) =>
      adminFetch<ApiOne<AdEvent[]>>(`ads/${id}/events`, { params: { limit } }),
  },
  advertisers: {
    list: (p: Record<string, string | number> = {}) =>
      adminFetch<ApiList<AdvRow>>("advertisers", { params: { limit: 50, ...p } }),
    get: (id: string | number) => adminFetch<ApiOne<AdvDetail>>(`advertisers/${id}`),
    changeStatus: (id: string | number, status: string, reason?: string) =>
      adminFetch<ApiOne<AdvRow>>(`advertisers/${id}/status`, {
        method: "PATCH",
        body: { status, reason },
      }),
    ads: (id: string | number) => adminFetch<ApiOne<AdRow[]>>(`advertisers/${id}/ads`),
  },
  payments: {
    list: (p: Record<string, string | number> = {}) =>
      adminFetch<ApiList<PaymentRow>>("payments", { params: { limit: 50, ...p } }),
    summary: (days = 30) =>
      adminFetch<ApiOne<PaymentSummary>>("payments/summary", { params: { period_days: days } }),
  },
  metrics: {
    topAds: (limit = 20) =>
      adminFetch<ApiOne<TopAdMetric[]>>("metrics/ads/top", { params: { limit } }),
    cities: (limit = 30) =>
      adminFetch<ApiOne<CityMetric[]>>("metrics/cities", { params: { limit } }),
    recentEvents: (limit = 50) =>
      adminFetch<ApiOne<RecentEvent[]>>("metrics/events/recent", { params: { limit } }),
    seoCities: (limit = 30) =>
      adminFetch<ApiOne<SeoCityMetric[]>>("metrics/seo/cities", { params: { limit } }),
  },
  moderation: {
    list: (p: Record<string, string | number | boolean> = {}) =>
      adminFetch<ApiList<ModerationAdRow>>("moderation/ads", {
        params: Object.fromEntries(
          Object.entries({ limit: 50, ...p }).map(([k, v]) => [k, String(v)])
        ),
      }),
    detail: (id: string | number) =>
      adminFetch<ApiOne<ModerationAdDetail>>(`moderation/ads/${id}`),
    approve: (id: string | number) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(
        `moderation/ads/${id}/approve`,
        { method: "POST", body: {} }
      ),
    reject: (id: string | number, reason: string) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(
        `moderation/ads/${id}/reject`,
        { method: "POST", body: { reason } }
      ),
    requestCorrection: (id: string | number, reason: string) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(
        `moderation/ads/${id}/request-correction`,
        { method: "POST", body: { reason } }
      ),
  },
};

export type ModerationRiskReason = {
  code: string;
  message: string | null;
  severity: "low" | "medium" | "high" | "critical";
  scoreDelta?: number;
  metadata?: Record<string, unknown>;
};

export type ModerationAdRow = {
  id: number;
  title: string;
  brand: string;
  model: string;
  year: number;
  price: string | number;
  city: string | null;
  state: string | null;
  status: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_reasons: ModerationRiskReason[] | string;
  fipe_reference_value: string | number | null;
  fipe_diff_percent: string | number | null;
  created_at: string;
  updated_at: string;
  advertiser_id: number | null;
  advertiser_user_id: string | null;
  advertiser_name: string | null;
};

export type ModerationSignalRow = {
  id: number;
  signal_code: string;
  severity: "low" | "medium" | "high" | "critical";
  score_delta: number;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ModerationEventRow = {
  id: number;
  event_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ModerationAdDetail = {
  ad: ModerationAdRow & {
    description?: string | null;
    images?: unknown;
    mileage?: number | null;
    advertiser_company?: string | null;
    rejection_reason?: string | null;
    correction_requested_reason?: string | null;
  };
  signals: ModerationSignalRow[];
  events: ModerationEventRow[];
};

// ── Types ──

export type DashboardOverview = {
  ads: {
    total: number;
    active: number;
    paused: number;
    deleted: number;
    blocked: number;
    highlighted: number;
  };
  advertisers: { total: number; active: number; suspended: number; blocked: number };
  users: { total: number; admins: number; regular: number };
  cities: { total: number };
};

export type DashboardKpis = {
  period_days: number;
  new_ads: number;
  new_users: number;
  revenue: {
    total_approved: number;
    approved_count: number;
    plan_revenue: number;
    boost_revenue: number;
    _warning?: string;
  };
  top_cities: { name: string; state: string; ads_count: number }[];
};

export type AdRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  price: string;
  city: string;
  state: string;
  brand: string;
  model: string;
  year: number;
  plan: string;
  priority: number;
  highlight_until: string | null;
  created_at: string;
  updated_at: string;
  blocked_reason?: string;
  advertiser_id: number;
  advertiser_name: string;
};

export type AdDetail = AdRow & {
  description?: string;
  city_name?: string;
  city_slug?: string;
  advertiser_email?: string;
  advertiser_user_id?: string;
  advertiser_status?: string;
  mileage?: number;
  fuel_type?: string;
  transmission?: string;
  body_type?: string;
  images?: unknown;
};

export type AdMetrics = {
  ad_id: number;
  views: number;
  clicks: number;
  leads: number;
  ctr: number;
};
export type AdEvent = { id: number; ad_id: number; event_type: string; created_at: string };

export type AdvRow = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company_name?: string;
  status: string;
  plan: string;
  user_id?: string;
  city_id?: number;
  created_at: string;
  updated_at?: string;
  active_ads_count?: number;
  total_ads_count?: number;
  user_role?: string;
  document_type?: string;
};

export type AdvDetail = AdvRow & {
  user_email?: string;
  user_name?: string;
  user_plan?: string;
  status_reason?: string;
};

export type PaymentRow = {
  id: number;
  user_id: string;
  context: string;
  plan_id?: string;
  ad_id?: number;
  boost_option_id?: string;
  amount: string;
  status: string;
  created_at: string;
  updated_at?: string;
  user_name?: string;
  user_email?: string;
};

export type PaymentSummary = {
  total_intents: number;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  canceled_count: number;
  total_approved_amount: number;
  total_pending_amount: number;
  plan_approved_count: number;
  boost_approved_count: number;
  plan_approved_amount: number;
  boost_approved_amount: number;
  _warning?: string;
};

export type TopAdMetric = {
  id: number;
  title: string;
  city: string;
  state: string;
  status: string;
  views: number;
  clicks: number;
  leads: number;
  ctr: number;
};

export type CityMetric = {
  id: number;
  name: string;
  slug: string;
  state: string;
  visits: number;
  leads: number;
  ads_count: number;
  demand_score: number;
};

export type RecentEvent = {
  id: number;
  ad_id: number;
  event_type: string;
  created_at: string;
  ad_title?: string;
  ad_city?: string;
};
export type SeoCityMetric = {
  date: string;
  city: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_position: number;
};
