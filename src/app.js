// src/app.js

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import { requestIdMiddleware } from "./shared/middlewares/requestId.middleware.js";
import { httpLoggerMiddleware } from "./shared/middlewares/httpLogger.middleware.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

import adsRoutes from "./modules/ads/ads.routes.js";
import leadsRoutes from "./modules/leads/leads.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import publicRoutes from "./modules/public/public.routes.js";

const app = express();

/* =====================================================
   CONFIGURAÇÕES BÁSICAS
===================================================== */

app.disable("x-powered-by");

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
  max: 1000, // 1000 requests por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
  "https://carrosnacidade.com",
  "https://www.carrosnacidade.com",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS não permitido"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
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
   HEALTH CHECK
===================================================== */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    requestId: req.requestId,
  });
});

/* =====================================================
   ROTAS API
===================================================== */

app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/ads", adsRoutes);

/* =====================================================
   404 HANDLER
===================================================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota não encontrada",
  });
});

/* =====================================================
   ERROR HANDLER (SEMPRE ÚLTIMO)
===================================================== */

app.use(errorHandler);

export default app;
