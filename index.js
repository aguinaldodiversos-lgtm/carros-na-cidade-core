require("dotenv").config(); // ✅ sempre no topo

/* =========================
   IMPORTS
========================= */
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

/* =========================
   MOCHA AUTH (MIDDLEWARE)
========================= */
const mochaClient = jwksClient({
  jwksUri: process.env.MOCHA_JWKS_URL,
  cache: true,
  rateLimit: true
});

function getKey(header, callback) {
  mochaClient.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

function mochaAuth(required = true) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (!required) return next();
      return res.status(401).json({ error: "Token não informado" });
    }

    const token = authHeader.replace("Bearer ", "");

    jwt.verify(
      token,
      getKey,
      {
        issuer: process.env.MOCHA_ISSUER,
        audience: process.env.MOCHA_AUDIENCE
      },
      (err, decoded) => {
        if (err) {
          return res.status(401).json({ error: "Token inválido" });
        }

        req.user = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role || "user"
        };

        next();
      }
    );
  };
}

/* =========================
   APP
========================= */
const app = express();
app.use(express.json());

/* =========================
   CONFIGURAÇÕES GERAIS
========================= */
const HIGHLIGHT_DAYS = 15;
const MAX_RADIUS_KM = 100;

/* =========================
   PLANOS DE ANÚNCIO
========================= */
const AD_PLANS = {
  free: { name: "Gratuito", priority: 1, limit: "unlimited" },
  professional: { name: "Plano Profissional", priority: 2, limit: 10 },
  professional_plus: { name: "Plano Profissional Plus", priority: 2, limit: "unlimited" },
  highlight: { name: "Destaque Avulso", priority: 3, durationDays: HIGHLIGHT_DAYS }
};

/* =========================
   DATABASE
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   INIT DATABASE
========================= */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      latitude NUMERIC,
      longitude NUMERIC
    );

    CREATE TABLE IF NOT EXISTS advertisers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL,
      mp_subscription_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      advertiser_id INTEGER REFERENCES advertisers(id),
      title TEXT,
      price NUMERIC,
      city_id INTEGER,
      latitude NUMERIC,
      longitude NUMERIC,
      radius_km INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 1,
      highlight_until TIMESTAMP,
      status TEXT CHECK (status IN ('active','reserved','sold')) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fipe_cache (
      id SERIAL PRIMARY KEY,
      hash TEXT UNIQUE,
      response JSONB,
      valid_until DATE
    );
  `);

  console.log("Banco inicializado");
}
initDB();

/* =========================
   HEALTH
========================= */
app.get("/", (req, res) => {
  res.send("Carros na Cidade API OK");
});

/* =========================
   CRIAÇÃO DE ANÚNCIO (PROTEGIDO)
========================= */
app.post("/ads", mochaAuth(true), async (req, res) => {
  try {
    const {
      title,
      price,
      city_id,
      latitude,
      longitude,
      radius_km = 0,
      plan = "free"
    } = req.body;

    if (radius_km > MAX_RADIUS_KM) {
      return res.status(400).json({ error: "Raio máximo permitido: 100km" });
    }

    const adPlan = AD_PLANS[plan] || AD_PLANS.free;

    // ✅ fonte da verdade: EMAIL do Mocha
    const advertiserEmail = req.user.email;

    // cria ou recupera anunciante
    const advertiserResult = await pool.query(
      `
      INSERT INTO advertisers (email, plan)
      VALUES ($1, $2)
      ON CONFLICT (email)
      DO UPDATE SET plan = EXCLUDED.plan
      RETURNING id
      `,
      [advertiserEmail, plan]
    );

    const advertiserId = advertiserResult.rows[0].id;

    let highlightUntil = null;
    if (plan === "highlight") {
      highlightUntil = new Date();
      highlightUntil.setDate(highlightUntil.getDate() + HIGHLIGHT_DAYS);
    }

    await pool.query(
      `
      INSERT INTO ads
      (advertiser_id, title, price, city_id, latitude, longitude, radius_km, priority, highlight_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        advertiserId,
        title,
        price,
        city_id,
        latitude,
        longitude,
        radius_km,
        adPlan.priority,
        highlightUntil
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar anúncio" });
  }
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Carros na Cidade rodando na porta", PORT);
});
