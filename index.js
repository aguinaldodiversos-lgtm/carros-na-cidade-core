require('dotenv').config();

/* =====================================================
   IMPORTS
===================================================== */
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const bcrypt = require('bcrypt');
const mercadopago = require('mercadopago');
const geoip = require('geoip-lite');
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
   MERCADO PAGO
===================================================== */
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

const PLAN_LIMITS = {
  free: Infinity,
  professional: 10,
  highlight: Infinity,
};

const PLAN_PRIORITY = {
  highlight: 3,
  professional: 2,
  free: 1,
};

/* =====================================================
   AUTH — JWT EMAIL/SENHA
===================================================== */
function authJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    res.sendStatus(401);
  }
}

/* =====================================================
   AUTH — MOCHA (JWKS)
===================================================== */
const jwksClient = jwksRsa({
  jwksUri: process.env.MOCHA_JWKS_URI,
  cache: true,
  rateLimit: true,
});

function getKey(header, cb) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    cb(err, key?.getPublicKey());
  });
}

function mochaAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);

  jwt.verify(
    auth.split(' ')[1],
    getKey,
    {
      audience: process.env.MOCHA_AUDIENCE,
      issuer: process.env.MOCHA_ISSUER,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err || !decoded.email) return res.sendStatus(401);
      req.user = { email: decoded.email };
      next();
    }
  );
}

/* =====================================================
   HELPERS
===================================================== */
async function getSearchRadius(client, cityId = null) {
  if (cityId) {
    const r = await client.query(
      `SELECT search_radius_km FROM city_settings WHERE city_id=$1`,
      [cityId]
    );
    if (r.rows.length) return Number(r.rows[0].search_radius_km);
  }

  const global = await client.query(
    `SELECT value FROM system_settings WHERE key='default_search_radius_km'`
  );
  const max = await client.query(
    `SELECT value FROM system_settings WHERE key='max_search_radius_km'`
  );

  return Math.min(Number(global.rows[0].value), Number(max.rows[0].value));
}

function getLocationFromIP(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress;

  const geo = geoip.lookup(ip);
  if (!geo) return null;

  return { lat: geo.ll[0], lng: geo.ll[1] };
}

/* =====================================================
   ADS — CREATE (BLOQUEIO POR ASSINATURA)
===================================================== */
app.post('/ads', authJWT, async (req, res) => {
  const client = await pool.connect();
  try {
    const user = await client.query(
      `SELECT plan, subscription_status FROM users WHERE id=$1`,
      [req.user.id]
    );

    if (user.rows[0].subscription_status === 'cancelled') {
      return res.status(403).json({ error: 'Assinatura cancelada' });
    }

    const count = await client.query(
      `SELECT COUNT(*) FROM ads WHERE user_id=$1`,
      [req.user.id]
    );

    if (count.rows[0].count >= PLAN_LIMITS[user.rows[0].plan]) {
      return res.status(403).json({ error: 'Limite de anúncios atingido' });
    }

    const ad = await client.query(
      `
      INSERT INTO ads (user_id,title,city,latitude,longitude,plan_priority)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        req.user.id,
        req.body.title,
        req.body.city,
        req.body.latitude,
        req.body.longitude,
        PLAN_PRIORITY[user.rows[0].plan],
      ]
    );

    res.json(ad.rows[0]);
  } finally {
    client.release();
  }
});

/* =====================================================
   ADS — LIST (GPS + IP + CIDADES)
===================================================== */
app.get('/ads', async (req, res) => {
  const client = await pool.connect();
  try {
    let { lat, lng } = req.query;
    if (!lat || !lng) {
      const ipLoc = getLocationFromIP(req);
      if (!ipLoc) return res.status(400).json({ error: 'Localização indisponível' });
      lat = ipLoc.lat;
      lng = ipLoc.lng;
    }

    const radius = await getSearchRadius(client);

    const ads = await client.query(
      `
      SELECT *,
      (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude)-radians($2)) +
          sin(radians($1))*sin(radians(latitude))
        )
      ) AS distance
      FROM ads
      WHERE status='active'
      HAVING distance <= $3
      ORDER BY plan_priority DESC, distance ASC
      `,
      [lat, lng, radius]
    );

    res.json({ radius_km: radius, ads: ads.rows });
  } finally {
    client.release();
  }
});

/* =====================================================
   SEO — CIDADES
===================================================== */
app.get('/cidades/:slug', async (req, res) => {
  const client = await pool.connect();
  try {
    const city = await client.query(
      `SELECT * FROM cities WHERE slug=$1`,
      [req.params.slug]
    );
    if (!city.rows.length) return res.sendStatus(404);

    const c = city.rows[0];
    const radius = await getSearchRadius(client, c.id);

    const ads = await client.query(
      `
      SELECT *,
      (
        6371 * acos(
          cos(radians($1)) *
          cos(radians(latitude)) *
          cos(radians(longitude)-radians($2)) +
          sin(radians($1))*sin(radians(latitude))
        )
      ) AS distance
      FROM ads
      WHERE status='active'
      HAVING distance <= $3
      ORDER BY plan_priority DESC, distance ASC
      `,
      [c.latitude, c.longitude, radius]
    );

    res.json({ city: c, radius_km: radius, ads: ads.rows });
  } finally {
    client.release();
  }
});

/* =====================================================
   WEBHOOK — MERCADO PAGO (VALIDADO)
===================================================== */
app.post('/webhooks/mercadopago', async (req, res) => {
  const signature = req.headers['x-signature'];
  const raw = JSON.stringify(req.body);

  const expected = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');

  if (signature !== expected) return res.sendStatus(401);

  if (req.body.type === 'subscription') {
    const { status, external_reference } = req.body.data;
    await pool.query(
      `UPDATE users SET subscription_status=$1 WHERE id=$2`,
      [status, external_reference]
    );
  }

  res.sendStatus(200);
});

/* =====================================================
   JOB — DOWNGRADE AUTOMÁTICO
===================================================== */
setInterval(async () => {
  await pool.query(
    `
    UPDATE users
    SET plan='free'
    WHERE subscription_status!='authorized'
    `
  );
}, 10 * 60 * 1000);

/* =====================================================
   SERVER
===================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚗 API Carros na Cidade rodando na porta ${PORT}`);
});
