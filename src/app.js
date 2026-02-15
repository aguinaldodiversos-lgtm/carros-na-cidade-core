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
   IMPORTAÇÃO SEGURA DE ROTAS
===================================================== */
function loadRouteSafe(path) {
  try {
    return require(path);
  } catch (err) {
    console.warn(`⚠️ Rota não encontrada: ${path}`);
    return null;
  }
}

const adsRoutes = loadRouteSafe("./routes/ads");
const alertsRoutes = loadRouteSafe("./routes/alerts");
const authRoutes = loadRouteSafe("./routes/auth");
const paymentRoutes = loadRouteSafe("./routes/payments");
const sitemapRoute = loadRouteSafe("./routes/sitemap");
const analyticsRoutes = loadRouteSafe("./routes/analytics");
const autopilotRoutes = loadRouteSafe("./routes/autopilot");
const eventsRoutes = loadRouteSafe("./routes/events");
const adminEventsRoutes = loadRouteSafe("./routes/admin.events");
const advertisersRoutes = loadRouteSafe("./routes/advertisers");
const metricsRoutes = loadRouteSafe("./routes/metrics");
const fipeRoutes = loadRouteSafe("./routes/fipe");
const bannerApprovalRoutes = loadRouteSafe(
  "./routes/events/bannerApproval.routes"
);

/* =====================================================
   REGISTRO DAS ROTAS
===================================================== */
if (adsRoutes) app.use("/api/ads", adsRoutes);
if (alertsRoutes) app.use("/api/alerts", alertsRoutes);
if (authRoutes) app.use("/api/auth", authRoutes);
if (paymentRoutes) app.use("/api/payments", paymentRoutes);
if (analyticsRoutes) app.use("/api/analytics", analyticsRoutes);
if (autopilotRoutes) app.use("/api/autopilot", autopilotRoutes);
if (eventsRoutes) app.use("/api/events", eventsRoutes);
if (adminEventsRoutes) app.use("/api/admin/events", adminEventsRoutes);
if (advertisersRoutes) app.use("/api/advertisers", advertisersRoutes);
if (metricsRoutes) app.use("/api/metrics", metricsRoutes);
if (fipeRoutes) app.use("/api/fipe", fipeRoutes);
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
