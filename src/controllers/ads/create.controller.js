const { notifyMatchingAlerts } = require("../../services/alertMatcher.service");
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
    const newAd = result.rows[0];

    /* ============================================
       VERIFICAR ALERTAS COMPATÍVEIS
    ============================================ */

    const alertsQuery = `
      SELECT a.*, u.email
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      WHERE
        LOWER(a.city) = LOWER($1)
        AND (a.brand IS NULL OR LOWER(a.brand) = LOWER($2))
        AND (a.model IS NULL OR LOWER(a.model) = LOWER($3))
        AND (a.price_max IS NULL OR $4 <= a.price_max)
        AND (a.year_min IS NULL OR $5 >= a.year_min)
    `;

    const alertsValues = [
      newAd.city,
      newAd.brand,
      newAd.model,
      newAd.price,
      newAd.year,
    ];

    const alertsResult = await pool.query(alertsQuery, alertsValues);

    // futura integração com serviço de email
    for (const alert of alertsResult.rows) {
      console.log(
        `Enviar alerta para ${alert.email} sobre o carro ${newAd.title}`
      );
    }

    /* ============================================
       RESPOSTA FINAL
    ============================================ */

    res.status(201).json(newAd);
  } catch (err) {
    console.error("Erro ao criar anúncio:", err);
    res.status(500).json({
      error: "Erro ao criar anúncio",
    });
  }
};
