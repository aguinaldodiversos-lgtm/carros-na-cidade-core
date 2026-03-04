// src/routes/health.js
import express from "express";
import { healthcheck as dbHealthcheck } from "../infrastructure/database/db.js";

const router = express.Router();

router.get("/health", async (req, res) => {
  const startedAt = Date.now();

  try {
    const dbOk = await dbHealthcheck();

    const payload = {
      ok: true,
      status: "healthy",
      env: process.env.NODE_ENV || "development",
      service: "carros-na-cidade-core",
      version: process.env.npm_package_version,
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
      uptime_s: Math.floor(process.uptime()),
      checks: {
        db: dbOk ? "up" : "down",
      },
      latency_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };

    // Se o DB estiver down, responde 503 (importante pro Render/monitor)
    if (!dbOk) {
      return res.status(503).json({ ...payload, ok: false, status: "degraded" });
    }

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(503).json({
      ok: false,
      status: "unhealthy",
      env: process.env.NODE_ENV || "development",
      service: "carros-na-cidade-core",
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
      uptime_s: Math.floor(process.uptime()),
      error: err?.message || String(err),
      latency_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
