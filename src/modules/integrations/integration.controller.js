import * as adsService from "../ads/ads.service.js";

export async function createAd(req, res, next) {
  try {
    const fakeUser = {
      id: req.apiClient.id,
      plan: "pro",
      role: "integration",
    };

    const ad = await adsService.create(req.body, fakeUser);

    res.json(ad);
  } catch (err) {
    next(err);
  }
}
