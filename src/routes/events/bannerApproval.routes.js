const express = require("express");
const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   APROVAR BANNER
===================================================== */
router.post("/:eventId/approve", async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);

    if (!eventId) {
      return res.status(400).json({ error: "ID do evento inválido" });
    }

    // verificar se evento existe
    const eventResult = await pool.query(
      `SELECT id, banner_status FROM events WHERE id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: "Evento não encontrado" });
    }

    const event = eventResult.rows[0];

    if (event.banner_status === "approved") {
      return res.json({
        success: true,
        message: "Banner já estava aprovado",
      });
    }

    await pool.query(
      `UPDATE events
       SET banner_status = 'approved',
           approved_at = NOW()
       WHERE id = $1`,
      [eventId]
    );

    console.log(`✅ Banner aprovado manualmente: evento ${eventId}`);

    res.json({
      success: true,
      status: "approved",
    });
  } catch (err) {
    console.error("Erro ao aprovar banner:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =====================================================
   REJEITAR BANNER
===================================================== */
router.post("/:eventId/reject", async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);

    if (!eventId) {
      return res.status(400).json({ error: "ID do evento inválido" });
    }

    const eventResult = await pool.query(
      `SELECT id FROM events WHERE id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: "Evento não encontrado" });
    }

    await pool.query(
      `
      UPDATE events
      SET banner_status = 'rejected',
          banner_generated = false,
          banner_url = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [eventId]
    );

    console.log(`❌ Banner rejeitado: evento ${eventId}`);

    res.json({
      success: true,
      status: "rejected",
    });
  } catch (err) {
    console.error("Erro ao rejeitar banner:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
