import type { DashboardPayload, DashboardPlanSummary } from "@/lib/dashboard-types";
import { getBoostOptions, listAdsByUser } from "@/services/adService";
import { getLocalEmailByUserId } from "@/services/authService";
import { getActiveSubscription, getPlanById, getPlans, getUserById } from "@/services/planStore";

function getFreeLimit(documentType: "CPF" | "CNPJ", cnpjVerified: boolean) {
  if (documentType === "CPF") return 3;
  return cnpjVerified ? 20 : 0;
}

function toPlanSummary(plan: ReturnType<typeof getPlanById> | null): DashboardPlanSummary | null {
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    ad_limit: plan.ad_limit,
    billing_model: plan.billing_model,
  };
}

export function getDashboardPayload(userId: string, sessionEmail?: string): DashboardPayload | null {
  const user = getUserById(userId);
  if (!user) return null;

  const ads = listAdsByUser(user.user_id);
  const activeAds = ads.filter((ad) => ad.status === "active");
  const pausedAds = ads.filter((ad) => ad.status === "paused");
  const featuredAds = activeAds.filter((ad) => ad.is_featured);

  const activeSubscription = getActiveSubscription(user.user_id);
  const activePlan = activeSubscription ? getPlanById(activeSubscription.plan_id) : null;
  const freePlan = getPlans({ type: user.document_type, onlyActive: true }).find((plan) => plan.billing_model === "free") ?? null;
  const currentPlan = activePlan ?? freePlan;

  const freeLimit = getFreeLimit(user.document_type, user.cnpj_verified);
  const planLimit = currentPlan?.ad_limit ?? freeLimit;
  const availableLimit = Math.max(planLimit - activeAds.length, 0);
  const totalViews = ads.reduce((sum, ad) => sum + ad.views, 0);

  return {
    user: {
      id: user.user_id,
      name: user.name,
      email: sessionEmail ?? getLocalEmailByUserId(user.user_id),
      type: user.document_type,
      cnpj_verified: user.cnpj_verified,
    },
    current_plan: toPlanSummary(currentPlan),
    stats: {
      active_ads: activeAds.length,
      paused_ads: pausedAds.length,
      featured_ads: featuredAds.length,
      total_views: totalViews,
      free_limit: freeLimit,
      plan_limit: planLimit,
      available_limit: availableLimit,
      plan_name: currentPlan?.name ?? "Plano gratuito",
      is_verified_store: user.document_type === "CNPJ" ? user.cnpj_verified : false,
    },
    active_ads: activeAds,
    paused_ads: pausedAds,
    boost_options: getBoostOptions(),
  };
}
