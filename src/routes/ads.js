const express = require('express');
const pool = require('../config/db');
const auth = require('../middlewares/auth');
const { getOrCreateAdvertiser } = require('../services/advertiser.service');

const router = express.Router();

/* =====================================================
   CRIAR ANÚNCIO
===================================================== */
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // buscar dados do usuário
    const userResult = await pool.query(
      `SELECT document_type, document_verified
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user || !user.document_verified) {
      return res.status(403).json({
        error: "Você precisa verificar seu CPF ou CNPJ antes de anunciar"
      });
    }

    // definir limite conforme tipo de conta
    const adLimit = user.document_type === 'cnpj' ? 20 : 3;

    // contar anúncios ativos do usuário
    const countResult = await pool.query(
      `
      SELECT COUNT(a.id) as total
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE adv.email = $1
      AND a.status = 'active'
      `,
      [req.user.email]
    );

    const totalAds = parseInt(countResult.rows[0].total, 10);

    if (totalAds >= adLimit) {
      return res.status(403).json({
        error: `Limite de ${adLimit} anúncios ativos atingido`
      });
    }

    const advertiser = await getOrCreateAdvertiser(req.user.email);

    if (advertiser.status !== 'active') {
      return res.status(403).json({ error: 'Conta bloqueada' });
    }

    const {
      title,
      price,
      city,
      state,
      latitude,
      longitude
    } = req.body;

    // validações básicas
    if (!title || !price || !city || !state) {
      return res.status(400).json({
        error: 'Campos obrigatórios: title, price, city, state'
      });
    }

    /* ===============================
       DEFINIR PLANO DO ANÚNCIO
    =============================== */
    let adPlan = 'essential';

    if (advertiser.plan === 'start') {
      adPlan = 'start';
    }

    if (advertiser.plan === 'pro') {
      adPlan = 'pro';
    }

    const { rows } = await pool.query(
      `
      INSERT INTO ads
      (advertiser_id, title, price, city, state, latitude, longitude, plan)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        advertiser.id,
        title,
        price,
        city,
        state,
        latitude || null,
        longitude || null,
        adPlan
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar anúncio:', err);
    res.status(500).json({ error: 'Erro ao criar anúncio' });
  }
});

/* =====================================================
   LISTAR ANÚNCIOS POR RAIO COM RELEVÂNCIA DINÂMICA
===================================================== */
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius = 100 } = req.query;

    // validação básica
    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Parâmetros lat e lng são obrigatórios'
      });
    }

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
      ) AS distance,

      CASE
        WHEN highlight_until IS NOT NULL
          AND highlight_until > NOW()
          THEN 4
        WHEN plan = 'pro'
