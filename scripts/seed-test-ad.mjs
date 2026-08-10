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

  const users = await pool.query("SELECT id FROM users ORDER BY id ASC LIMIT 1");
  if (!users.rows[0]) {
    console.error("Nenhum usuário em users. Crie uma conta antes de rodar este script.");
    process.exit(1);
  }

  const userId = String(users.rows[0].id);

  // A cidade é escolhida ANTES do ensure (era depois) por duas razões: desde a
  // Fase 0.1 o `ensure` exige `cityId` explícito para criar, e o anunciante do
  // fixture passa a nascer na mesma cidade do anúncio que este script cria —
  // antes podiam divergir.
  const city = await pool.query(
    `SELECT id, name, state FROM cities WHERE state = 'SP' ORDER BY id ASC LIMIT 1`
  );
  if (!city.rows[0]) {
    console.error("Nenhuma cidade SP em cities. Rode o import IBGE antes.");
    process.exit(1);
  }

  const c = city.rows[0];

  const { ensureAdvertiserForUser } = await import(
    "../src/modules/advertisers/advertiser.ensure.service.js"
  );
  await ensureAdvertiserForUser(userId, { cityId: Number(c.id), source: "seed-test-ad" });

  const adv = await pool.query("SELECT id FROM advertisers WHERE user_id = $1 LIMIT 1", [userId]);
  if (!adv.rows[0]) {
    console.error(
      "Falha ao garantir anunciante (ensureAdvertiserForUser). Verifique cities e logs."
    );
    process.exit(1);
  }

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
