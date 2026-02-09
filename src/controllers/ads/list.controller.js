const pool = require('../../config/db');

module.exports = async (req, res) => {
  try {
    const { lat, lng, radius = 100 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Parâmetros lat e lng são obrigatórios'
      });
    }

    const { rows } = await pool.query(
      `
      SELECT *,
      (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(latitude))
        )
      ) AS distance,

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
      WHERE status = 'active'
      HAVING distance <= $3
      ORDER BY relevance DESC, created_at DESC
      `,
      [lat, lng, radius]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar anúncios' });
  }
};
