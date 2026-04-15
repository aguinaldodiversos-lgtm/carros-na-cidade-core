/** `pending` = conta criada sem CPF/CNPJ; completar no primeiro anúncio. */
export type AccountType = "CPF" | "CNPJ" | "pending";

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  type: AccountType;
  cnpj_verified: boolean;
  document_verified?: boolean;
};

export type DashboardPlanSummary = {
  id: string;
  name: string;
  ad_limit: number;
  billing_model: "free" | "one_time" | "monthly";
};

export type DashboardAdStatus = "active" | "paused";
export type DashboardPriorityLevel = "normal" | "high";

export type DashboardAd = {
  id: string;
  user_id: string;
  title: string;
  price: number;
  image_url: string;
  status: DashboardAdStatus;
  is_featured: boolean;
  featured_until: string | null;
  priority_level: DashboardPriorityLevel;
  views: number;
  expires_at: string;
};

export type BoostOption = {
  id: string;
  days: number;
  price: number;
  label: string;
  description: string;
};

export type DashboardStats = {
  active_ads: number;
  paused_ads: number;
  featured_ads: number;
  total_views: number;
  free_limit: number;
  plan_limit: number;
  available_limit: number;
  plan_name: string;
  is_verified_store: boolean;
};

/** Alinhado a `resolvePublishEligibility` no backend (mesmas regras que POST /account/plans/eligibility). */
export type PublishEligibility = {
  allowed: boolean;
  reason: string | null;
};

/** Métricas agregadas (camelCase) — espelho opcional de `stats`. */
export type DashboardMetrics = {
  activeAds: number;
  highlightedAds: number;
  views: number;
  leads: number;
};

export type DashboardPayload = {
  /** Presente nas respostas da API quando o backend envia o envelope estendido. */
  ok?: boolean;
  accountType?: "PF" | "PJ";
  metrics?: DashboardMetrics;
  user: DashboardUser;
  current_plan: DashboardPlanSummary | null;
  stats: DashboardStats;
  /** Presente quando o backend expõe elegibilidade unificada (FASE 6). */
  publish_eligibility?: PublishEligibility;
  active_ads: DashboardAd[];
  paused_ads: DashboardAd[];
  boost_options: BoostOption[];
};
