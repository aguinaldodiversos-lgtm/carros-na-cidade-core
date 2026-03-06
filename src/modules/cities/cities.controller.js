import * as citiesService from "./cities.service.js";

export async function listTopCities(req, res, next) {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await citiesService.getTopCitiesByDemand(limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function showCityBySlug(req, res, next) {
  try {
    const data = await citiesService.getCityBySlug(req.params.slug);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
