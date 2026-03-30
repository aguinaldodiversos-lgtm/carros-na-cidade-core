import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as citiesScoreRepository from "./cities-score.repository.js";

function normalizeStageWeight(stage) {
  switch (stage) {
    case "dominance":
      return 40;
    case "expansion":
      return 28;
    case "seed":
      return 16;
    case "discovery":
    default:
      return 8;
  }
}

function computeTerritorialScore(city) {
  const demandScore = Number(city.demand_score || 0);
  const dominanceScore = Number(city.dominance_score || 0);
  const opportunityScore = Number(city.opportunity_score || 0);
  const predictionScore = Number(city.prediction_score || 0);

  const totalAds = Number(city.dominance_total_ads || 0) || Number(city.metric_total_ads || 0);

  const totalLeads =
    Number(city.dominance_total_leads || 0) || Number(city.metric_total_leads || 0);

  const totalDealers = Number(city.metric_total_dealers || 0);
  const stageWeight = normalizeStageWeight(city.stage);

  const score =
    demandScore * 1.8 +
    dominanceScore * 1.4 +
    opportunityScore * 2.2 +
    predictionScore * 1.3 +
    totalAds * 0.4 +
    totalLeads * 1.1 +
    totalDealers * 0.8 +
    stageWeight;

  return Number(score.toFixed(2));
}

function computeRankingPriority(city, territorialScore) {
  const opportunityScore = Number(city.opportunity_score || 0);
  const predictionScore = Number(city.prediction_score || 0);
  const demandScore = Number(city.demand_score || 0);

  let bonus = 0;

  if (city.stage === "dominance") bonus += 20;
  if (city.stage === "expansion") bonus += 15;
  if (opportunityScore >= 80) bonus += 20;
  if (predictionScore >= 80) bonus += 10;
  if (demandScore >= 50) bonus += 10;

  return Number((territorialScore + bonus).toFixed(2));
}

export async function rebuildCityScores(limit = 1000) {
  const cities = await citiesScoreRepository.listCitiesForScoring(limit);

  for (const city of cities) {
    const territorialScore = computeTerritorialScore(city);
    const rankingPriority = computeRankingPriority(city, territorialScore);

    await citiesScoreRepository.upsertCityScore({
      cityId: city.id,
      demandScore: city.demand_score,
      dominanceScore: city.dominance_score,
      opportunityScore: city.opportunity_score,
      predictionScore: city.prediction_score,
      totalAds: Number(city.dominance_total_ads || 0) || Number(city.metric_total_ads || 0),
      totalLeads: Number(city.dominance_total_leads || 0) || Number(city.metric_total_leads || 0),
      totalDealers: Number(city.metric_total_dealers || 0),
      stage: city.stage || "discovery",
      territorialScore,
      rankingPriority,
    });
  }

  return {
    processed: cities.length,
  };
}

export async function getTopRankedCities(limit = 100) {
  return citiesScoreRepository.listTopRankedCities(limit);
}

export async function getCityScore(slug) {
  const city = await citiesScoreRepository.getCityScoreBySlug(slug);

  if (!city) {
    throw new AppError("Score da cidade não encontrado", 404);
  }

  return city;
}
