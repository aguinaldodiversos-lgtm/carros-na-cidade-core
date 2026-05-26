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
    clearHighlight: (id: string | number, reason?: string) =>
      adminFetch<ApiOne<AdRow>>(`ads/${id}/highlight`, {
        method: "PATCH",
        body: { highlight_until: null, reason },
      }),
    setPriority: (id: string | number, priority: number, reason?: string) =>
      adminFetch<ApiOne<AdRow>>(`ads/${id}/priority`, {
        method: "PATCH",
        body: { priority, reason },
      }),
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
  regional: {
    getSettings: () => adminFetch<ApiOne<RegionalSettings>>("regional-settings"),
    updateSettings: (radius_km: number, reason?: string) =>
      adminFetch<ApiOne<RegionalSettings>>("regional-settings", {
        method: "PATCH",
        body: { radius_km, reason },
      }),
  },
  seo: {
    overview: () => adminFetch<ApiOne<SeoOverview>>("seo/overview"),
    publications: (params: Record<string, string | number | boolean> = {}) =>
      adminFetch<ApiList<SeoPublicationRow>>("seo/publications", {
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      }),
    publication: (id: string | number) =>
      adminFetch<ApiOne<SeoPublicationDetail>>(`seo/publications/${id}`),
    updatePublication: (id: string | number, patch: SeoPublicationPatch, reason?: string) =>
      adminFetch<ApiOne<SeoPublicationRow>>(`seo/publications/${id}`, {
        method: "PATCH",
        body: { ...patch, ...(reason ? { reason } : {}) },
      }),
    sitemaps: () => adminFetch<{ ok: boolean; data: SeoSitemapEntry[]; summary: SeoSitemapSummary }>(
      "seo/sitemaps"
    ),
    issues: (limit = 100) =>
      adminFetch<ApiOne<SeoIssue[]>>("seo/issues", { params: { limit: String(limit) } }),
  },
  plans: {
    list: (params: Record<string, string | number | boolean> = {}) =>
      adminFetch<ApiList<PlanRow>>("plans", {
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      }),
    get: (id: string) => adminFetch<ApiOne<PlanRow>>(`plans/${id}`),
    subscriptions: (id: string, params: Record<string, string | number> = {}) =>
      adminFetch<ApiList<PlanSubscriptionRow>>(`plans/${id}/subscriptions`, {
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      }),
    create: (payload: PlanCreatePayload, reason: string) =>
      adminFetch<ApiOne<PlanRow>>(`plans`, { method: "POST", body: { ...payload, reason } }),
    update: (id: string, patch: PlanPatchPayload, reason?: string) =>
      adminFetch<ApiOne<PlanRow>>(`plans/${id}`, {
        method: "PATCH",
        body: { ...patch, ...(reason ? { reason } : {}) },
      }),
    setActive: (id: string, is_active: boolean, reason: string) =>
      adminFetch<ApiOne<PlanRow>>(`plans/${id}/status`, {
        method: "PATCH",
        body: { is_active, reason },
      }),
  },
  highlights: {
    summary: (params: { expiring_days?: number } = {}) =>
      adminFetch<ApiOne<HighlightSummary>>(`highlights/summary`, {
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      }),
    list: (params: Record<string, string | number> = {}) =>
      adminFetch<ApiList<HighlightRow>>(`highlights`, {
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      }),
  },
  commercialSettings: {
    get: () => adminFetch<ApiOne<CommercialSettingsResponse>>(`commercial-settings`),
    update: (payload: Partial<CommercialSettings>, reason: string) =>
      adminFetch<ApiOne<CommercialSettingsResponse>>(`commercial-settings`, {
        method: "PATCH",
        body: { ...payload, reason },
      }),
  },
  reports: {
    list: (p: Record<string, string | number> = {}) =>
      adminFetch<ApiList<ReportRow>>("reports", {
        params: Object.fromEntries(
          Object.entries({ limit: 50, ...p }).map(([k, v]) => [k, String(v)])
        ),
      }),
    summary: () => adminFetch<ApiOne<ReportsSummary>>("reports/summary"),
    get: (id: string | number) => adminFetch<ApiOne<ReportDetail>>(`reports/${id}`),
    changeStatus: (id: string | number, status: ReportStatus, reason?: string) =>
      adminFetch<ApiOne<ReportRow>>(`reports/${id}/status`, {
        method: "PATCH",
        body: { status, reason },
      }),
  },
  moderation: {
    list: (p: Record<string, string | number | boolean> = {}) =>
      adminFetch<ApiList<ModerationAdRow>>("moderation/ads", {
        params: Object.fromEntries(
          Object.entries({ limit: 50, ...p }).map(([k, v]) => [k, String(v)])
        ),
      }),
    detail: (id: string | number) => adminFetch<ApiOne<ModerationAdDetail>>(`moderation/ads/${id}`),
    approve: (id: string | number) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(`moderation/ads/${id}/approve`, {
        method: "POST",
        body: {},
      }),
    reject: (id: string | number, reason: string) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(`moderation/ads/${id}/reject`, {
        method: "POST",
        body: { reason },
      }),
    requestCorrection: (id: string | number, reason: string) =>
      adminFetch<ApiOne<{ ok: boolean; status: string }>>(
        `moderation/ads/${id}/request-correction`,
        { method: "POST", body: { reason } }
      ),
  },
};

