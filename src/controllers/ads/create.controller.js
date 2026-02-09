const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      title,
      price,
      city,
      state,
      latitude,
      longitude,
      plan,
      slug,
      year,
      body_type,
      fuel_type,
    } = req.body;

    /* =====================================================
       VALIDAÇÕES BÁSICAS
    ===================================================== */

    if (!title || !price || !city || !state || !slug) {
      return res.status(400).json({
        error: "Campos obrigatórios: title, price, city, state, slug",
      });
    }

    // validação de ano (se enviado)
    if (year) {
      const currentYear = new Date().getFullYear() + 1;

      if (year < 1950 || year > currentYear) {
        return res.status(400).json({
          error: "Ano do veículo inválido",
        });
      }
    }

    /* =====================================================
       VALORES PADRÃO
    ===================================================== */

    const bodyType = body_type || "outro";
    const fuelType = fuel_type || "flex";

    /* =====================================================
       INSERÇÃO NO BANCO
    ===================================================== */

    const query = `
      INSERT INTO ads (
        advertiser_id,
        title,
        price,
        city,
        state,
        latitude,
        longitude,
        plan,
        slug,
        year,
        body_type,
        fuel_type
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING *
    `;

    const values = [
      userId,
      title,
      price,
      city,
      state,
      latitude,
      longitude,
      plan || "free",
      slug,
      year || null,
      bodyType,
      fuelType,
    ];

    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao criar anúncio:", err);
    res.status(500).json({
      error: "Erro ao criar anúncio",
    });
  }
};
