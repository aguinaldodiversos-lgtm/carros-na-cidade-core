// src/app.js
//
// =============================================================================
// API HTTP OFICIAL (produção)
// =============================================================================
// Único ponto de montagem do Express para o servidor em src/index.js.
// Mapa completo: docs/api-routes-inventory.md
//
// Prefixos montados:
//   /api/public      → modules/public/public.routes.js
//   /api/public/seo  → modules/public/public-seo.routes.js
//   /api/auth        → modules/auth/auth.routes.js
//   /api/account     → modules/account/account.routes.js
//   /api/payments    → modules/payments/payments.routes.js
//   /api/leads       → modules/leads/leads.routes.js
//   /api/ads         → modules/ads/ads.routes.js + modules/ads/ads.events.routes.js (POST …/event)
//   /api/events      → modules/ads/events.routes.js (POST / — mesmo handler que ingest de ad_events)
//   /api/admin       → modules/admin/admin.routes.js (auth + role=admin required)
//
// Rotas HTTP legadas CommonJS em src/routes foram removidas; mantêm-se apenas health/metrics.
//
// Anúncios: código ativo só em src/modules/ads/.
// =============================================================================

import fs from "node:fs";
import path from "node:path";

import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import accountRoutes from "./modules/account/account.routes.js";
import adsEventsRoutes from "./modules/ads/ads.events.routes.js";
import adsRoutes from "./modules/ads/ads.routes.js";
import adEventsRoutes from "./modules/ads/events.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import dealerAcquisitionInboundRoutes from "./modules/dealer-acquisition/dealer-inbound.routes.js";
import leadsRoutes from "./modules/leads/leads.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import publicSeoRoutes from "./modules/public/public-seo.routes.js";
import regionsRoutes from "./modules/regions/regions.routes.js";
import vehicleImagesRoutes from "./modules/vehicle-images/vehicle-images.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";

import healthRoutes from "./routes/health.js";
import metricsRoutes from "./routes/metrics.js";

import { requestIdMiddleware } from "./shared/middlewares/requestId.middleware.js";
import { httpLoggerMiddleware } from "./shared/middlewares/httpLogger.middleware.js";
import { errorHandler, AppError } from "./shared/middlewares/error.middleware.js";
import { requestMetricsMiddleware } from "./shared/observability/request.metrics.middleware.js";
import {
  clientRateLimitKey,
  sitemapRateLimit,
  vehicleImagesRateLimit,
  adsListRateLimit,
  adsSearchRateLimit,
  publicCitiesRateLimit,
  searchRateLimit,
  uploadsRateLimit,
} from "./shared/middlewares/rateLimit.middleware.js";
import { bandwidthDiagnosticsMiddleware } from "./shared/middlewares/bandwidth-diagnostics.middleware.js";
import { botBlockerMiddleware } from "./shared/middlewares/bot-blocker.middleware.js";

const app = express();

const APP_NAME = process.env.APP_NAME || "carros-na-cidade-core";
const NODE_ENV = process.env.NODE_ENV || "development";

// Se quiser liberar múltiplas origens:
// CORS_ALLOWED_ORIGINS="https://a.com,https://b.com"
const DEFAULT_ALLOWED_ORIGINS = [
  "https://carrosnacidade.com",
  "https://www.carrosnacidade.com",
  "http://localhost:3000",
];

const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");

// Render / Cloudflare / proxies
app.set("trust proxy", 1);

// Segurança HTTP
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// CORS robusto: não quebra probes/healthchecks sem Origin
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new AppError("CORS não permitido para esta origem", 403));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Rate limit global (por visitante real quando o BFF envia X-Cnc-Client-Ip)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 1000),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientRateLimitKey(req),
    message: {
      success: false,
      message: "Muitas requisições. Tente novamente em instantes.",
    },
  })
);

// Compressão e parsers
app.use(compression());

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.URLENCODED_BODY_LIMIT || "1mb",
  })
);

// Observabilidade
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
app.use((req, res, next) => {
  try {
    return requestMetricsMiddleware(req, res, next);
  } catch {
    return next();
  }
});

