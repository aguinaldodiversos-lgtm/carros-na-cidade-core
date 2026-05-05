const express = require("express");
const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Guard de produto: enquanto Eventos estiver dormente
 * (`EVENTS_ENABLED !== "true"` OU `EVENTS_CREATION_ENABLED !== "true"`),
 * estas rotas retornam 410 Gone com mensagem clara. Não tocam o banco.
 *
 * Ver `docs/runbooks/events-feature-shutdown.md`. Reativar exige flag.
 *
 * NOTA: este router não é montado em nenhum entry-point hoje (código
 * órfão). O middleware é defesa em profundidade caso seja remontado
 * acidentalmente em deploys futuros.
 */
router.use((req, res, next) => {
  const eventsOn = process.env.EVENTS_ENABLED === "true";
  const creationOn = process.env.EVENTS_CREATION_ENABLED === "true";
  if (!eventsOn || !creationOn) {
    return res.status(410).json({
      ok: false,
      error: "events_disabled",
      message:
        "Produto Evento está desligado. Aprovação/rejeição de banner indisponível.",
    });
  }
  return next();
});

router.post("/:eventId/approve", async (req, res) => {
  try {
    const { eventId } = req.params;

    await pool.query(`UPDATE events SET banner_status = 'approved' WHERE id = $1`, [eventId]);

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
