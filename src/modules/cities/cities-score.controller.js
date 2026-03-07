import * as citiesScoreService from "./cities-score.service.js";

export async function listTopRankedCities(req, res, next) {
  try {
    const limit = Number(req.query.limit || 100);
    const data = await citiesScoreService.getTopRankedCities(limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function showCityScore(req, res, next) {
  try {
    const data = await citiesScoreService.getCityScore(req.params.slug);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
