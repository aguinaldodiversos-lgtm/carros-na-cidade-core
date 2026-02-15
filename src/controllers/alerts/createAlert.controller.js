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
    } = req.body;

    // Validação básica
    if (!name || !phone || !city_id) {
      return res.status(400).json({
        error: "Campos obrigatórios: name, phone, city_id",
      });
    }

    // 1) Criar alerta no banco
    const result = await pool.query(
      `
      INSERT INTO alerts
      (name, phone, city_id, brand, model, price_range, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
      `,
      [name, phone, city_id, brand || null, model || null, price_range || null]
    );

    const alert = result.rows[0];

    // 2) Distribuir lead automaticamente
    await distribuirLead(
      {
        name: alert.name,
        phone: alert.phone,
        price_range: alert.price_range,
        city_id: alert.city_id,
      },
      pool
    );

    // 3) Resposta da API
    return res.json({
      success: true,
      message: "Alerta criado e lead distribuído",
      alert,
    });
  } catch (err) {
    console.error("Erro ao criar alerta:", err);
    return res.status(500).json({
      error: "Erro interno ao criar alerta",
    });
  }
}

module.exports = {
  createAlert,
};
