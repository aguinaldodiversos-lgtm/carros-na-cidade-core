const express = require('express');
const mercadopago = require('../config/mercadopago');
const pool = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

const PLAN_PRICE = {
  professional: 49.9,
  highlight: 99.9,
};

router.post('/checkout', auth, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PLAN_PRICE[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const preference = {
      items: [{
        title: `Plano ${plan}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: PLAN_PRICE[plan],
      }],
      notification_url: `${process.env.APP_BASE_URL}/payments/webhook`,
    };

    const mp = await mercadopago.preferences.create(preference);

    res.json({ init_point: mp.body.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no pagamento' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    if (req.body.type !== 'payment') return res.sendStatus(200);

    const payment = await mercadopago.payment.findById(req.body.data.id);
    if (payment.body.status !== 'approved') return res.sendStatus(200);

    await pool.query(
      `UPDATE advertisers
       SET plan = 'professional', status = 'active'
       WHERE id = $1`,
      [payment.body.external_reference]
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;
