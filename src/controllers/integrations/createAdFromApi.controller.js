const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createAdFromApi(req, res) {
  try {
    const advertiserId = req.advertiserId;

    const {
      brand,
      model,
      year,
      price,
      mileage,
      city_id,
      description,
    } = req.body;

    if (!brand || !model || !year || !price) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO ads (
        advertiser_id,
        brand,
        model,
        year,
        price,
        mileage,
        city_id,
        description,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW())
      RETURNING id
      `,
      [
        advertiserId,
        brand,
        model,
        year,
        price,
        mileage || 0,
        city_id || null,
        description || "",
      ]
    );

    return res.json({
      success: true,
      ad_id: result.rows[0].id,
    });
  } catch (err) {
    console.error("Erro ao criar anúncio via API:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

module.exports = createAdFromApi;
