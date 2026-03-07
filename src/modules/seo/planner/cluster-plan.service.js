import * as clusterPlannerService from "./cluster-planner.service.js";
import * as clusterPlanRepository from "./cluster-plan.repository.js";

export async function persistCityClusterPlan(city) {
  const plan = await clusterPlannerService.buildCityClusterPlan(city);
  const persisted = [];

  for (const cluster of plan.clusters) {
    const saved = await clusterPlanRepository.upsertClusterPlan({
      cityId: city.city_id,
      clusterType: cluster.cluster_type,
      path: cluster.path,
      brand: cluster.brand || null,
      model: cluster.model || null,
      moneyPage: cluster.money_page || false,
      priority: cluster.priority || 0,
      status: "planned",
      stage: city.stage || "discovery",
      payload: cluster,
    });

    persisted.push(saved);
  }

  return {
    city,
    totalPersisted: persisted.length,
    plans: persisted,
  };
}

export async function persistTopCityClusterPlans(limit = 100) {
  const plans = await clusterPlannerService.buildTopCitiesClusterPlans(limit);
  const results = [];

  for (const plan of plans) {
    const persisted = [];

    for (const cluster of plan.clusters) {
      const saved = await clusterPlanRepository.upsertClusterPlan({
        cityId: plan.city.city_id,
        clusterType: cluster.cluster_type,
        path: cluster.path,
        brand: cluster.brand || null,
        model: cluster.model || null,
        moneyPage: cluster.money_page || false,
        priority: cluster.priority || 0,
        status: "planned",
        stage: plan.city.stage || "discovery",
        payload: cluster,
      });

      persisted.push(saved);
    }

    results.push({
      city: plan.city,
      totalPersisted: persisted.length,
    });
  }

  return results;
}
