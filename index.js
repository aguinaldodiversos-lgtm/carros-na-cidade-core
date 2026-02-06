require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

/* =====================================================
   AUTH
===================================================== */
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
}

/* =====================================================
   ADMIN METRICS
===================================================== */
app.get('/admin/metrics', auth, adminOnly, async (req, res) => {
  const users = await pool.query('SELECT COUNT(*) FROM users');
  const ads = await pool.query('SELECT COUNT(*) FROM ads');
  const activeSubs = await pool.query(
    `SELECT COUNT(*) FROM subscriptions WHERE status='active'`
  );
  const revenue = await pool.query(`
    SELECT COALESCE(SUM(p.price),0)
    FROM subscriptions s
    JOIN plans p ON p.id=s.plan_id
    WHERE s.status='active'
  `);

  res.json({
    users: users.rows[0].count,
    ads: ads.rows[0].count,
    active_subscriptions: activeSubs.rows[0].count,
    mrr: revenue.rows[0].sum
  });
});

/* =====================================================
   ADMIN LISTS
===================================================== */
app.get('/admin/users', auth, adminOnly, async (_, res) => {
  const r = await pool.query('SELECT id,email,created_at FROM users');
  res.json(r.rows);
});

app.get('/admin/ads', auth, adminOnly, async (_, res) => {
  const r = await pool.query(`
    SELECT a.*, u.email
    FROM ads a JOIN users u ON u.id=a.user_id
  `);
  res.json(r.rows);
});

app.get('/admin/subscriptions', auth, adminOnly, async (_, res) => {
  const r = await pool.query(`
    SELECT s.*, u.email, p.name
    FROM subscriptions s
    JOIN users u ON u.id=s.user_id
    JOIN plans p ON p.id=s.plan_id
  `);
  res.json(r.rows);
});

/* =====================================================
   ADMIN ACTIONS
===================================================== */
app.post('/admin/subscription/cancel', auth, adminOnly, async (req, res) => {
  const { subscription_id } = req.body;

  await mercadopago.preapproval.cancel(subscription_id);
  await pool.query(
    `UPDATE subscriptions SET status='cancelled' WHERE mp_subscription_id=$1`,
    [subscription_id]
  );

  res.json({ cancelled: true });
});

app.post('/admin/subscription/change-plan', auth, adminOnly, async (req, res) => {
  const { subscription_id, new_plan_id } = req.body;

  await pool.query(`
    UPDATE subscriptions
    SET plan_id=$1
    WHERE mp_subscription_id=$2
  `, [new_plan_id, subscription_id]);

  res.json({ updated: true });
});

/* =====================================================
   SUBSCRIBE (SPLIT PAYMENT)
===================================================== */
app.post('/subscriptions', auth, async (req, res) => {
  const { plan_id } = req.body;
  const plan = await pool.query('SELECT * FROM plans WHERE id=$1', [plan_id]);

  const mpSub = await mercadopago.preapproval.create({
    preapproval_plan_id: plan.rows[0].mp_preapproval_plan_id,
    payer_email: req.user.email,
    back_url: process.env.APP_BASE_URL,
    marketplace_fee: Number(process.env.MP_MARKETPLACE_FEE)
  });

  await pool.query(`
    INSERT INTO subscriptions
    (user_id, plan_id, status, mp_subscription_id)
    VALUES ($1,$2,'trial',$3)
  `, [req.user.id, plan_id, mpSub.body.id]);

  res.json({ init_point: mpSub.body.init_point });
});

/* =====================================================
   WEBHOOK MP (SUBSCRIPTIONS)
===================================================== */
app.post('/webhook/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (!type || !data?.id) {
      return res.sendStatus(200);
    }

    // 🔐 Confirma com o Mercado Pago (NUNCA confie só no payload)
    const payment = await mercadopago.payment.findById(data.id);

    if (!payment || !payment.body) {
      return res.sendStatus(200);
    }

    // Apenas pagamentos aprovados
    if (payment.body.status !== 'approved') {
      return res.sendStatus(200);
    }

    const externalRef = payment.body.external_reference;
    if (!externalRef) {
      return res.sendStatus(200);
    }

    // Atualiza pagamento no banco
    await pool.query(`
      UPDATE payments
      SET status='approved',
          mp_payment_id=$1,
          paid_at=NOW()
      WHERE ad_id=$2
    `, [payment.body.id, externalRef]);

    // Aqui você pode:
    // - ativar plano
    // - estender assinatura
    // - renovar validade
    // - liberar anúncios

    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook MP error:', err);
    return res.sendStatus(500);
  }
});

/* =====================================================
   SERVER
===================================================== */
app.listen(3000, () => {
  console.log('🚗 Carros na Cidade API — ADMIN + SPLIT READY');
});
