require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');
const crypto = require('crypto');

const app = express();
app.use(express.json());

/* =====================================================
   DATABASE
===================================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

/* =====================================================
   MERCADO PAGO (SAFE INIT)
===================================================== */
const MP_ENABLED = !!process.env.MP_ACCESS_TOKEN;

if (MP_ENABLED) {
  mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN,
  });
  console.log('💰 Mercado Pago habilitado');
} else {
  console.warn('⚠️ Mercado Pago desabilitado (MP_ACCESS_TOKEN ausente)');
}

const PLAN_PRICES = {
  professional: 49.9,
  highlight: 99.9,
};

const PLAN_DURATION_DAYS = {
  professional: 30,
  highlight: 30,
};

/* =====================================================
   MOCHA AUTH (JWT + JWKS)
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

  const token = auth.split(' ')[1];

  jwt.verify(
    token,
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

/* =====================================================
   MERCADO PAGO — WEBHOOK SIGNATURE VALIDATION
===================================================== */
function isValidMercadoPagoSignature(req) {
  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !requestId || !timestamp) return false;

  const payload = `${timestamp}.${requestId}`;

  const expectedSignature = crypto
    .createHmac('sha256', process.env.MP_ACCESS_TOKEN)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/* =====================================================
   ADS — CREATE
===================================================== */
app.post('/ads', mochaAuth, async (req, res) => {
  try {
    const {
      title, description, price,
      brand, model, year,
      city, state, latitude, longitude,
      plan = 'free',
    } = req.body;

    if (!title || !city || !state || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const advertiserId = await getOrCreateAdvertiser(req.user.email);

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
        advertiserId, title, description, price,
        brand, model, year,
        city, state, latitude, longitude, plan,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ad' });
  }
});

/* =====================================================
   ADS — LIST (RAIO + RANKING)
===================================================== */
app.get('/ads', async (req, res) => {
  try {
    const { lat, lng, radius = 20, page = 1, limit = 20 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    const safeRadius = Math.min(Number(radius), 100);
    const safeLimit = Math.min(Number(limit), 50);
    const offset = (page - 1) * safeLimit;

    const { rows } = await pool.query(
      `
      SELECT *,
        (
          6371 * acos(
            cos(radians($1)) *
            cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) *
            sin(radians(latitude))
          )
        ) AS distance
      FROM ads
      WHERE status = 'active'
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
        CASE plan
          WHEN 'highlight' THEN 1
          WHEN 'professional' THEN 2
          ELSE 3
        END,
        COALESCE(expires_at, created_at) DESC
      LIMIT $4 OFFSET $5
      `,
      [lat, lng, safeRadius, safeLimit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list ads' });
  }
});

/* =====================================================
   ADS — ME
===================================================== */
app.get('/ads/me', mochaAuth, async (req, res) => {
  const advertiserId = await getOrCreateAdvertiser(req.user.email);
  const { rows } = await pool.query(
    `SELECT * FROM ads WHERE advertiser_id = $1 ORDER BY created_at DESC`,
    [advertiserId]
  );
  res.json(rows);
});

/* =====================================================
   PAYMENTS — CHECKOUT
===================================================== */
app.post('/payments/checkout', mochaAuth, async (req, res) => {
  if (!MP_ENABLED) {
    return res.status(503).json({ error: 'Payments temporarily unavailable' });
  }

  try {
    const { adId, plan } = req.body;
    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const advertiserId = await getOrCreateAdvertiser(req.user.email);

    const ad = await pool.query(
      `SELECT id FROM ads WHERE id = $1 AND advertiser_id = $2`,
      [adId, advertiserId]
    );

    if (!ad.rowCount) {
      return res.status(403).json({ error: 'Ad not found' });
    }

    const preference = {
      items: [{
        title: `Plano ${plan} - Carros na Cidade`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: PLAN_PRICES[plan],
      }],
      external_reference: adId,
      notification_url: `${process.env.APP_BASE_URL}/webhooks/mercadopago`,
      auto_return: 'approved',
    };

    const mp = await mercadopago.preferences.create(preference);

    await pool.query(
      `
      INSERT INTO payments (
        ad_id, advertiser_id,
        mp_preference_id, amount, plan
      )
      VALUES ($1,$2,$3,$4,$5)
      `,
      [adId, advertiserId, mp.body.id, PLAN_PRICES[plan], plan]
    );

    res.json({ init_point: mp.body.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

/* =====================================================
   WEBHOOK — MERCADO PAGO (VALIDATED)
===================================================== */
app.post('/webhooks/mercadopago', async (req, res) => {
  if (!MP_ENABLED) return res.sendStatus(200);

  if (!isValidMercadoPagoSignature(req)) {
    console.warn('🚫 Webhook MP inválido');
    return res.sendStatus(401);
  }

  try {
    if (req.body.type !== 'payment') return res.sendStatus(200);

    const paymentId = req.body.data?.id;
    if (!paymentId) return res.sendStatus(200);

    const mpPayment = await mercadopago.payment.findById(paymentId);
    if (mpPayment.body.status !== 'approved') return res.sendStatus(200);

    const adId = mpPayment.body.external_reference;

    const payment = await pool.query(
      `SELECT * FROM payments WHERE ad_id = $1 AND status = 'pending'`,
      [adId]
    );

    if (!payment.rowCount) return res.sendStatus(200);

    const plan = payment.rows[0].plan;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PLAN_DURATION_DAYS[plan]);

    await pool.query('BEGIN');

    await pool.query(
      `
      UPDATE payments
      SET status = 'approved',
          mp_payment_id = $1,
          paid_at = NOW()
      WHERE id = $2
      `,
      [mpPayment.body.id, payment.rows[0].id]
    );

    await pool.query(
      `
      UPDATE ads
      SET plan = $1,
          expires_at = $2
      WHERE id = $3
      `,
      [plan, expiresAt, adId]
    );

    await pool.query('COMMIT');

    console.log(`✅ Pagamento aprovado — anúncio ${adId}`);
    res.sendStatus(200);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Webhook MP error:', err);
    res.sendStatus(500);
  }
});

/* =====================================================
   JOB — EXPIRE ADS
===================================================== */
setInterval(async () => {
  try {
    const result = await pool.query(
      `
      UPDATE ads
      SET plan = 'free',
          expires_at = NULL
      WHERE expires_at IS NOT NULL
        AND expires_at < NOW()
      `
    );

    if (result.rowCount > 0) {
      console.log(`⏳ ${result.rowCount} anúncios expirados`);
    }
  } catch (err) {
    console.error('Expire job failed', err);
  }
}, 10 * 60 * 1000);

/* =====================================================
   SERVER
===================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 Carros na Cidade API running on port ${PORT}`);
});
