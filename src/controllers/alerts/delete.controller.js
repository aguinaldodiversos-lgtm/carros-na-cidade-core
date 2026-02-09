const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;

    await pool.query(
      "DELETE FROM alerts WHERE id = $1 AND user_id = $2",
      [alertId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir alerta:", err);
    res.status(500).json({
      error: "Erro ao excluir alerta"
    });
  }
};
