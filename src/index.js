require('dotenv').config();
const express = require('express');
const cors = require('cors');
const alertRoutes = require('./routes/alerts');
const adsRoutes = require('./routes/ads');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const sitemapRoute = require('./routes/sitemap');

const app = express();

/* =====================================================
   CORS CONFIGURADO PARA O SITE
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
   ROTAS DA API
===================================================== */

// Anúncios
app.use('/api/ads', adsRoutes);

// Autenticação
app.use('/api/auth', authRoutes);

// Pagamentos
app.use('/api/payments', paymentRoutes);

// Sitemap SEO
app.use('/sitemap.xml', sitemapRoute);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

/* =====================================================
   HANDLER DE ERROS GLOBAL
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
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
