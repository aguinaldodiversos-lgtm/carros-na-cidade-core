// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import healthRoutes from "./routes/health.js";

import { requestIdMiddleware } from "./shared/middlewares/requestId.middleware.js";
import { httpLoggerMiddleware } from "./shared/middlewares/httpLogger.middleware.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

// Rotas
import adEventsRoutes from "./modules/ads/events.routes.js"; // /api/events (tracking)
import adsEventsRoutes from "./modules/ads/ads.events.routes.js"; // /api/ads/* (eventos do anúncio)
import adsRoutes from "./modules/ads/ads.routes.js";
import leadsRoutes from "./modules/leads/leads.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import publicRoutes from "./modules/public/public.routes.js";

const app = express();

/* =====================================================
   CONFIGURAÇÕES BÁSICAS
===================================================== */
app.disable("x-powered-by");

// IMPORTANTE em cloud/proxy (Render, Cloudflare)
// garante req.ip correto para rate limit e logs
app.set("trust proxy", 1);

/* =====================================================
   SEGURANÇA
===================================================== */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =====================================================
   COMPRESSÃO (PERFORMANCE)
===================================================== */
app.use(compression());

/* =====================================================
   RATE LIMIT GLOBAL
===================================================== */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // 1000 req por IP / 15min
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

/* =====================================================
   CORS
===================================================== */
const allowedOrigins = new Set([
  "https://carrosnacidade.com",
  "https://www.carrosnacidade.com",
  "http://localhost:3000",
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // sem origin: curl, health checks, server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) return callback(null, true);

      return callback(new Error("CORS não permitido"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  })
);

/* =====================================================
   BODY PARSER
===================================================== */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   MIDDLEWARES GLOBAIS
===================================================== */
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);

/* =====================================================
   HEALTH CHECK (com DB check via healthRoutes)
===================================================== */
app.use(healthRoutes);

/* =====================================================
   ROTAS API
===================================================== */
app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/ads", adsRoutes);

// Eventos / tracking
app.use("/api/ads", adsEventsRoutes);
app.use("/api/events", adEventsRoutes);

/* =====================================================
   404 HANDLER
===================================================== */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota não encontrada",
    requestId: req.requestId,
  });
});

/* =====================================================
   ERROR HANDLER (SEMPRE ÚLTIMO)
===================================================== */
app.use(errorHandler);

export default app;
