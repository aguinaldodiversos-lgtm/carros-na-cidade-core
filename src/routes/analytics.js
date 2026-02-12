const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   OPPORTUNITIES
===================================================== */
router.get("/opportunities", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.name,
        c.state,
        co.opportunity_score,
        co.demand_score,
        co.supply_score
      FROM city_opportunities co
      JOIN cities c ON c.id = co.city_id
      ORDER BY co.opportunity_score DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar oportunidades" });
  }
});

/* =====================================================
   CITY RADAR
===================================================== */
router.get("/city-radar", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.name,
        c.state,
        co.opportunity_score
      FROM city_opportunities co
      JOIN cities c ON c.id = co.city_id
      ORDER BY co.opportunity_score DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro no radar" });
  }
});

module.exports = router;
