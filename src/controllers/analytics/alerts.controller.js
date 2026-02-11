const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const { city } = req.query;

    let query = `
      SELECT
        city,
        brand,
        model,
        COUNT(*) as total_alerts
      FROM alerts
    `;

    const values = [];

    if (city) {
      query += " WHERE LOWER(city) = LOWER($1)";
      values.push(city);
    }

    query += `
      GROUP BY city, brand, model
      ORDER BY total_alerts DESC
      LIMIT 20
    `;

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro no analytics:", err);
    res.status(500).json({ error: "Erro interno" });
  }
};
