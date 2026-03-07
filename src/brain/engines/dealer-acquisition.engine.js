import { logger } from "../../shared/logger.js";
import * as dealersService from "../../modules/dealers/dealers.service.js";
import * as campaignsService from "../../modules/campaigns/campaigns.service.js";
import * as citiesService from "../../modules/cities/cities.service.js";

export async function runDealerAcquisitionEngine(limitCities = 100) {
  logger.info(
    { limitCities },
    "[brain.dealer-acquisition] Iniciando aquisição territorial de lojistas"
  );

  const cities = await citiesService.getCitiesForExpansion(limitCities);

  for (const city of cities) {
    const targets = await dealersService.getAcquisitionTargetsByCity(city.id, 20);

    if (!targets.length) {
      continue;
    }

    const shouldCreateCampaign =
      city.priority_level === "critical" ||
      city.priority_level === "high" ||
      targets.some((item) => Number(item.active_ads || 0) < 5);

    if (!shouldCreateCampaign) {
      continue;
    }

    await campaignsService.ensureCityCampaign({
      cityId: city.id,
      campaignType: "dealer_acquisition",
      opportunityScore: Number(city.opportunity_score || 0),
      priority: city.priority_level === "critical" ? 1 : 2,
    });

    logger.info(
      {
        cityId: city.id,
        cityName: city.name,
        targets: targets.length,
        priorityLevel: city.priority_level,
      },
      "[brain.dealer-acquisition] Campanha de aquisição garantida"
    );
  }

  logger.info("[brain.dealer-acquisition] Aquisição territorial finalizada");
}
