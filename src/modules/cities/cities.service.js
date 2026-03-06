import * as citiesRepository from "./cities.repository.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export async function getTopCitiesByDemand(limit = 20) {
  return citiesRepository.listTopCitiesByDemand(limit);
}

export async function getCityBySlug(slug) {
  const city = await citiesRepository.findCityBySlug(slug);

  if (!city) {
    throw new AppError("Cidade não encontrada", 404);
  }

  return city;
}

export async function getCitiesForExpansion(limit = 100) {
  return citiesRepository.listCitiesForExpansion(limit);
}
