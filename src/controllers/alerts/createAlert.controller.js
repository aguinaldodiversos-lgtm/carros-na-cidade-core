const { Pool } = require("pg");
const { distribuirLead } = require("../../services/leads/leadDistribution.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createAlert(req, res) {
  try {
    const {
      name,
      phone,
      city_id,
      brand,
      model,
      price_range,
      urgency,
    } = req.body;

    if (!name || !phone || !city_id) {
      return res.status(400).json({
        error: "Campos obrigatórios: name, phone, city_id",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO alerts
      (name, phone, city_id, brand, model, price_range, urgency, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
      `,
      [
        name,
        phone,
        city_id,
        brand || null,
        model || null,
        price_range || null,
        urgency || null,
      ]
    );

    const alert = result.rows[0];

    // distribuição automática do lead
    await distribuirLead(
      {
        name: alert.name,
        phone: alert.phone,
        price_range: alert.price_range,
        city_id: alert.city_id,
      },
      pool
    );

    return res.json({
      success: true,
      message: "Alerta criado com sucesso",
      alert,
    });
  } catch (err) {
    console.error("Erro ao criar alerta:", err);
    res.status(500).json({
      error: "Erro interno ao criar alerta",
    });
  }
}

module.exports = {
  createAlert,
};
