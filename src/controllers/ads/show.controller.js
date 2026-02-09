const pool = require('../../config/db');

module.exports = async (req, res) => {
  try {
    const slugParam = req.params.slug;
    const parts = slugParam.split('-');
    const id = parts[parts.length - 1];

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Slug inválido' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM ads WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Anúncio não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
};
