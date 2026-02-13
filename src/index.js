const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   LISTAGEM DE ANÚNCIOS COM SELO FIPE
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { city, limit = 20 } = req.query;

    let query = `
      SELECT
        a.*,
        fc.price AS fipe_price,
        CASE
          WHEN fc.price IS NOT NULL
           AND a.price <= fc.price * 0.95
          THEN true
          ELSE false
        END AS below_fipe
      FROM ads a
      LEFT JOIN fipe_cache fc
        ON fc.brand = a.brand
       AND fc.model = a.model
       AND fc.year = a.year
    `;

    const values = [];

    if (city) {
      values.push(city);
      query += ` WHERE a.city = $1 `;
    }

    query += `
      ORDER BY a.created_at DESC
      LIMIT ${Number(limit)}
    `;

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar anúncios:", err);
    res.status(500).json({ error: "Erro ao listar anúncios" });
  }
});

module.exports = router;
