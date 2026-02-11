require("./workers/strategy_worker");
require("dotenv").config();
require("./workers/opportunity_engine");
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

// Workers (apenas os que sabemos que existem)
const { startStrategyWorker } = require("./workers/strategy.worker");
const { startAutopilotWorker } = require("./workers/autopilot.worker");

let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {
  console.warn("⚠️ SEO worker não encontrado, ignorando...");
}

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

/* =====================================================
   START DO SERVIDOR
===================================================== */
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log("🔧 Rodando migrations...");
    await runMigrations();
    console.log("✅ Migrations concluídas.");

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);

      // Workers
      try {
        startStrategyWorker();
        startAutopilotWorker();

        if (startSeoWorker) {
          startSeoWorker();
        }

        console.log("🚀 Workers iniciados");
      } catch (err) {
        console.error("Erro ao iniciar workers:", err);
      }
    });
  } catch (err) {
    console.error("Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
