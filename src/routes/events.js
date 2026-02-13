const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const { authenticate } = require("../middlewares/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   LISTAR EVENTOS DO LOJISTA
===================================================== */
router.get("/my-events", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.start_date,
        e.end_date,
        e.status,
        e.banner_url,
        e.banner_status,
        c.name AS city
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      JOIN cities c ON c.id = e.city_id
      WHERE a.user_id = $1
      ORDER BY e.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar eventos" });
  }
});

/* =====================================================
   APROVAR BANNER
===================================================== */
router.post("/:id/approve-banner", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // garantir que o evento pertence ao usuário
    const check = await pool.query(`
      SELECT e.id
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.id = $1
      AND a.user_id = $2
    `, [id, userId]);

    if (check.rowCount === 0) {
      return res.status(403).json({ error: "Evento não autorizado" });
    }

    await pool.query(`
      UPDATE events
      SET banner_status = 'approved'
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao aprovar banner" });
  }
});

/* =====================================================
   REJEITAR BANNER
===================================================== */
router.post("/:id/reject-banner", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const check = await pool.query(`
      SELECT e.id
      FROM events e
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.id = $1
      AND a.user_id = $2
    `, [id, userId]);

    if (check.rowCount === 0) {
      return res.status(403).json({ error: "Evento não autorizado" });
    }

    await pool.query(`
      UPDATE events
      SET banner_status = 'rejected',
          banner_url = NULL
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao rejeitar banner" });
  }
});

module.exports = router;
