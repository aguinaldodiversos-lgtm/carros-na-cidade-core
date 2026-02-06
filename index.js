require('dotenv').config();

/* =====================================================
   CORE IMPORTS
===================================================== */
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');

/* =====================================================
   APP SETUP
===================================================== */
const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
  })
);

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

const PLAN_PRIORITY = {
  highlight: 1,
  professional: 2,
  free: 3,
};

const GRACE_DAYS = 3;

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
   LOCAL AUTH (EMAIL + PASSWORD)
===================================================== */
function localAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* =====================================================
   HELPERS
===================================================== */
async function getOrCreateUser(email, passwordHash = null) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );

  if (rows.length) return rows[0];

  const insert = await pool.query(
    `
    INSERT INTO users (email, password_hash)
    VALUES ($1,$2)
    RETURNING *
    `,
    [email, passwordHash]
  );

  return insert.rows[0];
}

async function getAdminConfig() {
  const { rows } = await pool.query(
    `SELECT key, value FROM admin_settings`
  );
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/* =====================================================
   AUTH — REGISTER / LOGIN
===================================================== */
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Invalid data' });

  const hash = await bcrypt.hash(password, 10);
  const user = await getOrCreateUser(email, hash);

  const token = jwt.sign(
    { id: user.id, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({ token });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );

  if (!rows.length) return res.status(401).json({ error: 'Invalid login' });

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid login' });

  const token = jwt.sign(
    { id: rows[0].id, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({ token });
});

/* =====================================================
   ADS — CREATE (LIMIT + BLOCK)
===================================================== */
app.post('/ads', localAuth, async (req, res) => {
  const userId = req.user.id;

  const sub = await pool.query(
    `SELECT status, plan FROM subscriptions WHERE user_id = $1`,
    [userId]
  );

  if (
    sub.rowCount &&
    ['cancelled', 'paused'].includes(sub.rows[0].status)
  ) {
    return res
      .status(403)
      .json({ error: 'Subscription inactive' });
  }

  const plan = sub.rows[0]?.plan || 'free';

  const count = await pool.query(
    `SELECT COUNT(*) FROM ads WHERE user_id = $1`,
    [userId]
  );

  if (count.rows[0].count >= PLAN_LIMITS[plan]) {
    return res
      .status(403)
      .json({ error: 'Plan limit reached' });
  }

  const {
    title,
    price,
    city_id,
    latitude,
    longitude,
  } = req.body;

  const { rows } = await pool.query(
    `
    INSERT INTO ads (user_id,title,price,city_id,latitude,longitude,plan)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [userId, title, price, city_id, latitude, longitude, plan]
  );

  res.status(201).json(rows[0]);
});

/* =====================================================
   ADS — LIST (CITY + RADIUS)
===================================================== */
app.get('/ads', async (req, res) => {
  const { city_id, lat, lng } = req.query;

  const admin = await getAdminConfig();
  const radius = Number(admin.max_radius_km || 100);

  const { rows } = await pool.query(
    `
    SELECT a.*,
      (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(a.latitude)) *
          cos(radians(a.longitude) - radians($2)) +
          sin(radians($1)) *
          sin(radians(a.latitude))
        )
      ) AS distance
    FROM ads a
    WHERE a.status = 'active'
    AND (
      6371 * acos(
        cos(radians($1)) *
        cos(radians(a.latitude)) *
        cos(radians(a.longitude) - radians($2)) +
        sin(radians($1)) *
        sin(radians(a.latitude))
      )
    ) <= $3
    ORDER BY
      CASE a.plan
        WHEN 'highlight' THEN 1
        WHEN 'professional' THEN 2
        ELSE 3
      END,
      a.created_at DESC
    `,
    [lat, lng, radius]
  );

  res.json(rows);
});

/* =====================================================
   SUBSCRIPTIONS — WEBHOOK (VALIDATED)
===================================================== */
app.post('/webhooks/mercadopago', async (req, res) => {
  if (req.body.type !== 'subscription_preapproval') {
    return res.sendStatus(200);
  }

  const mpSub = await mercadopago.preapproval.findById(
    req.body.data.id
  );

  const { status, external_reference } = mpSub.body;

  await pool.query(
    `
    UPDATE subscriptions
    SET status = $1,
        updated_at = NOW()
    WHERE id = $2
    `,
    [status, external_reference]
  );

  res.sendStatus(200);
});

/* =====================================================
   ADMIN — SETTINGS
===================================================== */
app.put('/admin/settings', mochaAuth, async (req, res) => {
  for (const key in req.body) {
    await pool.query(
      `
      INSERT INTO admin_settings (key,value)
      VALUES ($1,$2)
      ON CONFLICT (key)
      DO UPDATE SET value = $2
      `,
      [key, req.body[key]]
    );
  }
  res.json({ success: true });
});

/* =====================================================
   SERVER
===================================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚗 Carros na Cidade API running on port ${PORT}`);
});
