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
   FUNÇÃO SEGURA PARA CARREGAR ROTAS
===================================================== */
function loadRoute(path, basePath) {
  try {
    const route = require(path);
    app.use(basePath, route);
    console.log(`✅ Rota carregada: ${basePath}`);
  } catch (err) {
    console.warn(`⚠️ Rota não encontrada: ${path}`);
  }
}

/* =====================================================
   ROTAS PRINCIPAIS
===================================================== */
loadRoute("./routes/ads", "/api/ads");
loadRoute("./routes/auth", "/api/auth");
loadRoute("./routes/payments", "/api/payments");
loadRoute("./routes/analytics", "/api/analytics");
loadRoute("./routes/autopilot", "/api/autopilot");
loadRoute("./routes/events", "/api/events");
loadRoute("./routes/admin.events", "/api/admin/events");
loadRoute("./routes/advertisers", "/api/advertisers");
loadRoute("./routes/metrics", "/api/metrics");
loadRoute("./routes/fipe", "/api/fipe");
loadRoute("./routes/alerts", "/api/alerts");

/* =====================================================
   ROTA DE APROVAÇÃO DE BANNER
===================================================== */
loadRoute(
  "./routes/events/bannerApproval.routes",
  "/api/events/banner"
);

/* =====================================================
   SITEMAP
===================================================== */
try {
  const sitemapRoute = require("./routes/sitemap");
  app.use("/sitemap.xml", sitemapRoute);
  console.log("✅ Rota carregada: /sitemap.xml");
} catch {
  console.warn("⚠️ Rota sitemap não encontrada");
}

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/health", (_, res) =>
  res.json({ status: "ok" })
);

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
