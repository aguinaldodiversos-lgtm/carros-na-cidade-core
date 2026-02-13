const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   MELHORES OFERTAS DA CIDADE
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { city, limit = 10 } = req.query;

    if (!city) {
      return res.status(400).json({ error: "city é obrigatório" });
    }

    const result = await pool.query(
      `
      SELECT
        a.*,
        fc.price AS fipe_price,
        (fc.price - a.price) AS discount_value,
        ROUND(((fc.price - a.price) / fc.price) * 100, 1) AS discount_percent
      FROM ads a
      JOIN fipe_cache fc
        ON fc.brand = a.brand
       AND fc.model = a.model
       AND fc.year = a.year
      WHERE a.city = $1
        AND a.price <= fc.price * 0.95
      ORDER BY discount_value DESC
      LIMIT $2
      `,
      [city, limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar melhores ofertas:", err);
    res.status(500).json({ error: "Erro ao buscar melhores ofertas" });
  }
});

module.exports = router;
