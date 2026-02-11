require('dotenv').config();

const express = require('express');
const cors = require('cors');

const runMigrations = require("./database/migrate");

const adsRoutes = require('./routes/ads');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const sitemapRoute = require('./routes/sitemap');
const alertRoutes = require('./routes/alerts');

const app = express();

/* =====================================================
   CORS
===================================================== */
app.use(cors({
  origin: [
    'https://carrosnacidade.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

/* =====================================================
   MIDDLEWARES
===================================================== */
app.use(express.json());

/* =====================================================
   ROTAS
===================================================== */
app.use('/api/ads', adsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/sitemap.xml', sitemapRoute);

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get('/health', (_, res) => res.json({ status: 'ok' }));

/* =====================================================
   HANDLER DE ERRO GLOBAL
===================================================== */
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).json({
    error: 'Erro interno no servidor'
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
    console.log("✅ Migrations concluídas com sucesso.");

    // iniciar worker de notificações
    try {
      require("./workers/notification.worker");
      console.log("🚀 Notification worker iniciado");
    } catch (workerErr) {
      console.error("⚠️ Falha ao iniciar worker:", workerErr);
    }

    app.listen(PORT, () => {
      console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
