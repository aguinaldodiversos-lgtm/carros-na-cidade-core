const express = require('express');
const mercadopago = require('../config/mercadopago');
const pool = require('../config/db');
const auth = require('../middlewares/auth');

const router = express.Router();

/* =====================================================
   PLANOS (preço apenas informativo)
===================================================== */
const PLAN_PRICE = {
  professional: 19.9,
  highlight: 9.9,
};

/* =====================================================
   CRIAR CHECKOUT
===================================================== */
router.post('/checkout', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.user_id;

    if (!PLAN_PRICE[plan]) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const preference = {
      items: [
        {
          title: `Plano ${plan}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: PLAN_PRICE[plan],
        },
      ],
      external_reference: JSON.stringify({
        user_id: userId,
        plan: plan,
      }),
      notification_url: `${process.env.APP_BASE_URL}/payments/webhook`,
    };

    const mp = await mercadopago.preferences.create(preference);

    res.json({ init_point: mp.body.init_point });
  } catch (err) {
    console.error('Erro no checkout:', err);
    res.status(500).json({ error: 'Erro no pagamento' });
  }
});

/* =====================================================
   WEBHOOK MERCADO PAGO (ROBUSTO)
===================================================== */
router.post('/webhook', async (req, res) => {
  const client = await pool.connect();

  try {
    // Mercado Pago pode enviar vários tipos de notificação
    if (req.body.type !== 'payment' || !req.body.data?.id) {
      return res.sendStatus(200);
    }

    const paymentResponse = await mercadopago.payment.findById(
      req.body.data.id
    );

    const payment = paymentResponse.body;

    if (!payment) {
      console.error('Pagamento não encontrado no MP');
      return res.sendStatus(200);
    }

    const mpPaymentId = payment.id;
    const status = payment.status;
    const amount = payment.transaction_amount;

    if (!payment.external_reference) {
      console.error('external_reference ausente');
      return res.sendStatus(200);
    }

    let ref;
    try {
      ref = JSON.parse(payment.external_reference);
    } catch (e) {
      console.error('external_reference inválido');
      return res.sendStatus(200);
    }

    const userId = ref.user_id;
    const plan = ref.plan;

    if (!userId || !plan) {
      console.error('Dados de referência inválidos');
      return res.sendStatus(200);
    }

    /* ===============================
       TRANSAÇÃO SEGURA
    =============================== */
    await client.query('BEGIN');

    // salvar pagamento (idempotente)
    await client.query(
      `INSERT INTO payments
       (user_id, mp_payment_id, status, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (mp_payment_id) DO UPDATE
       SET status = EXCLUDED.status`,
      [userId, mpPaymentId, status, amount]
    );

    // ativar assinatura apenas se aprovado
    if (status === 'approved') {
      // desativar assinaturas antigas
      await client.query(
        `UPDATE subscriptions
         SET status = 'canceled', expires_at = now()
         WHERE user_id = $1 AND status = 'active'`,
        [userId]
      );

      // criar nova assinatura
      await client.query(
        `INSERT INTO subscriptions (user_id, plan, status, started_at)
         VALUES ($1, $2, 'active', now())`,
        [userId, plan]
      );
    }

    await client.query('COMMIT');

    res.sendStatus(200);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no webhook:', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

module.exports = router;
