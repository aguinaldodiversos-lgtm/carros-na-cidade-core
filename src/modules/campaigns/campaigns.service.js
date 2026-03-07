import * as campaignsRepository from "./campaigns.repository.js";

export async function ensureCityCampaign({
  cityId,
  campaignType,
  opportunityScore = 0,
  priority = 2,
}) {
  const existing = await campaignsRepository.findActiveCampaignByCityAndType(
    cityId,
    campaignType
  );

  if (existing) {
    return {
      created: false,
      campaign: existing,
    };
  }

  const campaign = await campaignsRepository.createAutopilotCampaign({
    city_id: cityId,
    campaign_type: campaignType,
    opportunity_score: opportunityScore,
    status: "pending",
  });

  await campaignsRepository.enqueueGrowthJob({
    job_type: "EXECUTE_CITY_CAMPAIGN",
    payload: {
      city_id: cityId,
      campaign_id: campaign.id,
      campaign_type: campaignType,
    },
    priority,
  });

  return {
    created: true,
    campaign,
  };
}

export async function getCityCampaigns(cityId, limit = 20) {
  return campaignsRepository.listCampaignsByCity(cityId, limit);
}