// Bandwidth diagnostics (controlado por BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED).
// Conta bytes via wrap de res.write/end e emite agregado JSON a cada 60s.
// Posicionado depois do logger pra que `bytes_sent` reflita exatamente o que
// foi enviado (incluindo possíveis transformações de upstream middlewares).
app.use(bandwidthDiagnosticsMiddleware);

// X-Robots-Tag global: o backend (carros-na-cidade-core.onrender.com) NUNCA
// deve aparecer indexado. SEO real acontece no frontend (carrosnacidade.com).
// Aplicar antes de qualquer rota — middleware no-op se a env não estiver
// setada não faz sentido aqui, é guardrail leve.
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

// Bot blocklist emergencial (controlado por BAD_BOTS_BLOCKED). Termina o
// request com 429 ANTES das rotas pesadas serem invocadas.
app.use(botBlockerMiddleware);

// robots.txt do backend: explícito Disallow: / pra crawlers que ignoram o
// header X-Robots-Tag. Cache 1h.
app.get("/robots.txt", (_req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.status(200).send("User-agent: *\nDisallow: /\n");
});

// Probes / raiz
app.head("/", (_req, res) => res.sendStatus(200));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    app: APP_NAME,
    env: NODE_ENV,
    requestId: req.requestId || null,
  });
});

// Rotas base
app.use(healthRoutes);
app.use(metricsRoutes);

app.get("/health/meta", (req, res) => {
  res.status(200).json({
    success: true,
    app: APP_NAME,
    env: NODE_ENV,
    requestId: req.requestId || null,
  });
});

// Legado `/uploads/...`: servir somente quando habilitado EXPLICITAMENTE via
// SERVE_UPLOADS_STATIC=true. Default OFF (refatorado em 2026-05-13 após
// incidente de bandwidth — a verificação anterior `!== "false"` ligava
// quando a env não estava setada, contradizendo o feature flag
// `features.serveUploadsStatic` que tem default OFF em produção).
//
// Em produção, novos uploads vão direto para R2 e listagens recebem URLs
// públicas — não há razão de servir /uploads pelo origin.
const uploadsRoot = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(process.cwd(), "uploads");
if (process.env.SERVE_UPLOADS_STATIC === "true" && fs.existsSync(uploadsRoot)) {
  app.use("/uploads", uploadsRateLimit, express.static(uploadsRoot));
}

// API routes
// `/api/public/seo` deve vir antes de `/api/public` para o prefixo mais específico
// ser resolvido primeiro e não competir com o router mais amplo.
//
// Rate limits específicos por endpoint (2026-05-14, terceira iteração do fix
// de bandwidth). Cada um é uma janela de 60s independente do limit global.
// Resposta 429 com corpo mínimo `{"error":"rate_limited"}`.
app.use("/api/public/seo/sitemap", sitemapRateLimit);
app.use("/api/public/seo", publicSeoRoutes);

app.use("/api/public/cities", publicCitiesRateLimit);
app.use("/api/public", publicRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/leads", leadsRoutes);

// /api/ads/search é o mais pesado; aplicar limit mais restritivo PRIMEIRO,
// senão `adsListRateLimit` em /api/ads casa /search também.
app.use("/api/ads/search", adsSearchRateLimit);
app.use("/api/ads", adsListRateLimit);
app.use("/api/ads", adsRoutes);
app.use("/api/ads", adsEventsRoutes);
app.use("/api/events", adEventsRoutes);

app.use("/api/search", searchRateLimit);

app.use("/api/dealer-acquisition", dealerAcquisitionInboundRoutes);
app.use("/api/vehicle-images", vehicleImagesRateLimit, vehicleImagesRoutes);
app.use("/api/admin", adminRoutes);

// Endpoint privado (X-Internal-Token). Não documentado em /api/public, não
// aparece em sitemap, base da futura Página Regional. Sem token = 404.
app.use("/api/internal/regions", regionsRoutes);

// 404
app.use((req, _res, next) => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404));
});

// Error handler final
app.use(errorHandler);

export default app;
