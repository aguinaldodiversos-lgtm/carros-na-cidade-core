const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CONSULTAR VALOR FIPE
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { brand, model, year } = req.query;

    if (!brand || !model || !year) {
      return res.status(400).json({
        error: "brand, model e year são obrigatórios",
      });
    }

    const result = await pool.query(
      `
      SELECT price
      FROM fipe_cache
      WHERE brand = $1
        AND model = $2
        AND year = $3
      LIMIT 1
      `,
      [brand, model, year]
    );

    if (result.rowCount === 0) {
      return res.json({ price: null });
    }

    res.json({ price: result.rows[0].price });
  } catch (err) {
    console.error("Erro ao consultar FIPE:", err);
    res.status(500).json({ error: "Erro ao consultar FIPE" });
  }
});

module.exports = router;
