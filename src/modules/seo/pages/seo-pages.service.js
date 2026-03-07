import * as seoPagesRepository from "./seo-pages.repository.js";
import { AppError } from "../../../shared/middlewares/error.middleware.js";

export async function garantirSEO(city) {
  if (!city?.name || !city?.slug) {
    throw new AppError("Cidade inválida para SEO", 400);
  }

  return seoPagesRepository.ensureCityLandingRecord(city);
}

export async function getCityPage(cityName, slug) {
  const page = await seoPagesRepository.findCityPage(cityName, slug);

  if (!page) {
    throw new AppError("Página SEO da cidade não encontrada", 404);
  }

  return page;
}

export async function listPublishedCityPages(limit = 100) {
  return seoPagesRepository.listTopCityPages(limit);
}
