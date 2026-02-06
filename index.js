require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');

const app = express();

/* =====================================================
   RAW BODY (WEBHOOK)
===================================================== */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
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
  jwksUri: process.env.MOCHA_JWKS_URI,
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

  const token = auth.split(' ')[1];

  jwt.verify(
    token,
    getKey,
    {
      audience: process.env.MOCHA_AUDIENCE,
      issuer: process.env.MOCHA_ISSUER,
      algorithms: ['RS256']
    },
    (err, decoded) => {
      if (err || !decoded.email) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = decoded;
      next();
    }
  );
}

/* =====================================================
   ADMIN AUTH
===================================================== */
function adminAuth(req, res, next) {
  if (!req.user?.roles?.includes('admin')) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

/* =====================================================
   HEALTH CHECK (RENDER / BROWSER)
===================================================== */
app.get('/webhook/mercadopago', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'mercado-pago-webhook'
  });
});

/* =====================================================
   HELPERS
===================================================== */
async function getOrCreateAdvertiser(email) {
  const { rows } = await pool.query(
    'SELECT id FROM advertisers WHERE email = $1',
    [email]
  );
  if (rows.length) return rows[0].id;

  const insert = await pool.query(
    'INSERT INTO advertisers (email) VALUES ($1) RETURNING id',
    [email]
  );
  return insert.rows[0].id;
}

/* =====================================================
   SUBSCRIPTION MIDDLEWARE
===================================================== */
async function loadSubscription(req, res, next) {
  const advertiserId = await getOrCreateAdvertiser(req.user.email);

  const sub = await pool.query(
    `
    SELECT s.*, p.code AS plan_code, p.ad_limit, p.ranking_weight
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.advertiser_id = $1
      AND s.status IN ('trial','active')
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [advertiserId]
  );

  req.advertiserId = advertiserId;
  req.subscription = sub.rows[0] || null;
  next();
}

async function checkAdLimit(req, res, next) {
  if (!req.subscription) return next();
  if (req.subscription.ad_limit === null) return next();

  const count = await pool.query(
    'SELECT COUNT(*) FROM ads WHERE advertiser_id = $1',
    [req.advertiserId]
  );

  if (Number(count.rows[0].count) >= req.subscription.ad_limit) {
    return res.status(403).json({
      error: 'ad_limit_reached',
      upsell: true
    });
  }
  next();
}

/* =====================================================
   ADS — CREATE
===================================================== */
app.post(
  '/ads',
  mochaAuth,
  loadSubscription,
  checkAdLimit,
  async (req, res) => {
    const {
      title, description, price,
      brand, model, year,
      city, state, latitude, longitude
    } = req.body;

    if (!title || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const planCode = req.subscription?.plan_code || 'free';
    const subscriptionId = req.subscription?.id || null;

    const { rows } = await pool.query(
      `
      INSERT INTO ads (
        advertiser_id, subscription_id,
        title, description, price,
        brand, model, year,
        city, state, latitude, longitude, plan
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
      `,
      [
        req.advertiserId, subscriptionId,
        title, description, price,
        brand, model, year,
        city, state, latitude, longitude, planCode
      ]
    );

    res.status(201).json(rows[0]);
  }
);

/* =====================================================
   SUBSCRIPTIONS — START
===================================================== */
app.post('/subscriptions/start', mochaAuth, loadSubscription, async (req, res) => {
  const { planCode } = req.body;

  const plan = await pool.query(
    'SELECT * FROM plans WHERE code = $1 AND active = true',
    [planCode]
  );
  if (!plan.rowCount) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const preference = {
    reason: `Plano ${plan.rows[0].name} - Carros na Cidade`,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: Number(plan.rows[0].price),
      currency_id: 'BRL'
    },
    back_url: `${process.env.APP_BASE_URL}/dashboard`,
    external_reference: `${req.advertiserId}:${planCode}`,
    payer_email: req.user.email
  };

  const mp = await mercadopago.preapproval.create(preference);

  await pool.query(
    `
    INSERT INTO subscriptions (
      advertiser_id,
      plan_id,
      status,
      mp_preapproval_id,
      started_at
    )
    VALUES ($1,$2,'trial',$3,NOW())
    `,
    [req.advertiserId, plan.rows[0].id, mp.body.id]
  );

  res.json({ init_point: mp.body.init_point });
});

/* =====================================================
   WEBHOOK — MERCADO PAGO (POST OFICIAL)
===================================================== */
app.post('/webhook/mercadopago', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!signature || !requestId) return res.sendStatus(401);

    const payload = `${requestId}.${req.rawBody}`;
    const expected = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (expected !== signature) return res.sendStatus(401);

    if (req.body.type === 'preapproval') {
      const preapprovalId = req.body.data.id;
      const mpSub = await mercadopago.preapproval.get(preapprovalId);

      const statusMap = {
        authorized: 'active',
        paused: 'paused',
        cancelled: 'cancelled'
      };

      const newStatus = statusMap[mpSub.body.status];
      if (newStatus) {
        await pool.query(
          `
          UPDATE subscriptions
          SET status = $1
          WHERE mp_preapproval_id = $2
          `,
          [newStatus, preapprovalId]
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

/* =====================================================
   SERVER
===================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 Carros na Cidade API running on port ${PORT}`);
});
