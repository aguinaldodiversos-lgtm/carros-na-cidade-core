import * as clusterPlanRepository from "./cluster-plan.repository.js";
import * as refreshPlanRepository from "./refresh-plan.repository.js";

function resolveRefreshIntervalHours(stage, moneyPage) {
  if (moneyPage && stage === "dominance") return 24;
  if (moneyPage && stage === "expansion") return 48;
  if (stage === "dominance") return 72;
  if (stage === "expansion") return 120;
  if (stage === "seed") return 240;
  return 336;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function buildRefreshPlansForTopClusters(limit = 1000) {
  const clusters = await clusterPlanRepository.listTopClusterPlans(limit);
  const results = [];

  for (const cluster of clusters) {
    const intervalHours = resolveRefreshIntervalHours(cluster.stage, cluster.money_page);

    const nextRefreshAt = addHours(new Date(), intervalHours);

    const plan = await refreshPlanRepository.upsertRefreshPlan({
      clusterPlanId: cluster.id,
      refreshReason: "stage_policy",
      refreshIntervalHours: intervalHours,
      nextRefreshAt,
      status: "scheduled",
    });

    results.push(plan);
  }

  return results;
}
