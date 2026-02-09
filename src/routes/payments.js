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
   CRIAR CHECKOUT DE ASSINATURA
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
        type: 'subscription',
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
   COMPRAR DESTAQUE PARA ANÚNCIO
===================================================== */
router.post('/highlight', auth, async (req, res) => {
  try {
    const { ad_id } = req.body;
    const userId = req.user.user_id;

    if (!ad_id) {
      return res.status(400).json({ error: 'ad_id obrigatório' });
    }

    // verificar se o anúncio pertence ao usuário
    const adResult = await pool.query(
      `
      SELECT a.id
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      JOIN users u ON u.email = adv.email
      WHERE a.id = $1
      AND u.id = $2
      `,
      [ad_id, userId]
    );

    if (adResult.rows.length === 0) {
      return res.status(403).json({
        error: 'Anúncio não encontrado ou não pertence ao usuário'
      });
    }

    const preference = {
      items: [
        {
          title: 'Destaque Premium (15 dias)',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: PLAN_PRICE.highlight,
        },
      ],
      external_reference: JSON.stringify({
        type: 'highlight',
        ad_id: ad_id,
        user_id: userId,
      }),
      notification_url: `${process.env.APP_BASE_URL}/payments/webhook`,
    };

    const mp = await mercadopago.preferences.create(preference);

    res.json({ init_point: mp.body.init_point });
  } catch (err) {
    console.error('Erro ao criar destaque:', err);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

/* =====================================================
   WEBHOOK MERCADO PAGO (ROBUSTO E IDÊMPOTENTE)
===================================================== */
router.post('/webhook', async (req, res) => {
  const client = await pool.connect();

  try {
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

    await client.query('BEGIN');

    /* ===============================
       SALVAR PAGAMENTO (IDÊMPOTENTE)
    =============================== */
    await client.query(
      `INSERT INTO payments
       (user_id, mp_payment_id, status, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (mp_payment_id) DO UPDATE
       SET status = EXCLUDED.status`,
      [ref.user_id, mpPaymentId, status, amount]
    );

    /* ===============================
       TRATAMENTO POR TIPO
    =============================== */
    if (status === 'approved') {
      // destaque pago
      if (ref.type === 'highlight' && ref.ad_id) {
        await client.query(
          `
          UPDATE ads
          SET highlight_until = NOW() + INTERVAL '15 days'
          WHERE id = $1
          `,
          [ref.ad_id]
        );
      }

      // assinatura
      if (ref.type === 'subscription' && ref.plan) {
        // cancelar antigas
        await client.query(
          `UPDATE subscriptions
           SET status = 'canceled', expires_at = now()
           WHERE user_id = $1 AND status = 'active'`,
          [ref.user_id]
        );

        // criar nova
        await client.query(
          `INSERT INTO subscriptions (user_id, plan, status, started_at)
           VALUES ($1, $2, 'active', now())`,
          [ref.user_id, ref.plan]
        );
      }
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
