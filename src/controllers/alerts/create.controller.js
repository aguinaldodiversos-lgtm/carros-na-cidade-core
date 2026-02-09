const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      city,
      brand,
      model,
      price_max,
      year_min
    } = req.body;

    if (!city) {
      return res.status(400).json({
        error: "Cidade é obrigatória"
      });
    }

    const query = `
      INSERT INTO alerts (
        user_id,
        city,
        brand,
        model,
        price_max,
        year_min
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `;

    const values = [
      userId,
      city,
      brand || null,
      model || null,
      price_max || null,
      year_min || null
    ];

    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao criar alerta:", err);
    res.status(500).json({
      error: "Erro ao criar alerta"
    });
  }
};
