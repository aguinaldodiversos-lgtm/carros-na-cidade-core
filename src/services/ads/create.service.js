const pool = require('../../config/db');
const slugify = require('../../utils/slugify');

async function createAd(advertiser, data) {
  const {
    title,
    price,
    city,
    state,
    latitude,
    longitude
  } = data;

  if (!title || !price || !city || !state) {
    throw new Error('INVALID_DATA');
  }

  let adPlan = 'essential';

  if (advertiser.plan === 'start') adPlan = 'start';
  if (advertiser.plan === 'pro') adPlan = 'pro';

  const slugBase = slugify(`${title}-${city}-${state}`);

  const { rows } = await pool.query(
    `
    INSERT INTO ads
    (advertiser_id, title, price, city, state, latitude, longitude, plan, slug)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
      adPlan,
      slugBase
    ]
  );

  return rows[0];
}

module.exports = { createAd };
