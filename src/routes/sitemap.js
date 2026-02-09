const express = require('express');
const pool = require('../config/db');
const slugify = require('../utils/slugify');

const router = express.Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = (process.env.APP_BASE_URL || '').trim();

    /* =========================
       ANÚNCIOS INDIVIDUAIS
    ========================= */
    const adsResult = await pool.query(
      `
      SELECT id, slug, created_at
      FROM ads
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 50000
      `
    );

    const adUrls = adsResult.rows.map(ad => {
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

    /* =========================
       CIDADES
    ========================= */
    const citiesResult = await pool.query(
      `
      SELECT DISTINCT city, state
      FROM ads
      WHERE status = 'active'
      `
    );

    const cityUrls = citiesResult.rows.map(c => {
      const slug = slugify(`${c.city}-${c.state}`);
      const loc = `${baseUrl}/carros/${slug}`;

      return `
        <url>
          <loc>${loc}</loc>
          <changefreq>daily</changefreq>
          <priority>0.7</priority>
        </url>
      `;
    }).join('');

    /* =========================
       CIDADE + MARCA
    ========================= */
    const brandResult = await pool.query(
      `
      SELECT DISTINCT city, state, brand
      FROM ads
      WHERE status = 'active'
      AND brand IS NOT NULL
      `
    );

    const brandUrls = brandResult.rows.map(row => {
      const citySlug = slugify(`${row.city}-${row.state}`);
      const brandSlug = slugify(row.brand);

      const loc = `${baseUrl}/carros/${citySlug}/${brandSlug}`;

      return `
        <url>
          <loc>${loc}</loc>
          <changefreq>daily</changefreq>
          <priority>0.6</priority>
        </url>
      `;
    }).join('');

    /* =========================
       CIDADE + MARCA + MODELO
    ========================= */
    const modelResult = await pool.query(
      `
      SELECT DISTINCT city, state, brand, model
      FROM ads
      WHERE status = 'active'
      AND brand IS NOT NULL
      AND model IS NOT NULL
      `
    );

    const modelUrls = modelResult.rows.map(row => {
      const citySlug = slugify(`${row.city}-${row.state}`);
      const brandSlug = slugify(row.brand);
      const modelSlug = slugify(row.model);

      const loc = `${baseUrl}/carros/${citySlug}/${brandSlug}/${modelSlug}`;

      return `
        <url>
          <loc>${loc}</loc>
          <changefreq>daily</changefreq>
          <priority>0.5</priority>
        </url>
      `;
    }).join('');

    /* =========================
       XML FINAL
    ========================= */
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adUrls}
${cityUrls}
${brandUrls}
${modelUrls}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Erro no sitemap:', err);
    res.status(500).send('Erro ao gerar sitemap');
  }
});

module.exports = router;
