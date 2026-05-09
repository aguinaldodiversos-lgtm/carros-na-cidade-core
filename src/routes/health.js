// src/routes/health.js
import express from "express";
import { healthcheck as dbHealthcheck, pool } from "../infrastructure/database/db.js";
import { checkAntifraudSchema } from "../infrastructure/database/schema-readiness.js";

const router = express.Router();

/**
 * Cache do resultado do schema readiness por 60s. O check é leve (2 queries
 * em information_schema) mas não há motivo para martelar o pg toda vez que
 * o Render bate /health. TTL curto faz a re-execução ainda flagrar uma
 * migration tardia em poucos minutos.
 */
const SCHEMA_CACHE_TTL_MS = 60_000;
let schemaCache = { value: null, expiresAt: 0 };

async function getAntifraudSchemaStatus() {
  const now = Date.now();
  if (schemaCache.value && schemaCache.expiresAt > now) {
    return schemaCache.value;
  }
  try {
    const result = await checkAntifraudSchema(pool);
    schemaCache = { value: result, expiresAt: now + SCHEMA_CACHE_TTL_MS };
    return result;
  } catch (err) {
    // Não cacheamos erros — próxima call tenta de novo.
    return {
      ok: false,
      error: err?.message || String(err),
      missingColumns: [],
      missingTables: [],
    };
  }
}

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
  const env = String(process.env.NODE_ENV || "development").toLowerCase();
  const isCriticalEnv = env === "production" || env === "staging";

  try {
    const [dbOk, redisStatus, schema] = await Promise.all([
      dbHealthcheck(),
      checkRedis(),
      getAntifraudSchemaStatus(),
    ]);

    // Schema status: "ok" quando a migration 025 está aplicada; "missing"
    // quando faltam colunas/tabelas. Em production/staging "missing" é
    // crítico (degrada healthcheck para 503).
    const schemaStatus = schema.ok ? "ok" : "missing";

    const checks = {
      db: dbOk ? "up" : "down",
      redis: redisStatus,
      antifraud_schema: schemaStatus,
    };

    if (!schema.ok) {
      // Detalhe acionável para o operador — sem leak de schema interno
      // (apenas nomes que já estão na migration pública).
      checks.antifraud_schema_missing = {
        columns: schema.missingColumns,
        tables: schema.missingTables,
      };
    }

    const allCriticalUp =
      dbOk && (!isCriticalEnv || schema.ok);

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

/**
 * Helper para reset do cache em ambiente de teste — não exposto via HTTP.
 * Permite ao vitest exercitar caminhos OK/missing/erro do schema readiness
 * sem depender de timestamps reais.
 */
export function __resetHealthSchemaCacheForTests() {
  schemaCache = { value: null, expiresAt: 0 };
}

export default router;
