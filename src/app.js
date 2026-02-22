// src/app.js

import express from "express";
import cors from "cors";
import { logger } from "./shared/logger.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

const app = express();

/* =====================================================
   CORS
===================================================== */
const allowedOrigins = [
  "https://carrosnacidade.com",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin }, "CORS bloqueado");
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

/* =====================================================
   MIDDLEWARES
===================================================== */
app.use(express.json());

/* =====================================================
   FUNÇÃO SEGURA PARA CARREGAR ROTAS (ESM)
===================================================== */
async function loadRouteSafe(path, name) {
  try {
    const module = await import(path);
    logger.info(`✅ Rota carregada: ${name}`);
    return module.default;
  } catch (err) {
    logger.warn(`⚠️ Rota não encontrada: ${path}`);
    return null;
  }
}

/* =====================================================
   REGISTRO DINÂMICO DE ROTAS
===================================================== */
async function registerRoutes() {
  const routes = [
    { path: "./routes/ads/index.js", mount: "/api/ads", name: "ads" },
    { path: "./routes/auth/index.js", mount: "/api/auth", name: "auth" },
    { path: "./routes/payments/index.js", mount: "/api/payments", name: "payments" },
    { path: "./routes/sitemap/index.js", mount: "/sitemap.xml", name: "sitemap" },
    { path: "./routes/alerts/index.js", mount: "/api/alerts", name: "alerts" },
    { path: "./routes/analytics/index.js", mount: "/api/analytics", name: "analytics" },
    { path: "./routes/autopilot/index.js", mount: "/api/autopilot", name: "autopilot" },
    { path: "./routes/events/index.js", mount: "/api/events", name: "events" },
    { path: "./routes/admin.events/index.js", mount: "/api/admin/events", name: "admin events" },
    { path: "./routes/advertisers/index.js", mount: "/api/advertisers", name: "advertisers" },
    { path: "./routes/metrics/index.js", mount: "/api/metrics", name: "metrics" },
    { path: "./routes/fipe/index.js", mount: "/api/fipe", name: "fipe" },
    { path: "./routes/integrations/index.js", mount: "/api/integrations", name: "integrations" },
    { path: "./routes/events/bannerApproval.routes.js", mount: "/api/events/banner", name: "banner approval" },
  ];

  for (const route of routes) {
    const loadedRoute = await loadRouteSafe(route.path, route.name);
    if (loadedRoute) {
      app.use(route.mount, loadedRoute);
    }
  }
}

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* =====================================================
   INICIALIZAÇÃO
===================================================== */
await registerRoutes();

/* =====================================================
   ERRO GLOBAL (SEMPRE ÚLTIMO)
===================================================== */
app.use(errorHandler);

export default app;
