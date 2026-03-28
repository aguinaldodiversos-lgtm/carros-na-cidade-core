/**
 * Insere um anúncio de teste (schema real da tabela `ads`).
 * Uso: node scripts/seed-test-ad.mjs
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Defina DATABASE_URL no ambiente ou em .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

try {
  await pool.query(`
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
  `);

  const adv = await pool.query(
    "SELECT id FROM advertisers ORDER BY id ASC LIMIT 1"
  );
  if (!adv.rows[0]) {
    console.error(
      "Nenhuma linha em advertisers. Crie um anunciante antes de rodar este script."
    );
    process.exit(1);
  }

  const city = await pool.query(
    `SELECT id, name, state FROM cities WHERE state = 'SP' ORDER BY id ASC LIMIT 1`
  );
  if (!city.rows[0]) {
    console.error("Nenhuma cidade SP em cities. Rode o import IBGE antes.");
    process.exit(1);
  }

  const c = city.rows[0];
  const slug = `teste-seed-${Date.now()}`;

  const { rows } = await pool.query(
    `
    INSERT INTO ads (
      advertiser_id,
      title,
      description,
      price,
      city_id,
      city,
      state,
      brand,
      model,
      year,
      mileage,
      category,
      body_type,
      fuel_type,
      transmission,
      below_fipe,
      status,
      plan,
      slug,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active', 'free', $17, NOW(), NOW()
    )
    RETURNING id, slug, title, price, city, state, advertiser_id
    `,
    [
      adv.rows[0].id,
      "Carro teste (seed)",
      "Anúncio de teste gerado por scripts/seed-test-ad.mjs",
      45990.0,
      c.id,
      c.name,
      c.state,
      "Volkswagen",
      "Gol",
      2020,
      48000,
      "sedan",
      "sedan",
      "flex",
      "manual",
      false,
      slug,
    ]
  );

  console.log("[seed-test-ad] Anúncio criado com sucesso:");
  console.log(JSON.stringify(rows[0], null, 2));
} catch (err) {
  console.error("[seed-test-ad] Erro:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
