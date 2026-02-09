require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

app.use(express.json());

/* =====================================================
   ROTAS
===================================================== */
app.use('/api/ads', adsRoutes);
app.use('/auth', authRoutes);
app.use('/payments', paymentRoutes);
app.use('/sitemap.xml', sitemapRoute);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
