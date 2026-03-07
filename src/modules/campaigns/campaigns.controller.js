import * as campaignsService from "./campaigns.service.js";

export async function listCityCampaigns(req, res, next) {
  try {
    const cityId = Number(req.params.cityId);
    const limit = Number(req.query.limit || 20);

    const data = await campaignsService.getCityCampaigns(cityId, limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
