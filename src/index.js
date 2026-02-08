require('dotenv').config();

/* =========================
   IMPORTS
========================= */
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');
const crypto = require('crypto');

const app = express();
app.use(express.json());

/* =========================
   DATABASE
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

/* =========================
   MERCADO PAGO
========================= */
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

const PLAN_LIMITS = {
  free: 9999,
  professional: 10,
  highlight: 9999,
};

/* =========================
   JWT LOCAL AUTH
========================= */
function signUserJWT(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function localAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token missing' });

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* =========================
   MOCHA AUTH (JWT + JWKS)
========================= */
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
      req.user = { email: decoded.email, role: 'advertiser' };
      next();
    }
  );
}

/* =========================
   HELPERS
========================= */
async function getOrCreateUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );

  if (rows.length) return rows[0];

  const insert = await pool.query(
    `INSERT INTO users (email, role) VALUES ($1,'advertiser') RETURNING *`,
    [email]
  );
  return insert.rows[0];
}

async function getOrCreateAdvertiser(userId, email) {
  const { rows } = await pool.query(
    `SELECT * FROM advertisers WHERE user_id = $1`,
    [userId]
  );
  if (rows.length) return rows[0];

  const insert = await pool.query(
    `INSERT INTO advertisers (user_id, email) VALUES ($1,$2) RETURNING *`,
    [userId, email]
  );
  return insert.rows[0];
}

async function advertiserCanCreateAds(advertiserId, plan) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM ads WHERE advertiser_id = $1`,
    [advertiserId]
  );
  return Number(rows[0].count) < PLAN_LIMITS[plan];
}

/* =========================
   AUTH — EMAIL / PASSWORD
========================= */
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Missing fields' });

  const hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1,$2)
     RETURNING *`,
    [email, hash]
  );

  res.json({ token: signUserJWT(rows[0]) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );

  if (!rows.length)
    return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid)
    return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signUserJWT(rows[0]) });
});

/* =========================
   ADS — CREATE
========================= */
app.post('/ads', localAuth, async (req, res) => {
  const {
    title, city, state,
    latitude, longitude,
    plan = 'free',
  } = req.body;

  if (!title || !city || latitude == null || longitude == null)
    return res.status(400).json({ error: 'Missing fields' });

  const user = await getOrCreateUserByEmail(req.user.email);
  const advertiser = await getOrCreateAdvertiser(user.id, user.email);

  if (advertiser.blocked)
    return res.status(403).json({ error: 'Account blocked' });

  const { rows: subs } = await pool.query(
    `SELECT * FROM subscriptions
     WHERE advertiser_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [advertiser.id]
  );

  const activePlan = subs.length && subs[0].status === 'active'
    ? subs[0].plan
    : 'free';

  const canCreate = await advertiserCanCreateAds(advertiser.id, activePlan);
  if (!canCreate)
    return res.status(403).json({ error: 'Plan limit reached' });

  const insert = await pool.query(
    `
    INSERT INTO ads (
      advertiser_id, title, city, state,
      latitude, longitude, plan
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [
      advertiser.id, title, city, state,
      latitude, longitude, activePlan,
    ]
  );

  res.status(201).json(insert.rows[0]);
});

/* =========================
   ADS — LIST (RAIO)
========================= */
app.get('/ads', async (req, res) => {
  const { lat, lng, radius = 100 } = req.query;
  if (!lat || !lng)
    return res.status(400).json({ error: 'lat/lng required' });

  const safeRadius = Math.min(Number(radius), 200);

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
    HAVING (
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
      created_at DESC
    `,
    [lat, lng, safeRadius]
  );

  res.json(rows);
});

/* =========================
   WEBHOOK — MERCADO PAGO
========================= */
app.post('/webhooks/mercadopago', async (req, res) => {
  const signature = req.headers['x-signature'];
  if (!signature) return res.sendStatus(401);

  const expected = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) return res.sendStatus(401);

  if (req.body.type !== 'subscription_preapproval') return res.sendStatus(200);

  const { id, status } = req.body.data;

  await pool.query(
    `
    UPDATE subscriptions
    SET status = $1
    WHERE mp_preapproval_id = $2
    `,
    [status, id]
  );

  if (status !== 'active') {
    await pool.query(
      `
      UPDATE advertisers
      SET blocked = true
      WHERE id = (
        SELECT advertiser_id FROM subscriptions
        WHERE mp_preapproval_id = $1
      )
      `,
      [id]
    );
  }

  res.sendStatus(200);
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚗 Carros na Cidade API running on port ${PORT}`);
});
