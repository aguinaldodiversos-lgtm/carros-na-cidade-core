const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function collectDealersForCity(cityId) {
  console.log(`🔎 Coletando lojistas para cidade ${cityId}`);

  // 1) Buscar anunciantes existentes
  const existing = await pool.query(
    `
    SELECT name, phone
    FROM advertisers
    WHERE city_id = $1
    AND phone IS NOT NULL
  `,
    [cityId]
  );

  let inserted = 0;

  for (const dealer of existing.rows) {
    // evitar duplicados
    const exists = await pool.query(
      `
      SELECT id
      FROM dealer_leads
      WHERE phone = $1
      LIMIT 1
    `,
      [dealer.phone]
    );

    if (exists.rowCount === 0) {
      await pool.query(
        `
        INSERT INTO dealer_leads (
          name,
          phone,
          source,
          city_id
        )
        VALUES ($1, $2, 'internal', $3)
      `,
        [dealer.name, dealer.phone, cityId]
      );

      inserted++;
    }
  }

  console.log(`✅ ${inserted} lojistas coletados`);
  return inserted;
}

module.exports = { collectDealersForCity };
