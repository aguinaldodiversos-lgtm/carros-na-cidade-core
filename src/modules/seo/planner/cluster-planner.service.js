import * as clusterPlannerRepository from "./cluster-planner.repository.js";
import { buildStageClusters } from "./cluster-planner.tasks.js";

function resolveBrandLimitByStage(stage) {
  switch (stage) {
    case "dominance":
      return 12;
    case "expansion":
      return 8;
    case "seed":
      return 5;
    default:
      return 3;
  }
}

function resolveModelLimitByStage(stage) {
  switch (stage) {
    case "dominance":
      return 8;
    case "expansion":
      return 5;
    case "seed":
      return 3;
    default:
      return 1;
  }
}

export async function buildCityClusterPlan(city) {
  const brandLimit = resolveBrandLimitByStage(city.stage);
  const modelLimit = resolveModelLimitByStage(city.stage);

  const brands = await clusterPlannerRepository.listTopBrandsByCity(city.city_id, brandLimit);

  const modelsByBrand = {};

  for (const brandRow of brands) {
    modelsByBrand[brandRow.brand] = await clusterPlannerRepository.listTopModelsByCityAndBrand(
      city.city_id,
      brandRow.brand,
      modelLimit
    );
  }

  const clusters = buildStageClusters({
    city,
    brands,
    modelsByBrand,
  });

  return {
    city,
    clusters,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildTopCitiesClusterPlans(limit = 100) {
  const cities = await clusterPlannerRepository.listTopCitiesForClusterPlanning(limit);
  const plans = [];

  for (const city of cities) {
    const plan = await buildCityClusterPlan(city);
    plans.push(plan);
  }

  return plans;
}
