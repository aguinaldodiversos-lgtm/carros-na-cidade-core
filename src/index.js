require("dotenv").config();

const express = require("express");
const cors = require("cors");

/* =====================================================
   ROUTES
===================================================== */
const adsRoutes = require("./routes/ads");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const sitemapRoute = require("./routes/sitemap");
const alertRoutes = require("./routes/alerts");
const analyticsRoutes = require("./routes/analytics");

/* =====================================================
   WORKERS
===================================================== */
const { startNotificationWorker } = require("./workers/notification.worker");
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");
const { startSeoWorker } = require("./workers/seo.worker");

/* =====================================================
   DATABASE MIGRATIONS
===================================================== */
const runMigrations = require("./database/migrate");

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
   ROUTES
===================================================== */
app.use("/api/ads", adsRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/sitemap.xml", sitemapRoute);

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */
app.use((err, req, res, next) => {
  console.error("Erro na aplicação:", err);
  res.status(500).json({
    error: "Erro interno no servidor",
  });
});

/* =====================================================
   START SERVER + WORKERS
===================================================== */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
    });

    /* =============================================
       START WORKERS
    ============================================= */

    console.log("🚀 Iniciando notification worker...");
    startNotificationWorker();

    console.log("📊 Iniciando strategy worker...");
    startStrategyWorker();

    console.log("🤖 Iniciando autopilot worker...");
    startAutopilotWorker();

    console.log("📝 Iniciando SEO worker...");
    startSeoWorker();
  } catch (err) {
    console.error("Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