// ── SEO (Fase 3) ──

export type SeoOverview = {
  publications: {
    total: number;
    published: number;
    planned: number;
    with_error: number;
    indexable: number;
    non_indexable: number;
    last_update: string | null;
  };
  clusters: {
    total: number;
    sitemap_eligible: number;
    last_update: string | null;
  };
  coverage: {
    active_states: number;
    cities_with_active_ads: number;
  };
  sitemaps: {
    total_buckets: number;
    detected_buckets: number;
    empty_buckets: number;
    total_eligible_clusters: number;
  };
};

export type SeoPublicationRow = {
  id: number;
  path: string;
  title: string | null;
  excerpt: string | null;
  publication_type: string | null;
  content_provider: string | null;
  content_stage: string | null;
  status: string | null;
  is_indexable: boolean;
  is_money_page: boolean;
  health_status: string | null;
  cluster_plan_id: number | null;
  city_id: number | null;
  brand: string | null;
  model: string | null;
  published_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  city_slug: string | null;
  city_name: string | null;
  city_state: string | null;
  content_length: number;
};

export type SeoPublicationAudit = {
  id: number;
  publication_id: number;
  audit_status: string;
  issues: unknown[] | null;
  warnings: unknown[] | null;
  score: number;
  audited_at: string;
};

export type SeoPublicationHistory = {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
};

export type SeoPublicationDetail = SeoPublicationRow & {
  content?: string | null;
  audits: SeoPublicationAudit[];
  history: SeoPublicationHistory[];
};

export type SeoPublicationPatch = Partial<{
  title: string;
  is_indexable: boolean;
  status: string;
  health_status: string;
}>;

export type SeoSitemapEntry = {
  name: string;
  url: string;
  cluster_type?: string | null;
  type: "static" | "cluster" | "dynamic";
  eligible_urls: number | null;
  total_clusters: number | null;
  last_update: string | null;
  empty: boolean;
  per_region?: { state: string; total: number; last_update: string | null }[];
};

export type SeoSitemapSummary = {
  total: number;
  empty: number;
  total_eligible_urls: number;
};

export type SeoIssue = {
  severity: "critical" | "high" | "medium" | "low";
  kind: string;
  title: string;
  detail: string;
  publication_id?: number;
  cluster_plan_id?: number;
  path?: string;
  publication_type?: string;
  health_status?: string;
};

// ── Plans / Highlights / Commercial settings (Fase 2) ──

export type PlanType = "CPF" | "CNPJ";
export type PlanBillingModel = "free" | "one_time" | "monthly";

export type PlanRow = {
  id: string;
  name: string;
  type: PlanType;
  price: string | number;
  ad_limit: number;
  is_featured_enabled: boolean;
  has_store_profile: boolean;
  priority_level: number;
  is_active: boolean;
  validity_days: number | null;
  billing_model: PlanBillingModel;
  description: string;
  benefits: string[] | string | null;
  recommended: boolean;
  max_photos: number;
  weight: number;
  video_360_enabled: boolean;
  monthly_highlight_credits: number;
  sort_order: number;
  public_visible: boolean;
  created_at: string;
  updated_at: string;
  active_subscriptions: number;
};

