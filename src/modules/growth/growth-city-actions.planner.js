/**
 * Enfileira ações de crescimento (SEO, campanhas, sinais) por cidade.
 * Extraído do pipeline de growth-brain para reutilização (ex.: autopilot).
 */
import { pool } from "../../infrastructure/database/db.js";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

/**
 * Enfileira job sem duplicar (pending/running) com payload idêntico.
 */
export async function enqueueGrowthJob(jobType, payload, priority = 3) {
  await pool.query(
    `
    INSERT INTO growth_jobs (job_type, payload, priority, status, created_at, updated_at)
    SELECT $1, $2::jsonb, $3, 'pending', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM growth_jobs
      WHERE job_type = $1
        AND payload = $2::jsonb
        AND status IN ('pending','running')
    )
    `,
    [jobType, JSON.stringify(payload), priority]
  );
}

/**
 * Top cidades por dominância → SEO local, priorização, campanhas automáticas, detecção de oportunidade.
 */
export async function planCityGrowthActions(limit = 10) {
  const lim = clampInt(limit, 5, 50);

  const top = await pool.query(
    `
    SELECT c.id, c.name, c.slug, cd.dominance_score, cd.leads, cd.avg_ctr, cd.total_ads
    FROM city_dominance cd
    JOIN cities c ON c.id = cd.city_id
    ORDER BY cd.dominance_score DESC
    LIMIT $1
    `,
    [lim]
  );

  for (const city of top.rows) {
    await enqueueGrowthJob(
      "SEO_LOCAL_CONTENT",
      { city_id: city.id, city_slug: city.slug, city_name: city.name },
      2
    );

    await enqueueGrowthJob("SEO_PRIORITIZE_CITY", { city_id: city.id, city_slug: city.slug }, 2);

    if (Number(city.leads) >= 10) {
      await enqueueGrowthJob("AUTO_CAMPAIGN", { city_id: city.id, city_name: city.name }, 1);
    }

    if (Number(city.avg_ctr) >= 0.02 && Number(city.total_ads) < 25) {
      await enqueueGrowthJob(
        "OPPORTUNITY_DETECTED",
        {
          city_id: city.id,
          city_slug: city.slug,
          signal: "high_ctr_low_supply",
        },
        1
      );
    }
  }
}

/**
 * Cidades com alta oportunidade (critical/high) → fila extra de aquisição + sugestão de campanha.
 * Complementa planCityGrowthActions com foco em city_opportunities.
 */
export async function planOpportunityTierActions(limit = 15) {
  const lim = clampInt(limit, 5, 80);

  const { rows } = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.slug,
      COALESCE(co.priority_level, 'low') AS priority_level,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.growth_tier_pt, 'baixa') AS growth_tier_pt
    FROM cities c
    JOIN city_opportunities co ON co.city_id = c.id
    WHERE co.priority_level IN ('critical', 'high')
    ORDER BY co.opportunity_score DESC NULLS LAST
    LIMIT $1
    `,
    [lim]
  );

  for (const city of rows) {
    await enqueueGrowthJob(
      "DEALER_ACQUISITION_SUGGESTED",
      {
        city_id: city.id,
        city_slug: city.slug,
        city_name: city.name,
        reason: "tier_alta_oportunidade",
        opportunity_score: city.opportunity_score,
        growth_tier_pt: city.growth_tier_pt,
      },
      2
    );

    await enqueueGrowthJob(
      "CAMPAIGN_SUGGEST_LOCAL",
      {
        city_id: city.id,
        city_slug: city.slug,
        campaign_hint: "expandir_estoque_lojistas",
        opportunity_score: city.opportunity_score,
      },
      3
    );
  }
}
