const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        al.city,
        COUNT(DISTINCT al.id) AS total_alerts,
        COUNT(DISTINCT ad.id) AS total_ads,
        CASE
          WHEN COUNT(DISTINCT ad.id) = 0
            THEN COUNT(DISTINCT al.id)
          ELSE
            COUNT(DISTINCT al.id)::float / COUNT(DISTINCT ad.id)
        END AS opportunity_score
      FROM alerts al
      LEFT JOIN ads ad
        ON LOWER(ad.city) = LOWER(al.city)
        AND ad.status = 'active'
      GROUP BY al.city
      HAVING COUNT(DISTINCT al.id) > 0
      ORDER BY opportunity_score DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao calcular oportunidades:", err);
    res.status(500).json({
      error: "Erro interno no servidor",
    });
  }
};
