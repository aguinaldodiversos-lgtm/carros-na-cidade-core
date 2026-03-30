import { logger } from "../../shared/logger.js";
import * as clusterPlanRepository from "../../modules/seo/planner/cluster-plan.repository.js";
import * as campaignsRepository from "../../modules/campaigns/campaigns.repository.js";

export async function runSeoQueueEngine(limit = 1000) {
  logger.info({ limit }, "[brain.seo-queue] Iniciando geração de fila SEO");

  const clusters = await clusterPlanRepository.listTopClusterPlans(limit);

  for (const cluster of clusters) {
    await campaignsRepository.enqueueGrowthJob({
      job_type: "SEO_GENERATE_CLUSTER",
      payload: {
        cluster_plan_id: cluster.id,
        city_id: cluster.city_id,
        path: cluster.path,
        cluster_type: cluster.cluster_type,
        brand: cluster.brand,
        model: cluster.model,
        stage: cluster.stage,
        money_page: cluster.money_page,
      },
      priority: Number(cluster.priority || 0) >= 90 ? 1 : 2,
    });
  }

  logger.info({ totalClusters: clusters.length }, "[brain.seo-queue] Fila SEO gerada");

  return { queued: clusters.length };
}
