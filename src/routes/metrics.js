const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   TRACK LOJA
===================================================== */
router.post("/shop-view", async (req, res) => {
  try {
    const { advertiser_id } = req.body;

    if (!advertiser_id) {
      return res.status(400).json({ error: "advertiser_id obrigatório" });
    }

    await pool.query(
      `
      INSERT INTO advertiser_metrics (advertiser_id, metric_type)
      VALUES ($1, 'shop_view')
      `,
      [advertiser_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar métrica" });
  }
});

/* =====================================================
   TRACK CLIQUE NO WHATSAPP
===================================================== */
router.post("/whatsapp-click", async (req, res) => {
  try {
    const { advertiser_id } = req.body;

    if (!advertiser_id) {
      return res.status(400).json({ error: "advertiser_id obrigatório" });
    }

    await pool.query(
      `
      INSERT INTO advertiser_metrics (advertiser_id, metric_type)
      VALUES ($1, 'whatsapp_click')
      `,
      [advertiser_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar métrica" });
  }
});

/* =====================================================
   TRACK EVENTO
===================================================== */
router.post("/event-view", async (req, res) => {
  try {
    const { event_id } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: "event_id obrigatório" });
    }

    await pool.query(
      `
      INSERT INTO event_metrics (event_id, metric_type)
      VALUES ($1, 'event_view')
      `,
      [event_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar métrica" });
  }
});

router.post("/event-click", async (req, res) => {
  try {
    const { event_id } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: "event_id obrigatório" });
    }

    await pool.query(
      `
      INSERT INTO event_metrics (event_id, metric_type)
      VALUES ($1, 'event_click')
      `,
      [event_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar métrica" });
  }
});

module.exports = router;
