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
//
// A Fase 3.1 acrescentou `whatsapp`: sem número, o botão "Agendar visita pelo
// WhatsApp" responderia DEALER_WHATSAPP_UNAVAILABLE e o E2E do CTA não teria o
// que validar. Cada loja recebe um número DIFERENTE de propósito — é o que
// permite provar que o contato sai do advertiser DO ANÚNCIO, e não de "alguma
// loja" qualquer.
//
// Gravado no formato que o lojista digita, com máscara: a normalização para
// `wa.me` é responsabilidade da leitura, não do dado.
const DEALERS = [
  {
    email: "cnpj@carrosnacidade.com",
    name: "Loja Atibaia",
    slug: "atibaia-sp",
    status: "active",
    whatsapp: "(11) 98888-1111",
  },
  {
    email: "cnpj2@carrosnacidade.com",
    name: "Loja Braganca",
    slug: "braganca-paulista-sp",
    status: "active",
    whatsapp: "(11) 98888-2222",
  },
  {
    email: "cnpj3@carrosnacidade.com",
    name: "Loja Atibaia Suspensa",
    slug: "atibaia-sp",
    status: "suspended",
    whatsapp: "(11) 98888-3333",
  },
  {
    email: "cnpj4@carrosnacidade.com",
    name: "Loja Atibaia Bloqueada",
    slug: "atibaia-sp",
    status: "blocked",
    whatsapp: "(11) 98888-4444",
  },
  // SEGUNDA loja ATIVA em Atibaia — acrescentada na Fase 4.3.
  //
  // Existe por um motivo que nenhuma das quatro acima atende: o Produto 2 é uma
  // DISPUTA, e provar disputa exige duas lojas ELEGÍVEIS na MESMA cidade
  // competindo pelo mesmo veículo. `cnpj@` é a única ativa de Atibaia; `cnpj3` e
  // `cnpj4` são de propósito suspensa e bloqueada (elas provam o corte da
  // moderação no Produto 1), e `cnpj2` é de outra cidade.
  //
  // ACRESCENTA, não altera: as quatro anteriores mantêm e-mail, cidade e status
  // intactos, porque os specs do Produto 1 dependem exatamente desses papéis.
  {
    email: "cnpj5@carrosnacidade.com",
    name: "Loja Atibaia Dois",
    slug: "atibaia-sp",
    status: "active",
    whatsapp: "(11) 98888-5555",
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
  await pool.query(
    `UPDATE advertisers SET city_id = $2, status = $3, whatsapp = $4 WHERE user_id = $1`,
    [dealerUserId, dealerCityId, dealer.status, dealer.whatsapp]
  );
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

// ============================================================================
// PRODUTO 2 — solicitação de venda para o E2E de disputa (Fase 4.3)
// ============================================================================
//
// POR QUE ISTO É SEMEADO E NÃO PUBLICADO PELO PRÓPRIO PRODUTO
//
// A publicação exige no MÍNIMO quatro fotos, e o upload passa pelo R2. Num
// ambiente local sem credenciais o endpoint responde 503 com
// `SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE` — que é o comportamento CORRETO
// (a Fase 4.1 criou esse código exatamente para não mandar a pessoa trocar uma
// foto que está perfeita quando o problema é o bucket).
//
// Ou seja: o caminho da PF não está quebrado; ele depende de infraestrutura que
// a máquina de teste não tem. Semear a linha aqui é a mesma escolha que este
// arquivo já faz para os anúncios do Produto 1, e mantém o E2E focado no que a
// Fase 4.3 precisa provar — a DISPUTA entre dois lojistas.
//
// O caminho de publicação da PF tem cobertura própria em
// tests/sale-requests/ (validação, service e rotas) e não fica sem prova.
//
// As fotos entram como `storage_key`: a URL pública é DERIVADA na leitura
// (`buildCanonicalImageUrlFromStorageKey`), e sem R2 configurado ela cai no
// proxy `/api/vehicle-images?key=` — a galeria monta e as imagens não carregam,
// que é exatamente o esperado num ambiente sem storage.

// ────────────────────────────────────────────────────────────────────────────
// IDEMPOTÊNCIA: a TRILHA DE SELEÇÃO É APAGADA À MÃO, E DE PROPÓSITO
// ────────────────────────────────────────────────────────────────────────────
// As propostas (055) somem junto com a solicitação pelo `ON DELETE CASCADE`
// delas. A trilha de seleção (057) NÃO — nenhuma FK dela tem cascade, e o banco
// RECUSA apagar `sale_requests` enquanto existir um evento de seleção.
//
// Isso não é um obstáculo a contornar: é a Fase 4.4.1 funcionando. Uma trilha
// auditável que sumisse junto com o objeto sumiria exatamente quando fosse
// consultada — e sem log, sem erro e sem ninguém saber que existiu.
//
// O que o endurecimento exige é que a destruição de histórico seja EXPLÍCITA.
// Este DELETE é essa declaração: um script de RESET DE AMBIENTE DE TESTE
// dizendo, por escrito, que está descartando a trilha das solicitações que ele
// mesmo semeou.
//
// O escopo é o mesmo do DELETE seguinte (`owner_user_id`), e não a tabela
// inteira: um `DELETE FROM sale_request_offer_selections` sem WHERE apagaria a
// trilha de qualquer outro dado que estivesse no banco de teste.
//
// Fora daqui, nenhum caminho da aplicação apaga esta tabela. Quando existir
// política de LGPD/anonimização, ela será um fluxo próprio com as mesmas
// características: explícita, escopada e legível — nunca um `ON DELETE`
// herdado de uma FK.
await pool.query(
  `DELETE FROM sale_request_offer_selections
    WHERE sale_request_id IN (
      SELECT id FROM sale_requests WHERE owner_user_id = $1::bigint
    )`,
  [userId]
);

await pool.query(`DELETE FROM sale_requests WHERE owner_user_id = $1::bigint`, [userId]);

const { rows: atibaiaRows } = await pool.query(
  `SELECT id FROM cities WHERE slug = 'atibaia-sp' LIMIT 1`
);
const saleCityId = atibaiaRows[0]?.id;
if (saleCityId == null) {
  throw new Error("[e2e-seed] Atibaia não encontrada para a solicitação de venda.");
}

const { rows: saleRows } = await pool.query(
  `
  INSERT INTO sale_requests (
    owner_user_id, city_id,
    brand, brand_slug, model, model_slug, fipe_model_description,
    fipe_code, fipe_reference_value, fipe_reference_at,
    year, mileage, transmission, fuel_type,
    declared_condition, known_issues,
    tire_condition,
    financing_status, fines_status, ipva_status, licensing_status,
    caution_report_status, auction_history, collision_history,
    engine_condition, gearbox_condition, suspension_condition,
    body_paint_status, body_paint_issues,
    status
  )
  VALUES (
    $1, $2,
    'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
    'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.',
    '005340-0', 92000.00, NOW(),
    2020, 45000, 'automatico', 'flex',
    'bom', 'Ar-condicionado gelando pouco; revisão feita em junho.',
    'good',
    'no', 'no', 'paid', 'ok',
    'not_available', 'no', 'no',
    'ok', 'ok', 'ok',
    'none', '[]'::jsonb,
    'receiving_offers'
  )
  RETURNING id
  `,
  [userId, saleCityId]
);

const saleRequestId = saleRows[0].id;

await pool.query(
  `
  INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order)
  SELECT $1, key, ord
  FROM UNNEST($2::text[], $3::int[]) AS t(key, ord)
  `,
  [
    saleRequestId,
    [0, 1, 2, 3].map((i) => `sale-requests/${userId}/e2e/2026/08/foto-${i}.webp`),
    [0, 1, 2, 3],
  ]
);

await closeDatabasePool();

console.log(
  "[e2e-seed] OK —",
  E2E_EMAIL,
  "+ cidade Atibaia + advertiser + lojistas CNPJ (Atibaia x2/Bragança)",
  `+ ${DEALER_ADS.length} anúncios de estoque (Fase 3)`,
  `+ solicitação de venda #${saleRequestId} com 4 fotos (Fase 4.3)`
);
