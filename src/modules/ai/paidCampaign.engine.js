import { fetchGoogleAdsData } from "../external/googleAds.service.js";

export async function evaluatePaidCampaign(cityData) {
  if (cityData.conversion_rate < 0.01 && cityData.total_views > 1000) {
    return {
      action: "ACTIVATE_PAID",
      budget: 500,
    };
  }

  return {
    action: "NO_ACTION",
  };
}
