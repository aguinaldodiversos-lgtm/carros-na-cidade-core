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
  // `address` entrou na Fase 4.5: sem endereço comercial cadastrado, a loja não
  // consegue propor horários para a avaliação presencial — o servidor recusa com
  // `INSPECTION_STORE_LOCATION_REQUIRED`, porque mandar o proprietário comparecer
  // num lugar que o sistema não sabe dizer qual é seria pior que não agendar.
  //
  // O E2E da 4.5 encontrou exatamente isso: a UI preencheu os três horários e o
  // backend recusou, corretamente. O seed é que estava incompleto.
  await pool.query(
    `UPDATE advertisers
        SET city_id = $2, status = $3, whatsapp = $4, address = $5
      WHERE user_id = $1`,
    [
      dealerUserId,
      dealerCityId,
      dealer.status,
      dealer.whatsapp,
      "Av. Jerônimo de Camargo, 1200 — Alvinópolis",
    ]
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
    [ad.slug, advertiser.id, advertiser.city_id, ad.title, ad.price, ad.model, ad.year, ad.mileage]
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
// A ORDEM abaixo é a ordem inversa das dependências, e cada DELETE existe
// porque a fase correspondente decidiu NÃO usar `ON DELETE CASCADE`:
//
//   4.5  decisões  → inspeções → horários  (trilha da avaliação)
//   4.4  seleções                          (trilha da escolha)
//
// A Fase 4.5 acrescentou três tabelas que dependem de `sale_request_offer_selections`
// (a inspeção prova contra ela que é a loja selecionada) e de `sale_requests`.
// Sem estes DELETEs, reexecutar o seed falha com:
//
//   violates foreign key constraint "sale_request_inspections_selected_store_fk"
//
// Isso não é um obstáculo a contornar — é o endurecimento funcionando. O que ele
// exige é que a destruição de histórico seja EXPLÍCITA, e estes DELETEs são essa
// declaração: um script de RESET DE AMBIENTE DE TESTE dizendo, por escrito, que
// está descartando a trilha das solicitações que ele mesmo semeou.
//
// Todos escopados ao MESMO `owner_user_id` — nunca a tabela inteira.
const ownedRequests = `SELECT id FROM sale_requests WHERE owner_user_id = $1::bigint`;

// 4.7 — o DESFECHO do handoff. Primeiro de todos: ele aponta para a trilha de
// seleções, que aponta para as ofertas.
//
// Também sem `ON DELETE CASCADE`, pelo mesmo motivo das outras trilhas. As
// RODADAS, ao contrário, cascateiam — elas são contêiner de ofertas, não
// registro de decisão — e por isso não aparecem aqui.
await pool.query(
  `DELETE FROM sale_request_handoff_outcomes
    WHERE sale_request_id IN (${ownedRequests})`,
  [userId]
);

// 4.6 — a decisão do PROPRIETÁRIO. Primeira da fila porque é a última da cadeia:
// ela aponta para a decisão pós-inspeção, que aponta para a inspeção, que aponta
// para a seleção.
//
// Também sem `ON DELETE CASCADE`, e pelo mesmo motivo das anteriores: uma trilha
// auditável que sumisse junto com o objeto sumiria exatamente quando fosse
// consultada. Sem este DELETE, reexecutar o seed depois de uma decisão falha com
//
//   violates foreign key constraint "sale_request_owner_final_decisions_request_fk"
//
// que é o endurecimento funcionando, e não um obstáculo a contornar.
await pool.query(
  `DELETE FROM sale_request_owner_final_decisions
    WHERE sale_request_id IN (${ownedRequests})`,
  [userId]
);

await pool.query(
  `DELETE FROM sale_request_post_inspection_decisions
    WHERE sale_request_id IN (${ownedRequests})`,
  [userId]
);

// A INSPEÇÃO E OS HORÁRIOS SE REFERENCIAM MUTUAMENTE:
//
//   slots.inspection_id        → inspections   (todo horário é de uma inspeção)
//   inspections.confirmed_slot_id → slots      (o horário escolhido)
//
// Nenhuma ordem de DELETE resolve um ciclo. É preciso SOLTAR a referência
// primeiro — e soltá-la sozinha violaria o CHECK de coerência, que exige
// `confirmed_slot_id` preenchido em `scheduled`/`completed`. Por isso o UPDATE
// devolve a inspeção ao estado inicial INTEIRO, inclusive a ficha observada:
// os CHECKs da 058 tornam qualquer meio-termo inexprimível, e isso é a garantia
// funcionando, não um obstáculo.
await pool.query(
  `UPDATE sale_request_inspections
      SET schedule_status = 'awaiting_slots',
          confirmed_slot_id = NULL,
          scheduled_at = NULL,
          completed_at = NULL,
          completed_by_user_id = NULL,
          observed_mileage = NULL,
          observed_condition = NULL,
          observed_tire_condition = NULL,
          observed_engine_condition = NULL,
          observed_gearbox_condition = NULL,
          observed_suspension_condition = NULL,
          observed_body_paint_status = NULL,
          observed_body_paint_issues = NULL,
          inspection_notes = NULL
    WHERE sale_request_id IN (${ownedRequests})`,
  [userId]
);

await pool.query(
  `DELETE FROM sale_request_inspection_slots
    WHERE inspection_id IN (
      SELECT id FROM sale_request_inspections
       WHERE sale_request_id IN (${ownedRequests})
    )`,
  [userId]
);

await pool.query(
  `DELETE FROM sale_request_inspections
    WHERE sale_request_id IN (${ownedRequests})`,
  [userId]
);

await pool.query(
  `DELETE FROM sale_request_offer_selections
    WHERE sale_request_id IN (${ownedRequests})`,
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

// ────────────────────────────────────────────────────────────────────────────
// FASE 4.7 — A RODADA 1
// ────────────────────────────────────────────────────────────────────────────
// A publicação REAL cria a rodada na mesma transação da solicitação. Este script
// insere a linha por SQL direto, então precisa criá-la também.
//
// Sem ela a solicitação nasce incapaz de receber proposta: `round_id` é NOT NULL
// em `sale_request_offers`, e o service devolve OFFER_CLOSED por não encontrar
// rodada aberta. O sintoma é cruel — a oportunidade aparece no feed do lojista e
// recusa todo lance com "não está mais recebendo propostas".
//
// `minimum_accepted_price` acompanha o da solicitação (aqui, NULL: o seed simula
// uma publicação anterior à regra da 4.3.3).
await pool.query(
  `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
   VALUES ($1, 1, (SELECT minimum_accepted_price FROM sale_requests WHERE id = $1))
   ON CONFLICT (sale_request_id, round_number) DO NOTHING`,
  [saleRequestId]
);

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

// ═══════════════════════════════════════════════════════════════════════════
// FASE H1.5 — o que a suíte exige e o seed não entregava
// ═══════════════════════════════════════════════════════════════════════════
//
// A homologação de 2026-09-06 mediu: 25 dos 38 vermelhos e 6 dos 13 skips do
// E2E vinham daqui, não do produto. O caso mais grave era silencioso — o gate
// do CI (`full-flow.spec.ts`) pulava 6 dos 9 testes porque `testa@`/`testb@`
// não existiam, e o job terminava verde sem ter exercitado publicação nenhuma.
//
// Todos os dados abaixo são SINTÉTICOS. Nada vem de produção.

const SENHA_PADRAO_TESTE = "Admin@12345";

/**
 * Cria/atualiza uma conta de teste de forma idempotente.
 *
 * `UPDATE`-primeiro em vez de `INSERT … ON CONFLICT` porque o e-mail pode já
 * existir com outra senha (rodadas anteriores, banco compartilhado): o que
 * importa é o estado FINAL determinístico, não quem chegou primeiro.
 */
async function ensureTestAccount({ email, senha, nome, documentType = "cpf", role = "user" }) {
  const senhaHash = await bcrypt.hash(senha, 10);

  const atualizado = await pool.query(
    `UPDATE users
        SET password_hash = $2, name = $3, document_type = $4, role = $5,
            email_verified = true, document_verified = true, plan = COALESCE(plan, 'free')
      WHERE LOWER(email) = LOWER($1)
      RETURNING id`,
    [email, senhaHash, nome, documentType, role]
  );
  if (atualizado.rows[0]) return String(atualizado.rows[0].id);

  const criado = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type, role, plan,
                        email_verified, document_verified)
     VALUES ($1, $2, $3, $4, $5, 'free', true, true)
     RETURNING id`,
    [email, senhaHash, nome, documentType, role]
  );
  return String(criado.rows[0].id);
}

// --- USERS.A / USERS.B (frontend/e2e/helpers.ts) -----------------------------
//
// Os defaults dos helpers, não valores novos: `testa@carrosnacidade.com` /
// `SenhaTesteA123!`. Inventar outro par aqui só empurraria o problema para o
// dia em que alguém rodasse sem exportar TEST_USER_A_*.
//
// São contas de PESSOA FÍSICA com documento verificado, porque o fluxo que o
// gate protege é justamente cadastro → wizard → publicação, e o gate de
// documento pararia o wizard no primeiro passo.
const CONTAS_FULL_FLOW = [
  { email: "testa@carrosnacidade.com", senha: "SenhaTesteA123!", nome: "E2E Usuário A" },
  { email: "testb@carrosnacidade.com", senha: "SenhaTesteB123!", nome: "E2E Usuário B" },
];

const idsFullFlow = [];
for (const conta of CONTAS_FULL_FLOW) {
  const id = await ensureTestAccount(conta);
  idsFullFlow.push({ ...conta, id });
  // O wizard publica através de um advertiser; sem ele o POST final falha com
  // erro de vínculo, e o teste acusaria "publicação quebrada" sem estar.
  await ensureAdvertiserForUser(id, { cityId: Number(seedCityId), source: "e2e-seed" });
}

// --- Conta administrativa de moderação (BUG-E2E-02) --------------------------
//
// `admin-ad-moderation.spec.ts:22` declara exatamente este par. O spec falhava
// com "login falhou para admin.mod@example.com: 401" — a conta simplesmente
// não existia. `role = 'admin'` é o que `requireAdmin()` exige.
const adminModId = await ensureTestAccount({
  email: "admin.mod@example.com",
  senha: SENHA_PADRAO_TESTE,
  nome: "E2E Admin Moderação",
  role: "admin",
});

// O mesmo spec loga como `cnpj@carrosnacidade.com` com a MESMA senha — os
// lojistas acima são criados com outra. Alinhar aqui evita um 401 no dono.
await pool.query(`UPDATE users SET password_hash = $2 WHERE LOWER(email) = LOWER($1)`, [
  "cnpj@carrosnacidade.com",
  await bcrypt.hash(SENHA_PADRAO_TESTE, 10),
]);

// --- Fotos e estoque da vitrine ---------------------------------------------
//
// Dois problemas distintos, mesma origem:
//
//   • `catalog-city-clean-grid.spec.ts` exige `boxes.length > expected`, com
//     `expected` chegando a 4. Com 3 anúncios em Atibaia, TODOS os casos
//     desktop reprovavam na pré-condição — 11 vermelhos que não falavam sobre
//     o grid, e sim sobre o seed.
//   • `vehicle-detail-premium.spec.ts` esperava galeria, e os 4 anúncios
//     semeados tinham `images = '[]'`.
//
// As imagens apontam para arquivos reais de `frontend/public/` — caminho
// relativo, servido pelo próprio Next. Nada de URL externa: um teste de galeria
// não pode depender de rede de terceiros.
const FOTOS_TESTE = [
  "/images/carro_pagina_simulador.png",
  "/images/banner-simulador-financiamento-desktop.png",
  "/images/banner-simulador-financiamento-mobile.png",
  "/images/pagina-simulador-de-financiamento.png",
  "/images/vender-para-loja.png",
];

/** Dá `quantidade` fotos ao anúncio do slug. 0 = anúncio sem foto (caso real). */
async function setAdImages(slug, quantidade) {
  await pool.query(`UPDATE ads SET images = $2::jsonb, updated_at = NOW() WHERE slug = $1`, [
    slug,
    JSON.stringify(FOTOS_TESTE.slice(0, quantidade)),
  ]);
}

for (const ad of DEALER_ADS) {
  await setAdImages(ad.slug, 3);
}

// Anúncios extras em Atibaia — sobem o estoque da cidade-base de 3 para 8.
// Variedade de marca/modelo/preço é deliberada: um grid de 8 carros idênticos
// esconderia bug de ordenação e de deduplicação.
const ADS_VITRINE = [
  {
    slug: "vw-nivus-comfortline-2022-atibaia-sp-e2e-5",
    title: "Volkswagen Nivus Comfortline 2022",
    brand: "Volkswagen",
    model: "NIVUS COMFORTLINE 1.0 TSI Flex",
    price: 112900,
    year: 2022,
    mileage: 38000,
    body: "suv",
  },
  {
    slug: "fiat-argo-drive-2021-atibaia-sp-e2e-6",
    title: "Fiat Argo Drive 2021",
    brand: "Fiat",
    model: "ARGO DRIVE 1.3 Flex 8V 5p",
    price: 68900,
    year: 2021,
    mileage: 51000,
    body: "hatch",
  },
  {
    slug: "toyota-corolla-xei-2020-atibaia-sp-e2e-7",
    title: "Toyota Corolla XEi 2020",
    brand: "Toyota",
    model: "COROLLA XEi 2.0 Flex 16V Aut.",
    price: 118500,
    year: 2020,
    mileage: 62000,
    body: "sedan",
  },
  {
    slug: "jeep-renegade-longitude-2023-atibaia-sp-e2e-8",
    title: "Jeep Renegade Longitude 2023",
    brand: "Jeep",
    model: "RENEGADE LONGITUDE 1.3 T270 Aut.",
    price: 134900,
    year: 2023,
    mileage: 22000,
    body: "suv",
  },
  {
    slug: "hyundai-hb20-vision-2022-atibaia-sp-e2e-9",
    title: "Hyundai HB20 Vision 2022",
    brand: "Hyundai",
    model: "HB20 VISION 1.0 Flex 12V Mec.",
    price: 74900,
    year: 2022,
    mileage: 44000,
    body: "hatch",
  },
];

const { rows: lojaAtibaiaRows } = await pool.query(
  `SELECT adv.id, adv.city_id
     FROM advertisers adv
     JOIN users u ON u.id = adv.user_id
    WHERE LOWER(u.email) = LOWER($1)
    ORDER BY adv.id ASC
    LIMIT 1`,
  ["cnpj@carrosnacidade.com"]
);
const lojaAtibaia = lojaAtibaiaRows[0];
if (!lojaAtibaia)
  throw new Error("[e2e-seed] Advertiser de cnpj@carrosnacidade.com não encontrado.");

for (const ad of ADS_VITRINE) {
  const tocado = await pool.query(
    `UPDATE ads
        SET advertiser_id = $2, city_id = $3, title = $4, price = $5, brand = $6, model = $7,
            year = $8, mileage = $9, body_type = $10, transmission = 'automatico',
            status = 'active', images = $11::jsonb, updated_at = NOW()
      WHERE slug = $1
      RETURNING id`,
    [
      ad.slug,
      lojaAtibaia.id,
      lojaAtibaia.city_id,
      ad.title,
      ad.price,
      ad.brand,
      ad.model,
      ad.year,
      ad.mileage,
      ad.body,
      JSON.stringify(FOTOS_TESTE.slice(0, 3)),
    ]
  );
  if (tocado.rowCount === 0) {
    await pool.query(
      `INSERT INTO ads (advertiser_id, city_id, title, price, brand, model, year, mileage,
                        body_type, transmission, status, slug, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'automatico', 'active', $10, $11::jsonb)`,
      [
        lojaAtibaia.id,
        lojaAtibaia.city_id,
        ad.title,
        ad.price,
        ad.brand,
        ad.model,
        ad.year,
        ad.mileage,
        ad.body,
        ad.slug,
        JSON.stringify(FOTOS_TESTE.slice(0, 3)),
      ]
    );
  }
}

// --- Os três slugs fixos de `vehicle-detail-premium.spec.ts` -----------------
//
// O spec referencia slugs LITERAIS, herdados de um dataset de produção. Não dá
// para "consertar o locator": ou o ambiente tem esses slugs, ou o spec não roda
// em lugar nenhum a não ser produção — que é justamente onde a suíte não pode
// rodar. Semear os três slugs com conteúdo sintético devolve o teste ao ciclo
// local, e a contagem de fotos (5 / 1 / 0) é o contrato que ele afirma.
const ADS_DETALHE_PREMIUM = [
  {
    slug: "fiat-pulse-audace-1-0-turbo-200-flex-aut-2024-1775233738284",
    title: "Fiat Pulse Audace 1.0 Turbo 200 Flex Aut. 2024",
    brand: "Fiat",
    model: "PULSE AUDACE 1.0 TURBO 200 Flex Aut.",
    price: 119900,
    year: 2024,
    mileage: 18000,
    body: "suv",
    fotos: 5,
  },
  {
    slug: "gm-chevrolet-onix-sedan-plus-ltz-1-0-12v-tb-flex-aut-2025-1775185123098",
    title: "Chevrolet Onix Sedan Plus LTZ 1.0 Turbo 2025",
    brand: "Chevrolet",
    model: "ONIX SEDAN PLUS LTZ 1.0 12V TB Flex Aut.",
    price: 109900,
    year: 2025,
    mileage: 9000,
    body: "sedan",
    fotos: 1,
  },
  {
    slug: "vw-volkswagen-t-cross-200-tsi-1-0-flex-12v-5p-aut-2024-1775008912992",
    title: "Volkswagen T-Cross 200 TSI 1.0 Flex 2024",
    brand: "Volkswagen",
    model: "T-CROSS 200 TSI 1.0 Flex 12V 5p Aut.",
    price: 127900,
    year: 2024,
    mileage: 26000,
    body: "suv",
    fotos: 0,
  },
];

for (const ad of ADS_DETALHE_PREMIUM) {
  const imagens = JSON.stringify(FOTOS_TESTE.slice(0, ad.fotos));
  const tocado = await pool.query(
    `UPDATE ads
        SET advertiser_id = $2, city_id = $3, title = $4, price = $5, brand = $6, model = $7,
            year = $8, mileage = $9, body_type = $10, transmission = 'automatico',
            status = 'active', images = $11::jsonb, updated_at = NOW()
      WHERE slug = $1
      RETURNING id`,
    [
      ad.slug,
      lojaAtibaia.id,
      lojaAtibaia.city_id,
      ad.title,
      ad.price,
      ad.brand,
      ad.model,
      ad.year,
      ad.mileage,
      ad.body,
      imagens,
    ]
  );
  if (tocado.rowCount === 0) {
    await pool.query(
      `INSERT INTO ads (advertiser_id, city_id, title, price, brand, model, year, mileage,
                        body_type, transmission, status, slug, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'automatico', 'active', $10, $11::jsonb)`,
      [
        lojaAtibaia.id,
        lojaAtibaia.city_id,
        ad.title,
        ad.price,
        ad.brand,
        ad.model,
        ad.year,
        ad.mileage,
        ad.body,
        ad.slug,
        imagens,
      ]
    );
  }
}

const { rows: contagemRows } = await pool.query(
  `SELECT COUNT(*)::int AS n
     FROM ads a JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active' AND c.slug = 'atibaia-sp'`
);
const anunciosAtibaia = contagemRows[0]?.n ?? 0;
if (anunciosAtibaia < 6) {
  throw new Error(
    `[e2e-seed] Atibaia ficou com ${anunciosAtibaia} anúncios ativos; a suíte de grid exige ao menos 6.`
  );
}

// --- Marcador de "ambiente E2E preparado" ------------------------------------
//
// Lido por `frontend/playwright.config.ts`, que liga `E2E_SEEDED=1` e, com
// isso, converte SKIP em FAIL no caminho crítico. Sem este arquivo o skip
// continua legítimo (quem não preparou o ambiente não deve ver 30 vermelhos);
// com ele, login que falha é defeito e o CI reprova — que é o ponto.
const contasSemeadas = [
  ...idsFullFlow.map((c) => ({ email: c.email, purpose: "USERS.A/B — full-flow.spec.ts" })),
  { email: "admin.mod@example.com", role: "admin", purpose: "admin-ad-moderation.spec.ts" },
  { email: E2E_EMAIL, documentType: "cpf", purpose: "LOCAL_EMAIL — loginAsLocalUser" },
  { email: "cnpj@carrosnacidade.com", documentType: "cnpj", purpose: "lojista dono/Atibaia" },
];

const marcador = {
  seededAt: new Date().toISOString(),
  databaseUrl: conn,
  accounts: contasSemeadas,
  activeAdsInBaseCity: anunciosAtibaia,
};
const { writeFileSync } = await import("node:fs");
const marcadorPath = path.join(__dirname, "../frontend/e2e/.seed-state.json");
writeFileSync(marcadorPath, `${JSON.stringify(marcador, null, 2)}\n`, "utf8");

await closeDatabasePool();

console.log(
  "[e2e-seed] OK —",
  E2E_EMAIL,
  "+ cidade Atibaia + advertiser + lojistas CNPJ (Atibaia x2/Bragança)",
  `+ ${DEALER_ADS.length} anúncios de estoque (Fase 3)`,
  `+ solicitação de venda #${saleRequestId} com 4 fotos (Fase 4.3)`,
  `+ ${CONTAS_FULL_FLOW.length} contas full-flow (testa/testb)`,
  `+ admin.mod#${adminModId}`,
  `+ ${ADS_VITRINE.length} anúncios de vitrine e ${ADS_DETALHE_PREMIUM.length} de detalhe premium`,
  `= ${anunciosAtibaia} ativos em Atibaia`,
  `| marcador: ${marcadorPath}`
);
