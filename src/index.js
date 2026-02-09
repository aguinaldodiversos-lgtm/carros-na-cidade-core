require('dotenv').config();
const express = require('express');
const cors = require('cors');

const adsRoutes = require('./routes/ads');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const sitemapRoute = require('./routes/sitemap');
const alertRoutes = require('./routes/alerts');

const app = express();

// CORS
app.use(cors({
  origin: [
    'https://carrosnacidade.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Middlewares
app.use(express.json());

// Rotas
app.use('/api/ads', adsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/sitemap.xml', sitemapRoute);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Handler de erro global
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).json({
    error: 'Erro interno no servidor'
  });
});

// Start do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
