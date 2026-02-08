require('dotenv').config();
const express = require('express');

const adsRoutes = require('./routes/ads');
const paymentRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth'); // ← NOVO

const app = express();
app.use(express.json());

// rotas
app.use('/auth', authRoutes); // ← NOVO
app.use('/ads', adsRoutes);
app.use('/payments', paymentRoutes);

// health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
