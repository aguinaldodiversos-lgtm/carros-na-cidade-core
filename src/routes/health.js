// src/routes/health.js
import express from "express";
import { healthcheck as dbHealthcheck } from "../infrastructure/database/db.js";

const router = express.Router();

async function checkRedis() {
  try {
    const { redis } = await import("../infrastructure/cache/redis.js");
    if (!redis) return "disabled";
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return pong === "PONG" ? "up" : "degraded";
  } catch {
    return "down";
  }
}

router.get("/health", async (req, res) => {
  const startedAt = Date.now();

  try {
    const [dbOk, redisStatus] = await Promise.all([dbHealthcheck(), checkRedis()]);

    const checks = {
      db: dbOk ? "up" : "down",
      redis: redisStatus,
    };

    const allCriticalUp = dbOk;

    const payload = {
      ok: allCriticalUp,
      status: allCriticalUp ? "healthy" : "degraded",
      env: process.env.NODE_ENV || "development",
      service: "carros-na-cidade-core",
      version: process.env.npm_package_version,
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
      uptime_s: Math.floor(process.uptime()),
      checks,
      latency_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };

    if (!allCriticalUp) {
      return res.status(503).json(payload);
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
