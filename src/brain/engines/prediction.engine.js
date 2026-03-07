import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

function classifyPrediction(score) {
  if (score > 120) return "hot";
  if (score > 80) return "emerging";
  if (score > 40) return "stable";
  return "cold";
}

export async function runCityPredictionEngine() {
  logger.info("[brain.prediction] Iniciando previsão territorial");

  const cities = await pool.query(`
    SELECT
      c.id,
      c.population,
      co.opportunity_score,
      COUNT(DISTINCT a.id) AS ads,
      COUNT(DISTINCT dl.id) AS dealers
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN ads a ON a.city_id = c.id
    LEFT JOIN dealer_leads dl ON dl.city_id = c.id
    GROUP BY c.id, c.population, co.opportunity_score
    LIMIT 300
  `);

  for (const city of cities.rows) {
    const population = Number(city.population || 0);
    const opportunity = Number(city.opportunity_score || 0);
    const ads = Number(city.ads || 0);
    const dealers = Number(city.dealers || 0);

    const adsGrowth = ads * 0.8;
    const dealerGrowth = dealers * 2;

    const predictionScore =
      opportunity +
      adsGrowth +
      dealerGrowth +
      population / 10000;

    const label = classifyPrediction(predictionScore);

    await pool.query(
      `
      INSERT INTO city_predictions (
        city_id,
        prediction_score,
        prediction_label,
        ads_growth,
        dealer_growth,
        evaluated_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        prediction_score = EXCLUDED.prediction_score,
        prediction_label = EXCLUDED.prediction_label,
        ads_growth = EXCLUDED.ads_growth,
        dealer_growth = EXCLUDED.dealer_growth,
        evaluated_at = NOW()
      `,
      [
        city.id,
        predictionScore,
        label,
        adsGrowth,
        dealerGrowth,
      ]
    );

    logger.info(
      {
        cityId: city.id,
        predictionScore,
        label,
      },
      "[brain.prediction] Cidade prevista"
    );
  }

  logger.info("[brain.prediction] Previsão territorial finalizada");
}
