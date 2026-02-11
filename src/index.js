require("dotenv").config();
const express = require("express");
const cors = require("cors");

const runMigrations = require("./database/migrate");
const { startWorker } = require("./workers/notification.worker");

const adsRoutes = require("./routes/ads");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const sitemapRoute = require("./routes/sitemap");
const alertRoutes = require("./routes/alerts");

const app = express();

// CORS
app.use(cors({
  origin: [
    "https://carrosnacidade.com",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// Rotas
app.use("/api/ads", adsRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/sitemap.xml", sitemapRoute);

// Health
app.get("/health", (_, res) => res.json({ status: "ok" }));

// Erro global
app.use((err, req, res, next) => {
  console.error("Erro:", err);
  res.status(500).json({ error: "Erro interno" });
});

// Start
const PORT = process.env.PORT || 3000;

async function startServer() {
  await runMigrations();
  startWorker();

  app.listen(PORT, () => {
    console.log(`🚗 API rodando na porta ${PORT}`);
  });
}

startServer();
