import * as marketIntelligenceService from "./market-intelligence.service.js";

export async function listTopOpportunities(req, res, next) {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await marketIntelligenceService.getTopOpportunities(limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function showCityOpportunity(req, res, next) {
  try {
    const data = await marketIntelligenceService.getCityOpportunity(req.params.slug);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function listOpportunitySignals(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50);
    const data = await marketIntelligenceService.getOpportunitySignals(limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
