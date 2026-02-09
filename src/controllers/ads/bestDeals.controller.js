const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = async (req, res) => {
  try {
    const { cidade, limit = 20 } = req.query;

    if (!cidade) {
      return res.status(400).json({
        error: "Parâmetro 'cidade' é obrigatório",
      });
    }

    const query = `
      SELECT
        id,
        title,
        price,
        city,
        state,
        brand,
        model,
        year,
        body_type,
        fuel_type,
        latitude,
        longitude,
        plan,
        highlight_until,
        slug,
        created_at
      FROM ads
      WHERE
        status = 'active'
        AND LOWER(city) = LOWER($1)
      ORDER BY
        highlight_until DESC NULLS LAST,
        plan DESC,
        year DESC NULLS LAST,
        price ASC,
        created_at DESC
      LIMIT $2
    `;

    const values = [cidade, limit];

    const result = await pool.query(query, values);

    res.json({
      total: result.rowCount,
      ads: result.rows,
    });
  } catch (err) {
    console.error("Erro em best-deals:", err);
    res.status(500).json({
      error: "Erro ao buscar melhores ofertas",
    });
  }
};
