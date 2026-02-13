const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   SUMMARY
===================================================== */
router.get("/summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM events WHERE status = 'active') AS active_events,
        (SELECT COUNT(*) FROM events WHERE status IN ('paid','queued')) AS paid_pending,
        (SELECT COALESCE(SUM(price),0) FROM events
          WHERE start_date >= date_trunc('week', NOW())
        ) AS weekly_revenue,
        (SELECT COUNT(DISTINCT city_id)
         FROM events WHERE status = 'active') AS cities_active
    `);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro no resumo" });
  }
});

/* =====================================================
   PAID EVENTS
===================================================== */
router.get("/paid", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        c.name AS city,
        a.name AS advertiser,
        e.title,
        e.start_date,
        e.status
      FROM events e
      JOIN cities c ON c.id = e.city_id
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.status IN ('paid','queued')
      ORDER BY e.start_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar eventos pagos" });
  }
});

/* =====================================================
   ACTIVE EVENTS
===================================================== */
router.get("/active", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        c.name AS city,
        a.name AS advertiser,
        e.title,
        e.start_date,
        e.end_date
      FROM events e
      JOIN cities c ON c.id = e.city_id
      JOIN advertisers a ON a.id = e.advertiser_id
      WHERE e.status = 'active'
      ORDER BY e.end_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar eventos ativos" });
  }
});

/* =====================================================
   REVENUE BY CITY
===================================================== */
router.get("/revenue-by-city", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.name,
        COUNT(e.id) AS events_total,
        SUM(e.price) AS revenue
      FROM events e
      JOIN cities c ON c.id = e.city_id
      WHERE e.start_date >= date_trunc('week', NOW())
      GROUP BY c.name
      ORDER BY revenue DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro na receita por cidade" });
  }
});

/* =====================================================
   ACTIVATE EVENT
===================================================== */
router.post("/:id/activate", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`
      UPDATE events
      SET
        status = 'active',
        activated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao ativar evento" });
  }
});

/* =====================================================
   CANCEL EVENT
===================================================== */
router.post("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`
      UPDATE events
      SET status = 'cancelled'
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao cancelar evento" });
  }
});

module.exports = router;
