import { logger } from "../../shared/logger.js";
import * as refreshPlanService from "../../modules/seo/planner/refresh-plan.service.js";
import * as refreshPlanRepository from "../../modules/seo/planner/refresh-plan.repository.js";
import * as campaignsRepository from "../../modules/campaigns/campaigns.repository.js";

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function runRefreshPlannerEngine(limit = 2000) {
  logger.info({ limit }, "[brain.refresh-planner] Iniciando planner de refresh");

  await refreshPlanService.buildRefreshPlansForTopClusters(limit);

  const duePlans = await refreshPlanRepository.listDueRefreshPlans(limit);

  for (const plan of duePlans) {
    await campaignsRepository.enqueueGrowthJob({
      job_type: "SEO_REFRESH_CLUSTER",
      payload: {
        refresh_plan_id: plan.id,
        cluster_plan_id: plan.cluster_plan_id,
        city_id: plan.city_id,
        path: plan.path,
        cluster_type: plan.cluster_type,
        stage: plan.stage,
      },
      priority: Number(plan.priority || 0) >= 90 ? 1 : 2,
    });

    const intervalHours = Number(plan.refresh_interval_hours || 168);
    await refreshPlanRepository.markRefreshExecuted(
      plan.id,
      addHours(new Date(), intervalHours)
    );
  }

  logger.info(
    { duePlans: duePlans.length },
    "[brain.refresh-planner] Planner de refresh finalizado"
  );

  return { refreshed: duePlans.length };
}
