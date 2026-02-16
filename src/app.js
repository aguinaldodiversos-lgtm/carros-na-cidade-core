const express = require("express");
const cors = require("cors");

const app = express();

/* =====================================================
   CORS
===================================================== */
app.use(
  cors({
    origin: [
      "https://carrosnacidade.com",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

/* =====================================================
   MIDDLEWARES
===================================================== */
app.use(express.json());

/* =====================================================
   IMPORTAÇÃO SEGURA DAS ROTAS
===================================================== */
function loadRouteSafe(path, name) {
  try {
    return require(path);
  } catch (err) {
    console.warn(`⚠️ Rota não encontrada: ${path}`);
    return null;
  }
}

// Rotas principais
const adsRoutes = loadRouteSafe("./routes/ads", "ads");
const authRoutes = loadRouteSafe("./routes/auth", "auth");
const paymentRoutes = loadRouteSafe("./routes/payments", "payments");
const sitemapRoute = loadRouteSafe("./routes/sitemap", "sitemap");
const alertRoutes = loadRouteSafe("./routes/alerts", "alerts");
const analyticsRoutes = loadRouteSafe("./routes/analytics", "analytics");
const autopilotRoutes = loadRouteSafe("./routes/autopilot", "autopilot");
const eventsRoutes = loadRouteSafe("./routes/events", "events");
const adminEventsRoutes = loadRouteSafe(
  "./routes/admin.events",
  "admin events"
);
const advertisersRoutes = loadRouteSafe(
  "./routes/advertisers",
  "advertisers"
);
const metricsRoutes = loadRouteSafe("./routes/metrics", "metrics");
const fipeRoutes = loadRouteSafe("./routes/fipe", "fipe");

// Nova rota de integrações (AutoDriv)
const integrationsRoutes = loadRouteSafe(
  "./routes/integrations",
  "integrations"
);

// Banner approval
const bannerApprovalRoutes = loadRouteSafe(
  "./routes/events/bannerApproval.routes",
  "banner approval"
);

/* =====================================================
   REGISTRO DAS ROTAS
===================================================== */
if (adsRoutes) app.use("/api/ads", adsRoutes);
if (authRoutes) app.use("/api/auth", authRoutes);
if (paymentRoutes) app.use("/api/payments", paymentRoutes);
if (alertRoutes) app.use("/api/alerts", alertRoutes);
if (analyticsRoutes) app.use("/api/analytics", analyticsRoutes);
if (autopilotRoutes) app.use("/api/autopilot", autopilotRoutes);
if (eventsRoutes) app.use("/api/events", eventsRoutes);
if (adminEventsRoutes)
  app.use("/api/admin/events", adminEventsRoutes);
if (advertisersRoutes)
  app.use("/api/advertisers", advertisersRoutes);
if (metricsRoutes) app.use("/api/metrics", metricsRoutes);
if (fipeRoutes) app.use("/api/fipe", fipeRoutes);
if (integrationsRoutes)
  app.use("/api/integrations", integrationsRoutes);

if (bannerApprovalRoutes)
  app.use("/api/events/banner", bannerApprovalRoutes);

if (sitemapRoute) app.use("/sitemap.xml", sitemapRoute);

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* =====================================================
   ERRO GLOBAL
===================================================== */
app.use((err, req, res, next) => {
  console.error("Erro na aplicação:", err);
  res.status(500).json({
    error: "Erro interno no servidor",
  });
});

module.exports = app;
