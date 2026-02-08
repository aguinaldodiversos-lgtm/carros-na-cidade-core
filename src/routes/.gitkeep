const express = require('express');
const pool = require('../config/db');
const auth = require('../middlewares/auth');
const { getOrCreateAdvertiser } = require('../services/advertiser.service');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const advertiser = await getOrCreateAdvertiser(req.user.email);

    if (advertiser.status !== 'active') {
      return res.status(403).json({ error: 'Conta bloqueada' });
    }

    const {
      title, price, city, state, latitude, longitude
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
      ) AS distance
      FROM ads
      WHERE status = 'active'
      HAVING distance <= $3
      ORDER BY
        CASE plan
          WHEN 'highlight' THEN 1
          WHEN 'professional' THEN 2
          ELSE 3
        END,
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

