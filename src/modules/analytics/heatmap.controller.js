// src/modules/analytics/heatmap.controller.js

import { pool } from "../../infrastructure/database/db.js";
import { calculateCityScore } from "../ai/cityScore.service.js";

export async function getHeatmap(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        cm.demand_score,
        cm.total_leads,
        cm.roi_score,
        cm.updated_at,
        cg.conversion_rate,
        cg.growth_score,
        cg.cluster,
        roi.roas,
        roi.cpa
      FROM cities c
      LEFT JOIN city_metrics cm 
        ON cm.city_id = c.id
      LEFT JOIN city_growth_metrics cg
        ON cg.city_id = c.id
      LEFT JOIN city_roi_metrics roi
        ON roi.city_id = c.id
    `);

    const heatmap = result.rows.map(city => {
      const score = calculateCityScore({
        demand_score: Number(city.demand_score || 1),
        total_leads: Number(city.total_leads || 0),
        roi_score: Number(city.roi_score || 0),
        conversion_rate: Number(city.conversion_rate || 0),
        growth_score: Number(city.growth_score || 0),
        roas: Number(city.roas || 0),
        cluster: city.cluster || "STABLE",
      });

      let classification = "STABLE";

      if (score > 80) classification = "DOMINANT";
      else if (score > 60) classification = "EXPANSION";
      else if (score < 30) classification = "CRITICAL";

      return {
        city_id: city.id,
        city: city.name,
        score,
        classification,
        metrics: {
          demand_score: Number(city.demand_score || 1),
          total_leads: Number(city.total_leads || 0),
          roi_score: Number(city.roi_score || 0),
          roas: Number(city.roas || 0),
          cpa: Number(city.cpa || 0),
          conversion_rate: Number(city.conversion_rate || 0),
          growth_score: Number(city.growth_score || 0),
          cluster: city.cluster || "STABLE",
        },
      };
    });

    heatmap.sort((a, b) => b.score - a.score);

    res.json({
      generated_at: new Date(),
      total_cities: heatmap.length,
      heatmap,
    });

  } catch (err) {
    next(err);
  }
}
