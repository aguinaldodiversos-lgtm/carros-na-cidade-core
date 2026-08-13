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

// --- Estoque dos lojistas para o envio de veículos (Fase 3) -----------------
//
// O fluxo da Fase 3 é "lojista escolhe um carro DO PRÓPRIO ESTOQUE", então sem
// anúncio semeado não existe o que enviar e o spec inteiro vira um skip.
//
// Três anúncios em Atibaia, todos Honda HR-V automáticos, para exercitar as três
// classificações que o produto tem:
//
//   • hr-v-atibaia-1  R$  98.900 → compatível, DENTRO do orçamento (95.000?
//     não: o spec publica com teto de 100.000);
//   • hr-v-atibaia-2  R$ 103.900 → compatível, ACIMA do orçamento (specific
//     model não bloqueia por preço — é o caso que prova a regra);
//   • city-atibaia-3  R$  89.900 → Honda City: MESMA marca, modelo diferente.
//     É o negativo que importa: sem ele, "o matching funciona" poderia estar
//     passando por não haver nada para recusar.
//
// E um HR-V idêntico na loja de BRAGANÇA, para o teste de posse: o lojista de
// Atibaia não pode enviar o carro do concorrente, e provar isso exige que o
// carro do concorrente EXISTA e seja compatível.
const DEALER_ADS = [
  {
    dealerEmail: "cnpj@carrosnacidade.com",
    slug: "honda-hr-v-ex-2020-atibaia-sp-e2e-1",
    title: "Honda HR-V EX 2020",
    model: "HR-V EX 1.8 Flex 16V 5p Aut.",
    price: 98900,
    year: 2020,
    mileage: 72000,
  },
  {
    dealerEmail: "cnpj@carrosnacidade.com",
    slug: "honda-hr-v-exl-2022-atibaia-sp-e2e-2",
    title: "Honda HR-V EXL 2022",
    model: "HR-V EXL 1.8 Flex 16V 5p Aut.",
    price: 103900,
    year: 2022,
    mileage: 41000,
  },
  {
    dealerEmail: "cnpj@carrosnacidade.com",
    slug: "honda-city-ex-2021-atibaia-sp-e2e-3",
    title: "Honda City EX 2021",
    model: "CITY EX 1.5 Flex 16V 4p Aut.",
    price: 89900,
    year: 2021,
    mileage: 55000,
  },
  {
    dealerEmail: "cnpj2@carrosnacidade.com",
    slug: "honda-hr-v-ex-2020-braganca-sp-e2e-4",
    title: "Honda HR-V EX 2020 (Bragança)",
    model: "HR-V EX 1.8 Flex 16V 5p Aut.",
    price: 97900,
    year: 2020,
    mileage: 68000,
  },
];

for (const ad of DEALER_ADS) {
  const { rows: ownerRows } = await pool.query(
    `SELECT adv.id, adv.city_id
       FROM advertisers adv
       JOIN users u ON u.id = adv.user_id
      WHERE LOWER(u.email) = LOWER($1)
      ORDER BY adv.id ASC
      LIMIT 1`,
    [ad.dealerEmail]
  );
  const advertiser = ownerRows[0];
  if (!advertiser) {
    throw new Error(`[e2e-seed] Advertiser de ${ad.dealerEmail} não encontrado.`);
  }

  // Idempotente pelo slug: reexecutar o seed devolve o anúncio ao estado
  // esperado em vez de acumular duplicatas a cada rodada.
  const touched = await pool.query(
    `UPDATE ads
        SET advertiser_id = $2, city_id = $3, title = $4, price = $5,
            brand = 'Honda', model = $6, year = $7, mileage = $8,
            transmission = 'automatico', body_type = 'suv',
            status = 'active', images = '[]'::jsonb, updated_at = NOW()
      WHERE slug = $1
      RETURNING id`,
    [
      ad.slug,
      advertiser.id,
      advertiser.city_id,
      ad.title,
      ad.price,
      ad.model,
      ad.year,
      ad.mileage,
    ]
  );

  if (touched.rowCount === 0) {
    await pool.query(
      `INSERT INTO ads (advertiser_id, city_id, title, price, brand, model, year, mileage,
                        transmission, body_type, status, slug, images)
       VALUES ($1, $2, $3, $4, 'Honda', $5, $6, $7, 'automatico', 'suv', 'active', $8, '[]'::jsonb)`,
      [
        advertiser.id,
        advertiser.city_id,
        ad.title,
        ad.price,
        ad.model,
        ad.year,
        ad.mileage,
        ad.slug,
      ]
    );
  }
}

// Estado limpo entre execuções: as procuras são criadas pelos specs, não aqui.
// Fica FORA do laço acima — é sobre o comprador, não sobre cada lojista.
//
// As ofertas (purchase_intent_offers) somem junto pelo ON DELETE CASCADE da
// migration 051 — não é preciso apagá-las à mão, e apagar seria a chance de
// esquecer uma tabela nova no futuro.
await pool.query(`DELETE FROM purchase_intents WHERE buyer_user_id = $1::bigint`, [userId]);

await closeDatabasePool();

console.log(
  "[e2e-seed] OK —",
  E2E_EMAIL,
  "+ cidade Atibaia + advertiser + lojistas CNPJ (Atibaia/Bragança)",
  `+ ${DEALER_ADS.length} anúncios de estoque (Fase 3)`
);
