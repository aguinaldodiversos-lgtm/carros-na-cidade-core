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
   IMPORTAÇÃO DE ROTAS
===================================================== */
const adsRoutes = require("./routes/ads");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const sitemapRoute = require("./routes/sitemap");
const alertsRoutes = require("./routes/alerts"); // corrigido
const analyticsRoutes = require("./routes/analytics");
const autopilotRoutes = require("./routes/autopilot");
const eventsRoutes = require("./routes/events");
const adminEventsRoutes = require("./routes/admin.events");
const advertisersRoutes = require("./routes/advertisers");
const metricsRoutes = require("./routes/metrics");
const fipeRoutes = require("./routes/fipe");

/* =====================================================
   REGISTRO DAS ROTAS
===================================================== */
app.use("/api/ads", adsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/autopilot", autopilotRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin/events", adminEventsRoutes);
app.use("/api/advertisers", advertisersRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/fipe", fipeRoutes);
app.use("/sitemap.xml", sitemapRoute);

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
