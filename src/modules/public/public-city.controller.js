import { getCityPublicPage } from "../../read-models/cities/city-public.service.js";
import * as marketIntelligenceService from "../market-intelligence/market-intelligence.service.js";

export async function getCityLandingData(req, res, next) {
  try {
    const slug = req.params.slug;

    const [cityPage, opportunity] = await Promise.all([
      getCityPublicPage(slug),
      marketIntelligenceService.getCityOpportunity(slug),
    ]);

    res.json({
      success: true,
      data: {
        ...cityPage,
        opportunity,
      },
    });
  } catch (err) {
    next(err);
  }
}
