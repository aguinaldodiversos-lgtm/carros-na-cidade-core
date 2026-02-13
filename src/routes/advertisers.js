const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   BUSCAR LOJA POR SLUG
===================================================== */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // dados da loja
    const advertiserResult = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.slug,
        a.phone,
        c.name AS city,
        c.state
      FROM advertisers a
      JOIN cities c ON c.id = a.city_id
      WHERE a.slug = $1
      `,
      [slug]
    );

    if (advertiserResult.rowCount === 0) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    const advertiser = advertiserResult.rows[0];

    // anúncios da loja
    const adsResult = await pool.query(
      `
      SELECT
        id,
        brand,
        model,
        year,
        price,
        city,
        slug,
        images
      FROM ads
      WHERE advertiser_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [advertiser.id]
    );

    // evento ativo da loja (se houver)
    const eventResult = await pool.query(
      `
      SELECT
        id,
        title,
        banner_url,
        start_date,
        end_date
      FROM events
      WHERE advertiser_id = $1
      AND status = 'active'
      AND banner_status = 'approved'
      ORDER BY start_date DESC
      LIMIT 1
      `,
      [advertiser.id]
    );

    res.json({
      advertiser,
      ads: adsResult.rows,
      active_event: eventResult.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar loja" });
  }
});

module.exports = router;
