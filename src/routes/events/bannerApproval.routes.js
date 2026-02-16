const express = require("express");
const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.post("/:eventId/approve", async (req, res) => {
  try {
    const { eventId } = req.params;

    await pool.query(
      `UPDATE events SET banner_status = 'approved' WHERE id = $1`,
      [eventId]
    );

    res.json({ success: true, status: "approved" });
  } catch (err) {
    console.error("Erro ao aprovar banner:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/:eventId/reject", async (req, res) => {
  try {
    const { eventId } = req.params;

    await pool.query(
      `
      UPDATE events
      SET banner_status = 'rejected',
          banner_generated = false
      WHERE id = $1
      `,
      [eventId]
    );

    res.json({ success: true, status: "rejected" });
  } catch (err) {
    console.error("Erro ao rejeitar banner:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
