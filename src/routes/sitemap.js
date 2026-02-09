const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.APP_BASE_URL;

    const { rows } = await pool.query(
      `
      SELECT id, slug, created_at
      FROM ads
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 50000
      `
    );

    const urls = rows.map(ad => {
      const loc = `${baseUrl}/carro/${ad.slug}-${ad.id}`;
      const lastmod = new Date(ad.created_at).toISOString();

      return `
        <url>
          <loc>${loc}</loc>
          <lastmod>${lastmod}</lastmod>
          <changefreq>daily</changefreq>
          <priority>0.8</priority>
        </url>
      `;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${urls}
      </urlset>
    `;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Erro no sitemap:', err);
    res.status(500).send('Erro ao gerar sitemap');
  }
});

module.exports = router;
