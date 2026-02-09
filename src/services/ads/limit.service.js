const pool = require('../../config/db');

async function checkAdLimit(userId, email) {
  const userResult = await pool.query(
    `SELECT document_type, document_verified
     FROM users
     WHERE id = $1`,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user || !user.document_verified) {
    throw new Error('DOCUMENT_REQUIRED');
  }

  const adLimit = user.document_type === 'cnpj' ? 20 : 3;

  const countResult = await pool.query(
    `
    SELECT COUNT(a.id) as total
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE adv.email = $1
    AND a.status = 'active'
    `,
    [email]
  );

  const totalAds = parseInt(countResult.rows[0].total, 10);

  if (totalAds >= adLimit) {
    throw new Error('AD_LIMIT_REACHED');
  }
}

module.exports = { checkAdLimit };
