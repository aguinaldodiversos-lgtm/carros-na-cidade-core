import { logger } from "../../shared/logger.js";
import * as clusterPlannerService from "../../modules/seo/planner/cluster-planner.service.js";

export async function runClusterPlannerEngine(limit = 150) {
  logger.info({ limit }, "[brain.cluster-planner] Iniciando planner de clusters");

  const plans = await clusterPlannerService.buildTopCitiesClusterPlans(limit);

  logger.info(
    { totalPlans: plans.length },
    "[brain.cluster-planner] Planner de clusters finalizado"
  );

  return plans;
}
