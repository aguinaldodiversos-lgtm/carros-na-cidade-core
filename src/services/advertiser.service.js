const pool = require('../config/db');

async function getOrCreateAdvertiser(email) {
  const { rows } = await pool.query(
    'SELECT id, plan, status FROM advertisers WHERE email = $1',
    [email]
  );

  if (rows.length) return rows[0];

  const insert = await pool.query(
    `INSERT INTO advertisers (email, plan, status)
     VALUES ($1, 'free', 'active')
     RETURNING id, plan, status`,
    [email]
  );

  return insert.rows[0];
}

module.exports = { getOrCreateAdvertiser };
