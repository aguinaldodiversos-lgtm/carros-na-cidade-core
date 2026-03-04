import type { PlanType, SubscriptionPlan } from "@/services/planStore";
import { getPlans } from "@/services/planStore";

type GetPlansOptions = {
  type?: PlanType;
  activeOnly?: boolean;
};

export async function fetchPlansFromAPI(options: GetPlansOptions = {}) {
  const query = new URLSearchParams();
  if (options.type) query.set("type", options.type);
  if (options.activeOnly !== undefined) query.set("active", String(options.activeOnly));

  const endpoint = `/api/plans${query.toString() ? `?${query.toString()}` : ""}`;

  if (typeof window !== "undefined") {
    const response = await fetch(endpoint, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      throw new Error("Falha ao carregar planos");
    }
    const payload = (await response.json()) as { plans: SubscriptionPlan[] };
    return payload.plans;
  }

  return getPlans({ type: options.type, onlyActive: options.activeOnly ?? true });
}

export async function getPlansByType(type: PlanType) {
  const plans = await fetchPlansFromAPI({ type, activeOnly: true });
  return plans.sort((a, b) => a.priority_level - b.priority_level);
}
