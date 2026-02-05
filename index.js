require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');

const app = express();

/* =====================================================
   BODY PARSERS
===================================================== */
app.use('/webhooks/mercadopago', express.raw({ type: '*/*' }));
app.use(express.json());

/* =====================================================
   DATABASE
===================================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

/* =====================================================
   MERCADO PAGO
===================================================== */
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

/* =====================================================
   CONSTANTS
===================================================== */
const PLAN_LIMITS = {
  free: Infinity,
  professional: 10,
  highlight: Infinity,
};

const UPSELL_HINTS = {
  professional: 'highlight',
};

/* =====================================================
   MOCHA AUTH
===================================================== */
const jwksClient = jwksRsa({
  jwksUri: process.env.MOCHA_JWKS_URI,
  cache: true,
  rateLimit: true,
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
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err || !decoded.email) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = { email: decoded.email };
      next();
    }
  );
}

/* =====================================================
   HELPERS
===================================================== */
async function getOrCreateAdvertiser(email) {
  const { rows } = await pool.query(
    `SELECT id FROM advertisers WHERE email = $1`,
    [email]
  );
  if (rows.length) return rows[0].id;

  const insert = await pool.query(
    `INSERT INTO advertisers (email) VALUES ($1) RETURNING id`,
    [email]
  );
  return insert.rows[0].id;
}

async function getSubscription(advertiserId) {
  const { rows } = await pool.query(
    `
    SELECT s.status, p.name AS plan
    FROM subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.advertiser_id = $1
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [advertiserId]
  );
  return rows.length ? rows[0] : null;
}

/* =====================================================
   ADS — CREATE (COM BLOQUEIO + UPSELL)
===================================================== */
app.post('/ads', mochaAuth, async (req, res) => {
  try {
    const advertiserId = await getOrCreateAdvertiser(req.user.email);
    const subscription = await getSubscription(advertiserId);

    if (
      subscription &&
      ['cancelled', 'paused'].includes(subscription.status)
    ) {
      return res.status(403).json({
        error: 'Assinatura inativa',
        cta: 'Reative sua assinatura para publicar anúncios',
      });
    }

    const effectivePlan = subscription?.plan || 'free';

    const { rows: count } = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads
      WHERE advertiser_id = $1
        AND status = 'active'
      `,
      [advertiserId]
    );

    if (count[0].total >= PLAN_LIMITS[effectivePlan]) {
      return res.status(403).json({
        error: 'Limite de anúncios atingido',
        current_plan: effectivePlan,
        suggested_upgrade: UPSELL_HINTS[effectivePlan] || null,
        cta: 'Faça upgrade para continuar publicando',
      });
    }

    const {
      title,
      description,
      price,
      brand,
      model,
      year,
      city,
      state,
      latitude,
      longitude,
    } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO ads (
        advertiser_id, title, description, price,
        brand, model, year,
        city, state, latitude, longitude, plan
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        advertiserId,
        title,
        description,
        price,
        brand,
        model,
        year,
        city,
        state,
        latitude,
        longitude,
        effectivePlan,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ad' });
  }
});

/* =====================================================
   ADS — LIST (RANKING POR ASSINATURA)
===================================================== */
app.get('/ads', async (req, res) => {
  try {
    const { lat, lng, radius = 20 } = req.query;
    const safeRadius = Math.min(Number(radius), 100);

    const { rows } = await pool.query(
      `
      SELECT a.*,
      (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(latitude))
        )
      ) AS distance
      FROM ads a
      LEFT JOIN subscriptions s ON s.advertiser_id = a.advertiser_id
      WHERE a.status = 'active'
      AND (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(latitude))
        )
      ) <= $3
      ORDER BY
        CASE
          WHEN s.status = 'authorized' AND a.plan = 'highlight' THEN 1
          WHEN s.status = 'authorized' AND a.plan = 'professional' THEN 2
          ELSE 3
        END,
        a.created_at DESC
      `,
      [lat, lng, safeRadius]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list ads' });
  }
});

/* =====================================================
   SUBSCRIPTIONS — CANCEL
===================================================== */
app.post('/subscriptions/cancel', mochaAuth, async (req, res) => {
  try {
    const advertiserId = await getOrCreateAdvertiser(req.user.email);

    const { rows } = await pool.query(
      `
      SELECT mp_subscription_id
      FROM subscriptions
      WHERE advertiser_id = $1 AND status = 'authorized'
      `,
      [advertiserId]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    await mercadopago.preapproval.update(rows[0].mp_subscription_id, {
      status: 'cancelled',
    });

    await pool.query(
      `
      UPDATE subscriptions
      SET status = 'cancelled', updated_at = NOW()
      WHERE advertiser_id = $1
      `,
      [advertiserId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Cancel failed' });
  }
});

/* =====================================================
   DASHBOARD — FINANCE
===================================================== */
app.get('/dashboard/finance', mochaAuth, async (req, res) => {
  try {
    const advertiserId = await getOrCreateAdvertiser(req.user.email);

    const subscription = await getSubscription(advertiserId);

    const payments = await pool.query(
      `
      SELECT amount, status, paid_at
      FROM payments
      WHERE advertiser_id = $1
      ORDER BY created_at DESC
      `,
      [advertiserId]
    );

    res.json({
      subscription,
      payments: payments.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard failed' });
  }
});

/* =====================================================
   WEBHOOK — MERCADO PAGO (VALIDADO)
===================================================== */
app.post('/webhooks/mercadopago', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    const expected = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(requestId + req.body.toString())
      .digest('hex');

    if (signature !== expected) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString());

    if (payload.type === 'preapproval') {
      const sub = await mercadopago.preapproval.get(payload.data.id);

      await pool.query(
        `
        UPDATE subscriptions
        SET status = $1, updated_at = NOW()
        WHERE mp_subscription_id = $2
        `,
        [sub.body.status, sub.body.id]
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error', err);
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
