require('dotenv').config();

/* =====================================================
   WORKERS
===================================================== */
require("./workers/notification.worker");

/* =====================================================
   IMPORTS
===================================================== */
const express = require('express');
const cors = require('cors');

const runMigrations = require("./database/migrate");

const adsRoutes = require('./routes/ads');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const sitemapRoute = require('./routes/sitemap');
const alertRoutes = require('./routes/alerts');

/* =====================================================
   APP SETUP
===================================================== */
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

/* =====================================================
   ROUTES
===================================================== */
app.use('/api/ads', adsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/sitemap.xml', sitemapRoute);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

/* ======================*
