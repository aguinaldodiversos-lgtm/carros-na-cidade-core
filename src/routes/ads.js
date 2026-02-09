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

    // verificar se usuário tem CPF/CNPJ validado
    const userResult = await pool.query(
      "SELECT document_verified FROM users WHERE id = $1",
      [userId]
    );

    if (!userResult.rows[0]?.document_verified) {
      return res.status(403).json({
        error: "Você precisa verificar seu CPF antes de anunciar"
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
        latitude,
        longitude,
        advertiser.plan
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar anúncio' });
  }
});

/* =====================================================
   LISTAR ANÚNCIOS POR RAIO
===================================================== */
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius = 100 } = req.query;

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
          THEN 3
        WHEN plan = 'start'
          THEN 2
        ELSE 1
      END AS relevance

      FROM ads
      WHERE status = 'active'
      HAVING distance <= $3
      ORDER BY
        relevance DESC,
        created_at DESC
      `,
      [lat, lng, radius]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar anúncios' });
  }
});


module.exports = router;
