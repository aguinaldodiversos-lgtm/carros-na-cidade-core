require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

/* =========================
   CONFIGURAÇÕES GERAIS
========================= */
const HIGHLIGHT_DAYS = 15; // 🔧 editável
const MAX_RADIUS_KM = 100;

/* =========================
   PLANOS DE ANÚNCIO
========================= */
const AD_PLANS = {
  free: {
    name: "Gratuito",
    priority: 1,
    limit: "unlimited" // 🔹 ILIMITADO NO INÍCIO DO PORTAL
  },
  professional: {
    name: "Plano Profissional",
    priority: 2,
    limit: 10,
    mp_plan_id: process.env.MP_PLAN_PROFESSIONAL
  },
  professional_plus: {
    name: "Plano Profissional Plus",
    priority: 2,
    limit: "unlimited",
    mp_plan_id: process.env.MP_PLAN_PRO_PLUS
  },
  highlight: {
    name: "Destaque Avulso",
    priority: 3,
    durationDays: HIGHLIGHT_DAYS
  }
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
      advertiser_id INTEGER,
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
   FIPE COM CACHE ATÉ VIRADA DO MÊS
========================= */
function getFipeValidityDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

app.get("/api/fipe", async (req, res) => {
  const { tipo, marca, modelo, ano } = req.query;
  if (!tipo || !marca || !modelo || !ano) {
    return res.status(400).json({ error: "Parâmetros incompletos" });
  }

  const hash = crypto
    .createHash("md5")
    .update(`${tipo}-${marca}-${modelo}-${ano}`)
    .digest("hex");

  const cache = await pool.query(
    `SELECT * FROM fipe_cache WHERE hash = $1 AND valid_until > NOW()`,
    [hash]
  );

  if (cache.rows.length > 0) {
    return res.json({ source: "cache", data: cache.rows[0].response });
  }

  const response = await axios.get("https://api.fipe.online/v1/price", {
    headers: { "X-API-KEY": process.env.FIPE_API_KEY },
    params: { vehicleType: tipo, brand: marca, model: modelo, year: ano }
  });

  await pool.query(
    `
    INSERT INTO fipe_cache (hash, response, valid_until)
    VALUES ($1,$2,$3)
    ON CONFLICT (hash)
    DO UPDATE SET response = $2, valid_until = $3
    `,
    [hash, response.data, getFipeValidityDate()]
  );

  res.json({ source: "api", data: response.data });
});

/* =========================
   CRIAÇÃO DE ANÚNCIO
========================= */
app.post("/ads", async (req, res) => {
  const {
    advertiser_id,
    title,
    price,
    city_id,
    latitude,
    longitude,
    radius_km = 0,
    plan
  } = req.body;

  if (radius_km > MAX_RADIUS_KM) {
    return res.status(400).json({ error: "Raio máximo permitido: 100km" });
  }

  const adPlan = AD_PLANS[plan] || AD_PLANS.free;

  let highlightUntil = null;
  if (plan === "highlight") {
    highlightUntil = new Date();
    highlightUntil.setDate(highlightUntil.getDate() + HIGHLIGHT_DAYS);
  }

  // 🚫 SEM BLOQUEIO PARA GRATUITOS (estratégia inicial)
  await pool.query(
    `
    INSERT INTO ads
    (advertiser_id, title, price, city_id, latitude, longitude, radius_km, priority, highlight_until)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      advertiser_id,
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
});

/* =========================
   LISTAGEM POR CIDADE + RAIO + CARROSSEL
========================= */
app.get("/ads/by-city", async (req, res) => {
  const { city_id } = req.query;
  if (!city_id) return res.status(400).json({ error: "city_id obrigatório" });

  const cityRes = await pool.query(
    `SELECT * FROM cities WHERE id = $1`,
    [city_id]
  );
  if (cityRes.rows.length === 0) {
    return res.status(404).json({ error: "Cidade não encontrada" });
  }

  const city = cityRes.rows[0];

  const distanceFormula = `
    (6371 * acos(
      cos(radians($1)) *
      cos(radians(a.latitude)) *
      cos(radians(a.longitude) - radians($2)) +
      sin(radians($1)) *
      sin(radians(a.latitude))
    ))
  `;

  const adsRes = await pool.query(
    `
    SELECT a.*, ${distanceFormula} AS distance_km
    FROM ads a
    WHERE a.status IN ('active','reserved')
      AND ${distanceFormula} <= a.radius_km
    ORDER BY a.priority DESC, a.created_at DESC
    `,
    [city.latitude, city.longitude]
  );

  const now = new Date();
  const destaque = [];
  const profissionais = [];
  const gratuitos = [];

  for (const ad of adsRes.rows) {
    if (
      ad.priority === 3 &&
      ad.highlight_until &&
      new Date(ad.highlight_until) > now
    ) {
      destaque.push(ad);
    } else if (ad.priority === 2) {
      profissionais.push(ad);
    } else {
      gratuitos.push(ad);
    }
  }

  res.json({
    city: {
      id: city.id,
      name: city.name,
      state: city.state
    },
    carousels: {
      destaque,
      profissionais,
      gratuitos
    }
  });
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Carros na Cidade rodando na porta", PORT);
});
