const pool = require('../../config/db');

module.exports = async (req, res) => {
  try {
    const { city, state, brand, model } = req.params;

    const { rows } = await pool.query(
      `
      SELECT *,
      CASE
        WHEN highlight_until IS NOT NULL
          AND highlight_until > NOW()
          THEN 4
        WHEN plan = 'pro'
          THEN 3
        WHEN plan = 'start'
          THEN 2
        ELSE 1
      END AS relevance
      FROM ads
      WHERE
        LOWER(city) = LOWER($1)
        AND LOWER(state) = LOWER($2)
        AND LOWER(brand) = LOWER($3)
        AND LOWER(model) = LOWER($4)
        AND status = 'active'
      ORDER BY relevance DESC, created_at DESC
      LIMIT 200
      `,
      [city, state, brand, model]
    );

    res.json({
      city,
      state,
      brand,
      model,
      total: rows.length,
      ads: rows
    });
  } catch (err) {
    console.error('Erro ao listar por modelo:', err);
    res.status(500).json({ error: 'Erro ao listar anúncios' });
  }
};
