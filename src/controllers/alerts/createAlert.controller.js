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
      payment_type,
      usage_type,
      trade_in,
      preferred_brand,
      preferred_model,
    } = req.body;

    if (!name || !phone || !city_id) {
      return res.status(400).json({
        error: "Campos obrigatórios: name, phone, city_id",
      });
    }

    // 1) Criar alerta no banco
    const result = await pool.query(
      `
      INSERT INTO alerts
      (
        name,
        phone,
        city_id,
        brand,
        model,
        price_range,
        urgency,
        payment_type,
        usage_type,
        trade_in,
        preferred_brand,
        preferred_model,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
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
        payment_type || null,
        usage_type || null,
        trade_in || false,
        preferred_brand || null,
        preferred_model || null,
      ]
    );

    const alert = result.rows[0];

    // 2) Distribuir lead inteligente
    await distribuirLead(
      {
        name: alert.name,
        phone: alert.phone,
        price_range: alert.price_range,
        city_id: alert.city_id,
        urgency: alert.urgency,
        payment_type: alert.payment_type,
        usage_type: alert.usage_type,
        trade_in: alert.trade_in,
        preferred_brand: alert.preferred_brand,
        preferred_model: alert.preferred_model,
      },
      pool
    );

    return res.json({
      success: true,
      message: "Lead criado com sucesso",
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
