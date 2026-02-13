const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const auth = require("../middlewares/auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   LISTAR EVENTOS DO LOJISTA
===================================================== */
router.get("/my-events", auth, async (req, res) => {
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
   RELATÓRIO DO EVENTO
===================================================== */
router.get("/:id/report", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // validar se o evento pertence ao lojista
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

    // métricas agregadas
    const metrics = await pool.query(`
      SELECT
        metric_type,
        SUM(value) AS total
      FROM event_metrics
      WHERE event_id = $1
      GROUP BY metric_type
    `, [id]);

    const data = {
      views: 0,
      clicks: 0,
      whatsapp: 0,
    };

    metrics.rows.forEach((m) => {
      if (m.metric_type === "event_view") data.views = Number(m.total);
      if (m.metric_type === "event_click") data.clicks = Number(m.total);
      if (m.metric_type === "event_whatsapp") data.whatsapp = Number(m.total);
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

module.exports = router;
