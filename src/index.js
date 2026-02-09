require('dotenv').config();
const express = require('express');

const adsRoutes = require('./routes/ads');
const paymentRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth');
const sitemapRoute = require('./routes/sitemap');

const app = express();
app.use(express.json());

// rotas da API
app.use('/api/ads', adsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authRoutes);

// sitemap público
app.use('/', sitemapRoute);

// health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
