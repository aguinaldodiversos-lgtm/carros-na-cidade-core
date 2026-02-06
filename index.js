require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');

const app = express();

/* =====================================================
   RAW BODY (WEBHOOK MP)
===================================================== */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    }
  })
);

/* =====================================================
   DATABASE
===================================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

/* =====================================================
   MERCADO PAGO
===================================================== */
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

/* =====================================================
   MOCHA AUTH
===================================================== */
const jwksClient = jwksRsa({
  jwksUri: process.env.MOCHA_JWKS_URL,
  cache: true,
  rateLimit: true
});

function getKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function mochaAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(
    auth.split(' ')[1],
    getKey,
    {
      audience: process.env.MOCHA_AUDIENCE,
      issuer: process.env.MOCHA_ISSUER,
      algorithms: ['RS256']
    },
    (err, decoded) => {
      if (err || !decoded?.email) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = decoded;
      next();
    }
  );
}

/* =====================================================
   HELPERS
===================================================== */
async function getOrCreateAdvertiser(email) {
  const { rows } = await pool.query(
    'SELECT id FROM advertisers WHERE email=$1',
    [email]
  );
  if (rows.length) return rows[0].id;

  const r = await pool.query(
    'INSERT INTO advertisers (email) VALUES ($1) RETURNING id',
    [email]
  );
  return r.rows[0].id;
}

/* =====================================================
   ADS — CREATE
===================================================== */
app.post('/ads', mochaAuth, async (req, res) => {
  const advertiserId = await getOrCreateAdvertiser(req.user.email);
  const { title, latitude, longitude } = req.body;

  if (!title || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { rows } = await pool.query(
    `
    INSERT INTO ads (advertiser_id, title, latitude, longitude)
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
    [advertiserId, title, latitude, longitude]
  );

  res.status(201).json(rows[0]);
});

/* =====================================================
   SUBSCRIPTIONS — START
===================================================== */
app.post('/subscriptions/start', mochaAuth, async (req, res) => {
  const { planCode } = req.body;
  const advertiserId = await getOrCreateAdvertiser(req.user.email);

  const plan = await pool.query(
    'SELECT * FROM plans WHERE code=$1 AND active=true',
    [planCode]
  );
  if (!plan.rowCount) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const mp = await mercadopago.preapproval.create({
    reason: plan.rows[0].name,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: Number(plan.rows[0].price),
      currency_id: 'BRL'
    },
    back_url: `${process.env.APP_BASE_URL}/dashboard`,
    external_reference: `${advertiserId}:${planCode}`,
    payer_email: req.user.email
  });

  await pool.query(
    `
    INSERT INTO subscriptions
    (advertiser_id, plan_id, status, mp_preapproval_id)
    VALUES ($1,$2,'trial',$3)
    `,
    [advertiserId, plan.rows[0].id, mp.body.id]
  );

  res.json({ init_point: mp.body.init_point });
});

/* =====================================================
   WEBHOOK — MERCADO PAGO (ACEITA TUDO)
===================================================== */
app.all(
  ['/webhook/mercadopago', '/webhooks/mercadopago'],
  async (req, res) => {
    try {
      const signature = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];

      // 🔐 Só valida assinatura se existir
      if (signature && requestId) {
        const expected = crypto
          .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
          .update(`${requestId}.${req.rawBody}`)
          .digest('hex');

        if (expected !== signature) {
          return res.sendStatus(401);
        }
      }

      if (req.body?.type === 'preapproval') {
        await pool.query(
          `
          UPDATE subscriptions
          SET status=$1
          WHERE mp_preapproval_id=$2
          `,
          [req.body.data.status, req.body.data.id]
        );
      }

      if (req.body?.type === 'payment') {
        const payment = await mercadopago.payment.get(req.body.data.id);
        console.log('Pagamento:', payment.body.status);
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error('Erro webhook MP:', err);
      return res.sendStatus(500);
    }
  }
);

/* =====================================================
   SERVER
===================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 Carros na Cidade API rodando na porta ${PORT}`);
});
