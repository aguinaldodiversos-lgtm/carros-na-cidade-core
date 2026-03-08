import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import healthRoutes from "./routes/health.js";
import metricsRoutes from "./routes/metrics.js";

import { requestIdMiddleware } from "./shared/middlewares/requestId.middleware.js";
import { httpLoggerMiddleware } from "./shared/middlewares/httpLogger.middleware.js";
import { errorHandler, AppError } from "./shared/middlewares/error.middleware.js";
import { requestMetricsMiddleware } from "./shared/observability/request.metrics.middleware.js";

import adEventsRoutes from "./modules/ads/events.routes.js";
import adsEventsRoutes from "./modules/ads/ads.events.routes.js";
import adsRoutes from "./modules/ads/ads.routes.js";
import leadsRoutes from "./modules/leads/leads.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import publicSeoRoutes from "./modules/public/public-seo.routes.js";

const app = express();

const APP_NAME = process.env.APP_NAME || "carros-na-cidade-core";
const NODE_ENV = process.env.NODE_ENV || "development";

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
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new AppError("CORS não permitido para esta origem", 403));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 1000),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Muitas requisições. Tente novamente em instantes.",
    },
  })
);

app.use(compression());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.URLENCODED_BODY_LIMIT || "1mb",
  })
);

app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
app.use(requestMetricsMiddleware);

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

app.use("/api/public", publicRoutes);
app.use("/api/public/seo", publicSeoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/ads", adsEventsRoutes);
app.use("/api/events", adEventsRoutes);

app.use((req, _res, next) => {
  next(
    new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404)
  );
});

app.use(errorHandler);

export default app;
