const express = require("express");
const cors = require("cors");

// Rotas principais
const adsRoutes = require("./routes/ads");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const analyticsRoutes = require("./routes/analytics");
const autopilotRoutes = require("./routes/autopilot");
const eventsRoutes = require("./routes/events");
const advertisersRoutes = require("./routes/advertisers");
const metricsRoutes = require("./routes/metrics");
const fipeRoutes = require("./routes/fipe");

// Rotas administrativas
const adminEventsRoutes = require("./routes/admin.events");

// Rotas de sistema
const sitemapRoute = require("./routes/sitemap");

// Nova rota de alertas (LEADS)
const alertsRoutes = require("./routes/alerts/alerts.routes");

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
   ROTAS PRINCIPAIS
===================================================== */
app.use("/api/ads", adsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/alerts", alertsRoutes); // NOVA ROTA DE LEADS
app.use("/api/analytics", analyticsRoutes);
app.use("/api/autopilot", autopilotRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/advertisers", advertisersRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/fipe", fipeRoutes);

/* =====================================================
   ROTAS ADMINISTRATIVAS
===================================================== */
app.use("/api/admin/events", adminEventsRoutes);

/* =====================================================
   ROTAS DE SISTEMA
===================================================== */
app.use("/sitemap.xml", sitemapRoute);

// Health check
app.get("/health", (_, res) => res.json({ status: "ok" }));

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
