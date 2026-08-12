#!/usr/bin/env node
/**
 * Garante utilizador E2E (login fixo) + cidade Atibaia no Postgres.
 * Usar após migrations (`npm run integration:db:prepare`) com o mesmo DATABASE_URL / TEST_DATABASE_URL.
 *
 * Uso (raiz): node scripts/e2e-seed.mjs
 * Credenciais: cpf@carrosnacidade.com / 123456
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../.env.local"), override: true });

const DEFAULT_TEST_DB = "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test";

const conn =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  DEFAULT_TEST_DB;

process.env.DATABASE_URL = conn;
process.env.TEST_DATABASE_URL = conn;
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const E2E_EMAIL = "cpf@carrosnacidade.com";
const E2E_PASSWORD = "123456";

const db = await import("../src/infrastructure/database/db.js");
const { pool, closeDatabasePool } = db;

const hash = await bcrypt.hash(E2E_PASSWORD, 10);

await pool.query(
  `
  INSERT INTO cities (name, state, slug)
  VALUES ('Atibaia', 'SP', 'atibaia-sp')
  ON CONFLICT (slug) DO NOTHING
  `
);

const updated = await pool.query(
  `
  UPDATE users
  SET password_hash = $2, email_verified = true, document_verified = true
  WHERE LOWER(email) = LOWER($1)
  RETURNING id
  `,
  [E2E_EMAIL, hash]
);

if (updated.rowCount === 0) {
  await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      name,
      document_type,
      role,
      plan,
      email_verified,
      document_verified
    )
    VALUES ($1, $2, $3, 'cpf', 'user', 'free', true, true)
    `,
    [E2E_EMAIL, hash, "E2E CPF Demo"]
  );
}

const { rows } = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [
  E2E_EMAIL,
]);
const userId = rows[0]?.id != null ? String(rows[0].id) : null;
if (!userId) {
  throw new Error("[e2e-seed] Falha ao resolver id do utilizador E2E.");
}

// A cidade do fixture é resolvida pelo slug que este próprio script semeia
// acima. Desde a Fase 0.1 o `ensure` exige `cityId` explícito para CRIAR — não
// existe mais fallback para "a primeira cidade da tabela", e é bom que não
// exista: um seed que dependia dessa adivinhação escondia o problema.
const { rows: seedCityRows } = await pool.query("SELECT id FROM cities WHERE slug = $1 LIMIT 1", [
  "atibaia-sp",
]);
const seedCityId = seedCityRows[0]?.id;
if (seedCityId == null) {
  throw new Error("[e2e-seed] Cidade do fixture (atibaia-sp) não encontrada em cities.");
}

const { ensureAdvertiserForUser } = await import(
  "../src/modules/advertisers/advertiser.ensure.service.js"
);
await ensureAdvertiserForUser(userId, { cityId: Number(seedCityId), source: "e2e-seed" });

await pool.query(
  `DELETE FROM ads WHERE advertiser_id IN (
    SELECT id FROM advertisers WHERE user_id = $1::bigint
  )`,
  [userId]
);

// --- Lojistas CNPJ para o Motor de Oportunidades (Fase 2) --------------------
//
// Dois, em cidades DIFERENTES, porque o teste que importa é o negativo: provar
// que o lojista de Bragança NÃO vê a procura publicada em Atibaia. Com um único
// lojista, um bug que ignorasse a cidade passaria despercebido.
//
// A Fase 2.1 acrescentou dois lojistas NA MESMA cidade do comprador, mas fora do
// ar: suspenso e bloqueado. Eles existem para provar que moderação corta o
// acesso — sem eles, "só loja ativa participa" seria uma regra sem testemunha.
//
// Aditivo e idempotente: não altera o utilizador CPF nem os anúncios dele, então
// os specs que já existiam continuam a ver exatamente o mesmo estado.
const DEALERS = [
  { email: "cnpj@carrosnacidade.com", name: "Loja Atibaia", slug: "atibaia-sp", status: "active" },
  {
    email: "cnpj2@carrosnacidade.com",
    name: "Loja Braganca",
    slug: "braganca-paulista-sp",
    status: "active",
  },
  {
    email: "cnpj3@carrosnacidade.com",
    name: "Loja Atibaia Suspensa",
    slug: "atibaia-sp",
    status: "suspended",
  },
  {
    email: "cnpj4@carrosnacidade.com",
    name: "Loja Atibaia Bloqueada",
    slug: "atibaia-sp",
    status: "blocked",
  },
];

await pool.query(
  `INSERT INTO cities (name, state, slug)
   VALUES ('Bragança Paulista', 'SP', 'braganca-paulista-sp')
   ON CONFLICT (slug) DO NOTHING`
);

for (const dealer of DEALERS) {
  const { rows: cityRows } = await pool.query(`SELECT id FROM cities WHERE slug = $1 LIMIT 1`, [
    dealer.slug,
  ]);
  const dealerCityId = cityRows[0]?.id;
  if (dealerCityId == null) {
    throw new Error(`[e2e-seed] Cidade ${dealer.slug} não encontrada em cities.`);
  }

  const touched = await pool.query(
    `UPDATE users
        SET password_hash = $2,
            document_type = 'cnpj',
            email_verified = true,
            document_verified = true
      WHERE LOWER(email) = LOWER($1)
      RETURNING id`,
    [dealer.email, hash]
  );

  let dealerUserId = touched.rows[0]?.id;
  if (dealerUserId == null) {
    const created = await pool.query(
      `INSERT INTO users (email, password_hash, name, document_type, role, plan,
                          email_verified, document_verified)
       VALUES ($1, $2, $3, 'cnpj', 'user', 'free', true, true)
       RETURNING id`,
      [dealer.email, hash, dealer.name]
    );
    dealerUserId = created.rows[0].id;
  }

  // `ensureAdvertiserForUser` não ATUALIZA a cidade de um advertiser existente
  // (não existe caminho que faça isso em lado nenhum do projeto), então o UPDATE
  // abaixo garante que reexecutar o seed devolve o lojista à cidade esperada.
  await ensureAdvertiserForUser(dealerUserId, {
    cityId: Number(dealerCityId),
    source: "e2e-seed",
  });
  await pool.query(`UPDATE advertisers SET city_id = $2, status = $3 WHERE user_id = $1`, [
    dealerUserId,
    dealerCityId,
    dealer.status,
  ]);
}

// Estado limpo entre execuções: as procuras são criadas pelos specs, não aqui.
// Fica FORA do laço acima — é sobre o comprador, não sobre cada lojista.
await pool.query(`DELETE FROM purchase_intents WHERE buyer_user_id = $1::bigint`, [userId]);

await closeDatabasePool();

console.log(
  "[e2e-seed] OK —",
  E2E_EMAIL,
  "+ cidade Atibaia + advertiser + lojistas CNPJ (Atibaia/Bragança)"
);
