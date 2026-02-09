require('dotenv').config();
const express = require('express');
const cors = require('cors');

const adsRoutes = require('./routes/ads');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const sitemapRoute = require('./routes/sitemap');
const alertRoutes = require('./routes/alerts');

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
==================
