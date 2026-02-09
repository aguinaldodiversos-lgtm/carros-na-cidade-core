const pool = require('../../config/db');
const slugify = require('../../utils/slugify');

module.exports = async (req, res) => {
  try {
    const { city, state } = req.params;

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
        AND status = 'active'
      ORDER BY relevance DESC, created_at DESC
      LIMIT 200
      `,
      [city, state]
    );

    res.json({
      city,
      state,
      total: rows.length,
      ads: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar anúncios da cidade' });
  }
};
