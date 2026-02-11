const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CITY RADAR
===================================================== */
router.get("/city-radar", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.state,
        co.opportunity_score,
        cgs.city_power_score,
        cgs.priority_level
      FROM cities c
      JOIN city_growth_state cgs ON cgs.city_id = c.id
      JOIN city_opportunities co ON co.city_id = c.id
      ORDER BY cgs.city_power_score DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar radar" });
  }
});

/* =====================================================
   CAMPAIGNS
===================================================== */
router.get("/campaigns", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ac.id,
        c.name AS city,
        ac.campaign_type,
        ac.status,
        ac.started_at,
        ac.finished_at,
        ac.result_score
      FROM autopilot_campaigns ac
      JOIN cities c ON c.id = ac.city_id
      ORDER BY ac.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar campanhas" });
  }
});

/* =====================================================
   DEALERS
===================================================== */
router.get("/dealers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.name,
        COUNT(dl.id) AS leads_total,
        SUM(CASE WHEN dl.contacted THEN 1 ELSE 0 END) AS leads_contacted
      FROM dealer_leads dl
      JOIN cities c ON c.id = dl.city_id
      GROUP BY c.name
      ORDER BY leads_total DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar lojistas" });
  }
});

/* =====================================================
   SUMMARY
===================================================== */
router.get("/summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT city_id) FROM city_growth_state) AS active_cities,
        (SELECT COUNT(*) FROM autopilot_campaigns) AS total_campaigns,
        (SELECT COUNT(*) FROM dealer_leads WHERE contacted = true) AS dealers_contacted,
        (SELECT COUNT(*) FROM social_posts) AS social_posts_total,
        (SELECT COUNT(*) FROM ads) AS total_ads
    `);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro no resumo" });
  }
});

module.exports = router;
