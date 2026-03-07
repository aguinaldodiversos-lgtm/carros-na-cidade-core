import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as marketIntelligenceRepository from "./market-intelligence.repository.js";

export async function getTopOpportunities(limit = 20) {
  return marketIntelligenceRepository.listTopOpportunities(limit);
}

export async function getCityOpportunity(slug) {
  const city = await marketIntelligenceRepository.getCityOpportunityBySlug(slug);

  if (!city) {
    throw new AppError("Cidade não encontrada para inteligência de mercado", 404);
  }

  return city;
}

export async function getOpportunitySignals(limit = 50) {
  return marketIntelligenceRepository.listCityOpportunitySignals(limit);
}
