require("dotenv").config();

const express = require("express");
const cors = require("cors");

const runMigrations = require("./database/migrate");

// Rotas
const adsRoutes = require("./routes/ads");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const sitemapRoute = require("./routes/sitemap");
const alertRoutes = require("./routes/alerts");
const analyticsRoutes = require("./routes/analytics");

// Workers
const { startNotificationWorker } = require("./workers/notification.worker");
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startCompetitorWorker } = require("./workers/competitor.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");

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
   ROTAS
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
   HANDLER DE ERRO GLOBAL
===================================================== */
app.use((err, req, res, next) => {
  console.error("Erro na aplicação:", err);
  res.status(500).json({
    error: "Erro interno no servidor",
  });
});

/* =====================================================
   START DO SERVIDOR
===================================================== */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    // Workers
    console.log("🚀 Iniciando worker de notificações...");
    startNotificationWorker();

    console.log("🧠 Iniciando strategy worker...");
    startStrategyWorker();

    console.log("📡 Iniciando competitor worker...");
    startCompetitorWorker();

    console.log("🤖 Iniciando autopilot worker...");
    startAutopilotWorker();

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error("Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
