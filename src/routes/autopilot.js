feitoconst express = require("express");
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
   FUNNEL
===================================================== */
router.get("/funnel", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.name AS city,
        COUNT(dl.id) AS leads_total,
        SUM(CASE WHEN dl.contacted THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN dl.converted THEN 1 ELSE 0 END) AS converted,
        ROUND(
          (
            SUM(CASE WHEN dl.converted THEN 1 ELSE 0 END)::numeric /
            NULLIF(SUM(CASE WHEN dl.contacted THEN 1 ELSE 0 END), 0)
          ) * 100,
          2
        ) AS conversion_rate
      FROM dealer_leads dl
      JOIN cities c ON c.id = dl.city_id
      GROUP BY c.name
      ORDER BY conversion_rate DESC NULLS LAST
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no funil" });
  }
});

/* =====================================================
   CITY STRATEGY (PAINEL ESTRATÉGICO)
===================================================== */
router.get("/city-strategy", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.state,
        css.city_type,
        css.status,
        css.effort_level,
        css.confidence_score,
        css.growth_score,
        css.last_evaluated_at
      FROM city_strategy_state css
      JOIN cities c ON c.id = css.city_id
      ORDER BY
        css.status,
        css.growth_score DESC
      LIMIT 200
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar estratégia de cidades" });
  }
});

/* =====================================================
   CITY STRATEGY SUMMARY
===================================================== */
router.get("/city-strategy-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) AS total
      FROM city_strategy_state
      GROUP BY status
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro no resumo estratégico" });
  }
});

/* =====================================================
   CITY ALERTS
===================================================== */
router.get("/city-alerts", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ca.id,
        c.name,
        c.state,
        ca.alert_type,
        ca.severity,
        ca.message,
        ca.created_at
      FROM city_alerts ca
      JOIN cities c ON c.id = ca.city_id
      WHERE ca.resolved = false
      ORDER BY
        CASE ca.severity
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        ca.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar alertas" });
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