export type PlanCreatePayload = {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  ad_limit: number;
  priority_level: number;
  weight: number;
  billing_model: PlanBillingModel;
  validity_days: number | null;
  max_photos: number;
  monthly_highlight_credits: number;
  description: string;
  benefits: string[];
  sort_order: number;
  is_active?: boolean;
  is_featured_enabled?: boolean;
  has_store_profile?: boolean;
  recommended?: boolean;
  video_360_enabled?: boolean;
  public_visible?: boolean;
};

export type PlanPatchPayload = Partial<PlanCreatePayload>;

export type PlanSubscriptionRow = {
  user_id: string;
  plan_id: string;
  status: string;
  expires_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string | null;
  user_name: string | null;
  user_email: string | null;
};

export type HighlightRow = {
  ad_id: number;
  ad_title: string | null;
  ad_slug: string | null;
  ad_status: string;
  ad_city: string | null;
  ad_state: string | null;
  ad_price: string | number | null;
  ad_brand: string | null;
  ad_model: string | null;
  ad_priority: number;
  highlight_until: string | null;
  ad_updated_at: string;
  advertiser_id: number | null;
  advertiser_name: string | null;
  user_plan_id: string | null;
};

export type HighlightSummary = { active: number; expiring: number; expired: number };

export type CommercialSettings = {
  boost_default_price_cents: number;
  boost_default_days: number;
  boost_duplicate_behavior: "extend_duration" | "replace" | "block_duplicate";
  boost_max_extension_days: number;
  allow_boost_cpf: boolean;
  allow_boost_cnpj: boolean;
  pro_ad_limit_guard: number;
};

export type CommercialSettingsResponse = {
  settings: CommercialSettings;
  duplicate_behaviors_supported: ReadonlyArray<CommercialSettings["boost_duplicate_behavior"]>;
  ranges: {
    boost_default_price_cents: { min: number; max: number };
    boost_default_days: { min: number; max: number };
    boost_max_extension_days: { min: number; max: number };
    pro_ad_limit_guard: { min: number; max: number };
  };
};

// ── Reports (fila de denúncias — Fase 1) ──

export type ReportStatus = "new" | "in_review" | "resolved" | "dismissed";

export type ReportReason =
  | "suspicious_price"
  | "incorrect_data"
  | "vehicle_does_not_exist"
  | "scam_or_advance_pay"
  | "fake_photos"
  | "other";

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  suspicious_price: "Preço suspeito",
  incorrect_data: "Dados incorretos",
  vehicle_does_not_exist: "Veículo não existe",
  scam_or_advance_pay: "Golpe / pagamento antecipado",
  fake_photos: "Fotos falsas",
  other: "Outro motivo",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  new: "Aberta",
  in_review: "Em análise",
  resolved: "Resolvida",
  dismissed: "Rejeitada",
};

export type ReportRow = {
  id: number;
  ad_id: number;
  reporter_user_id: string | null;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  ad_title: string | null;
  ad_slug: string | null;
  ad_status: string | null;
  ad_city: string | null;
  ad_state: string | null;
  ad_price: string | null;
  advertiser_id: number | null;
  advertiser_name: string | null;
};

export type ReportHistoryRow = {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  admin_email: string | null;
  admin_name: string | null;
};

export type ReportDetail = ReportRow & {
  ad_brand: string | null;
  ad_model: string | null;
  ad_year: number | null;
  ad_priority: number | null;
  ad_highlight_until: string | null;
  ad_blocked_reason: string | null;
  advertiser_email: string | null;
  advertiser_status: string | null;
  history: ReportHistoryRow[];
};

export type ReportsSummary = {
  counts: { new: number; in_review: number; resolved: number; dismissed: number };
  total: number;
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

export type RegionalSettings = {
  radius_km: number;
  radius_min_km: number;
  radius_max_km: number;
  radius_default_km: number;
  updated_at?: string;
};
