/**
 * NOT MOUNTED — só usado se `integration.routes.js` for registrado em `app.js`.
 * Mesmo pipeline que POST /api/ads: `ads.service.create` → `createAdNormalized`.
 * Resposta alinhada a `ads.controller.create`: 201 + `{ success, data }`.
 */
import * as adsService from "../ads/ads.service.js";

export async function createAd(req, res, next) {
  try {
    const fakeUser = {
      id: req.apiClient.id,
      plan: "pro",
      role: "integration",
    };

    const ad = await adsService.create(req.body, fakeUser, {
      requestId: req.requestId || null,
    });

    return res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}
