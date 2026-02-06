require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

/* =========================
   CONFIGURAÇÕES GERAIS
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

/* =========================
   HELPERS
========================= */

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  };
}

const PLAN_LIMITS = {
  free: Infinity,
  professional: 10,
  highlight: Infinity
};

/* =========================
   AUTH — EMAIL + SENHA
========================= */

app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, plan, subscription_status)
     VALUES ($1,$2,'user','free','active') RETURNING id,email,role`,
    [email, hash]
  );

  res.json({ token: generateToken(rows[0]) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email=$1`,
    [email]
  );

  if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  res.json({ token: generateToken(user) });
});

/* =========================
   ASSINATURA — MERCADO PAGO
========================= */

app.post('/subscription/create', auth(), async (req, res) => {
  const { plan } = req.body;

  const response = await axios.post(
    'https://api.mercadopago.com/preapproval',
    {
      reason: `Plano ${plan} - Carros na Cidade`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan === 'professional' ? 99 : 149,
        currency_id: 'BRL'
      },
      back_url: 'https://carrosnacidade.com/assinatura/sucesso',
      payer_email: req.user.email
    },
    { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
  );

  res.json({ init_point: response.data.init_point });
});

/* =========================
   WEBHOOK MERCADO PAGO
========================= */

app.post('/webhook/mercadopago', async (req, res) => {
  const { type, data } = req.body;
  if (type !== 'preapproval') return res.sendStatus(200);

  const mpRes = await axios.get(
    `https://api.mercadopago.com/preapproval/${data.id}`,
    { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
  );

  const sub = mpRes.data;

  await pool.query(
    `UPDATE users
     SET subscription_status=$1, plan=$2
     WHERE email=$3`,
    [sub.status, sub.reason.includes('highlight') ? 'highlight' : 'professional', sub.payer_email]
  );

  res.sendStatus(200);
});

/* =========================
   ANÚNCIOS — REGRAS DE NEGÓCIO
========================= */

app.post('/ads', auth(), async (req, res) => {
  const { rows: userRows } = await pool.query(
    `SELECT plan, subscription_status FROM users WHERE id=$1`,
    [req.user.id]
  );

  const user = userRows[0];

  if (user.subscription_status !== 'active') {
    return res.status(403).json({ error: 'Assinatura inativa' });
  }

  const { rows: ads } = await pool.query(
    `SELECT count(*) FROM ads WHERE user_id=$1`,
    [req.user.id]
  );

  if (ads[0].count >= PLAN_LIMITS[user.plan]) {
    return res.status(403).json({ error: 'Limite de anúncios atingido' });
  }

  await pool.query(
    `INSERT INTO ads (user_id,title,created_at)
     VALUES ($1,$2,NOW())`,
    [req.user.id, req.body.title]
  );

  res.json({ success: true });
});

/* =========================
   RANKING DE ANÚNCIOS
========================= */

app.get('/ads', async (_, res) => {
  const { rows } = await pool.query(`
    SELECT ads.*
    FROM ads
    JOIN users ON users.id = ads.user_id
    ORDER BY
      CASE users.plan
        WHEN 'highlight' THEN 1
        WHEN 'professional' THEN 2
        ELSE 3
      END,
      ads.created_at DESC
  `);

  res.json(rows);
});

/* =========================
   CANCELAMENTO
========================= */

app.post('/subscription/cancel', auth(), async (req, res) => {
  await pool.query(
    `UPDATE users SET subscription_status='cancelled' WHERE id=$1`,
    [req.user.id]
  );

  res.json({ cancelled: true });
});

/* =========================
   ADMIN — DASHBOARD
========================= */

app.get('/admin/metrics', auth('admin'), async (_, res) => {
  const users = await pool.query(`SELECT count(*) FROM users`);
  const revenue = await pool.query(`
    SELECT count(*) FILTER (WHERE plan!='free') as paid_users FROM users
  `);

  res.json({
    users: users.rows[0].count,
    paid_users: revenue.rows[0].paid_users
  });
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 API rodando na porta', PORT));
