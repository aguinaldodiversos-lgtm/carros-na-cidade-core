require('dotenv').config();
const express = require('express');

const adsRoutes = require('./routes/ads');
const paymentRoutes = require('./routes/payments');

const app = express();
app.use(express.json());

app.use('/ads', adsRoutes);
app.use('/payments', paymentRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
