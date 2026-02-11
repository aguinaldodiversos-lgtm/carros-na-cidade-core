const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.city,
        COUNT(a.id) FILTER (WHERE a.status = 'active') AS ads_count,
        COUNT(al.id) AS alerts_count
      FROM cities c
      LEFT JOIN ads a ON a.city = c.name
      LEFT JOIN alerts al ON al.city = c.name
      GROUP BY c.name
    `);

    const radar = result.rows.map((row) => {
      const alerts = parseInt(row.alerts_count || 0);
      const ads = parseInt(row.ads_count || 0);

      const score = alerts / (ads + 1);

      let level = "baixo";
      if (score > 10) level = "critico";
      else if (score > 5) level = "alto";
      else if (score > 2) level = "medio";

      return {
        city: row.city,
        alerts,
        ads,
        score: Number(score.toFixed(2)),
        level,
      };
    });

    radar.sort((a, b) => b.score - a.score);

    res.json(radar.slice(0, 50));
  } catch (err) {
    console.error("Erro no radar de cidades:", err);
    res.status(500).json({
      error: "Erro ao gerar radar de cidades",
    });
  }
};
