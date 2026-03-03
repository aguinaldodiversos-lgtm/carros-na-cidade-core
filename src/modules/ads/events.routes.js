import express from "express";
import { pool } from "../../infrastructure/database/db.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { ad_id, event_type } = req.body;

    if (!ad_id || !event_type) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    await pool.query(
      `
      INSERT INTO ad_events (ad_id, event_type, ip_address, user_agent)
      VALUES ($1,$2,$3,$4)
      `,
      [
        ad_id,
        event_type,
        req.ip,
        req.headers["user-agent"] || null
      ]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
