/**
 * Fase 4.9A — A AGENDA PERTENCE À SELEÇÃO, contra PostgreSQL real.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO PRECISA DE UM BANCO DE VERDADE
 * ════════════════════════════════════════════════════════════════════════════
 * Tudo que a 4.9A entrega é UNICIDADE e INTEGRIDADE REFERENCIAL:
 *
 *   UNIQUE (selection_id)                            — uma agenda por match
 *   FK (selection_id, sale_request_id, advertiser_id) — e o match é este mesmo
 *
 * Nenhuma das duas existe no fake: ele é um array, e arrays aceitam qualquer
 * coisa. Um service que esquecesse de amarrar a agenda à seleção passaria
 * inteiro na suíte de unidade e só quebraria em produção, no dia em que a
 * segunda loja tentasse agendar.
 *
 * O cenário que motivou a fase é o §8/§9 daqui: a mesma loja aceita duas vezes,
 * em rodadas diferentes. É o caso que filtrar por `advertiser_id` NÃO cobre —
 * o par (sale_request_id, advertiser_id) casa as duas seleções, e a agenda
 * velha ressurgiria como agenda do match novo.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-inspection-per-selection.integration.test.js
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

const { Pool } = pg;

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `inspsel_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
const upgradeDbName = `inspselup_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

function makeDatabaseUrl(name) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function runMigrations(dbUrl) {
  const entryPath = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

// --- setup ------------------------------------------------------------------

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(upgradeDbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";

const inspectionService = await import(
  "../../src/modules/sale-requests/sale-requests.inspection.service.js"
);
const finalDecisionService = await import(
  "../../src/modules/sale-requests/sale-requests.final-decision.service.js"
);
const handoffService = await import(
  "../../src/modules/sale-requests/sale-requests.handoff.service.js"
);
const selectionService = await import(
  "../../src/modules/sale-requests/sale-requests.selection.service.js"
);
const offersService = await import(
  "../../src/modules/sale-requests/sale-requests.offers.service.js"
);
const ownerService = await import("../../src/modules/sale-requests/sale-requests.service.js");
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

let world;

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_handoff_outcomes, sale_request_owner_final_decisions,
              sale_request_post_inspection_decisions, sale_request_inspection_slots,
              sale_request_inspections, sale_request_offer_selections,
              sale_request_offers, sale_request_rounds, sale_request_images, sale_requests,
              user_notifications, advertisers, users, cities
     RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug)
     VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );

  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@insp.test', 'x', 'Dono', 'cpf'),
            ('other@insp.test', 'x', 'Outro', 'cpf')
     RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@insp.test', 'x', 'Loja A', 'cnpj'),
            ('b@insp.test', 'x', 'Loja B', 'cnpj'),
            ('c@insp.test', 'x', 'Loja C', 'cnpj')
     RETURNING id`
  );

  const advertiserIds = [];
  for (const [index, name] of ["Auto Center", "Prime Veículos", "Garagem Central"].entries()) {
    const { rows } = await pool.query(
      `INSERT INTO advertisers (user_id, name, slug, city_id, status, address, whatsapp)
       VALUES ($1, $2, $3, $4, 'active', 'Rua das Lojas, 120', $5) RETURNING id`,
      [dealerRows[index].id, name, `loja-${index}`, cityRows[0].id, `1199999000${index}`]
    );
    advertiserIds.push(rows[0].id);
  }

  return {
    cityId: cityRows[0].id,
    ownerId: String(ownerRows[0].id),
    otherOwnerId: String(ownerRows[1].id),
    dealerIds: dealerRows.map((row) => String(row.id)),
    advertiserIds,
  };
}

let publishSeq = 0;

async function publishRequest({ minimum = "60000" } = {}) {
  publishSeq += 1;
  const result = await ownerService.createSaleRequest(
    { id: world.ownerId, account_type: "CPF" },
    {
      city_id: world.cityId,
      brand: "Volkswagen",
      fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
      year: "2020",
      mileage: "62000",
      transmission: "automatico",
      fuel_type: "flex",
      declared_condition: "bom",
      minimum_accepted_price: minimum,
      images: [0, 1, 2, 3].map(
        (i) => `sale-requests/${world.ownerId}/ps/2026/08/r${publishSeq}-foto-${i}.webp`
      ),
      tire_condition: "good",
      financing_status: "no",
      fines_status: "no",
      ipva_status: "paid",
      licensing_status: "ok",
      caution_report_status: "not_available",
      auction_history: "no",
      collision_history: "no",
      engine_condition: "ok",
      gearbox_condition: "ok",
      suspension_condition: "ok",
      body_paint_status: "none",
      body_paint_issues: [],
    }
  );
  return String(result.sale_request.id);
}

async function offerFrom(dealerIndex, saleRequestId, amount) {
  await offersService.createSaleOffer(world.dealerIds[dealerIndex], saleRequestId, { amount });
  const { rows } = await pool.query(
    `SELECT id FROM sale_request_offers
      WHERE sale_request_id = $1 AND advertiser_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [saleRequestId, world.advertiserIds[dealerIndex]]
  );
  return String(rows[0].id);
}

async function attempt(fn) {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    return {
      ok: false,
      status: error?.statusCode ?? null,
      code: error?.details?.code ?? null,
      message: error?.message ?? null,
    };
  }
}

const accept = (saleRequestId, offerId, { owner } = {}) =>
  attempt(() =>
    selectionService.selectSaleRequestOffer(owner ?? world.ownerId, saleRequestId, {
      offer_id: String(offerId),
    })
  );

const noAgreement = (saleRequestId, { owner } = {}) =>
  attempt(() => handoffService.reportNoAgreement(owner ?? world.ownerId, saleRequestId));

const openRound = (saleRequestId, minimum, { owner } = {}) =>
  attempt(() =>
    handoffService.openNewRound(owner ?? world.ownerId, saleRequestId, {
      minimum_accepted_price: minimum,
    })
  );

const offerSlots = (dealerIndex, saleRequestId, slots) =>
  attempt(() =>
    inspectionService.offerInspectionSlots(world.dealerIds[dealerIndex], saleRequestId, { slots })
  );

/** Os horários do §19 — sempre no futuro em relação ao relógio real do teste. */
function futureSlots(count = 2) {
  const base = Date.now() + 7 * 24 * 3600 * 1000;
  return Array.from({ length: count }, (_, i) =>
    new Date(base + i * 3600 * 1000).toISOString()
  );
}

async function readInspections(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, selection_id::text AS selection_id,
            advertiser_id::text AS advertiser_id, schedule_status, schedule_round
       FROM sale_request_inspections
      WHERE sale_request_id = $1 ORDER BY id`,
    [saleRequestId]
  );
  return rows;
}

async function readSelections(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, offer_id::text AS offer_id,
            advertiser_id::text AS advertiser_id, round_id::text AS round_id
       FROM sale_request_offer_selections
      WHERE sale_request_id = $1 ORDER BY id`,
    [saleRequestId]
  );
  return rows;
}

async function pgErrorCode(sql, params = []) {
  try {
    await pool.query(sql, params);
    return null;
  } catch (error) {
    return error?.code ?? "unknown";
  }
}

const confirmSlot = (saleRequestId, slotId, { owner } = {}) =>
  attempt(() =>
    inspectionService.confirmInspectionSlot(owner ?? world.ownerId, saleRequestId, {
      slot_id: String(slotId),
    })
  );

const requestNewSlots = (saleRequestId, { owner } = {}) =>
  attempt(() =>
    inspectionService.requestNewInspectionSlots(owner ?? world.ownerId, saleRequestId)
  );

/** Os horários de uma agenda, com a rodada a que pertencem. */
async function readSlots(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT s.id::text AS id, s.inspection_id::text AS inspection_id,
            s.round_no, i.selection_id::text AS selection_id,
            i.advertiser_id::text AS advertiser_id
       FROM sale_request_inspection_slots s
       JOIN sale_request_inspections i ON i.id = s.inspection_id
      WHERE i.sale_request_id = $1
      ORDER BY s.id`,
    [saleRequestId]
  );
  return rows;
}

/**
 * Fotografia COMPLETA do estado de agendamento.
 *
 * Serve às asserções de "nada mudou": comparar contagens engana quando um UPDATE
 * altera uma linha sem criar outra — `schedule_round`, `confirmed_slot_id` e
 * `schedule_status` são exatamente os campos que um writer indevido mexeria sem
 * mudar contagem nenhuma.
 */
async function snapshotAgenda(saleRequestId) {
  return JSON.stringify({
    inspecoes: await readInspections(saleRequestId),
    slots: await readSlots(saleRequestId),
  });
}

/** Leva a solicitação até "Loja `dealerIndex` aceita, e agendou". */
async function acceptAndSchedule(dealerIndex, saleRequestId, offerId) {
  const accepted = await accept(saleRequestId, offerId);
  expect(accepted.ok, "aceite").toBe(true);
  const scheduled = await offerSlots(dealerIndex, saleRequestId, futureSlots());
  expect(scheduled.ok, `agenda da loja ${dealerIndex}`).toBe(true);
  return scheduled;
}

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(upgradeDbName)} WITH (FORCE)`);
  await adminPool.end().catch(() => {});
});

// ============================================================================
describe.sequential("integração — o SCHEMA da migration 061 (§1)", () => {
  it("a coluna existe, é NOT NULL, e a antiga unicidade por solicitação saiu", async () => {
    const { rows: column } = await pool.query(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'sale_request_inspections' AND column_name = 'selection_id'`
    );
    expect(column).toHaveLength(1);
    expect(column[0].data_type).toBe("bigint");
    expect(column[0].is_nullable).toBe("NO");

    const { rows: antigo } = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'sale_request_inspections_request_uidx'`
    );
    expect(antigo, "UNIQUE(sale_request_id) tinha de ter saído").toHaveLength(0);
  });

  it("UNIQUE (selection_id) e a FK de TRÊS colunas estão declaradas (§13)", async () => {
    const { rows: unico } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE indexname = 'sale_request_inspections_selection_uidx'`
    );
    expect(unico).toHaveLength(1);
    expect(unico[0].indexdef).toMatch(/UNIQUE INDEX .* \(selection_id\)/);

    const { rows: fk } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_inspections_selection_fk'`
    );
    expect(fk).toHaveLength(1);
    // As três colunas viajam juntas: solicitação E loja, não só a seleção.
    expect(fk[0].def).toMatch(
      /FOREIGN KEY \(selection_id, sale_request_id, advertiser_id\) REFERENCES sale_request_offer_selections\(id, sale_request_id, advertiser_id\)/
    );
  });

  it("a ficha e a proposta final NÃO foram tocadas", async () => {
    // A 4.9A devolve a agenda, e só ela. Se um dia alguém aproveitar a migration
    // para "limpar" as colunas observadas, este teste acusa.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'sale_request_inspections' AND column_name LIKE 'observed_%'`
    );
    expect(rows[0].n).toBeGreaterThan(0);

    for (const table of [
      "sale_request_post_inspection_decisions",
      "sale_request_owner_final_decisions",
    ]) {
      const { rows: t } = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      expect(t, table).toHaveLength(1);
    }
  });
});

// ============================================================================
describe.sequential("integração — UPGRADE 060 → 061 sobre banco POVOADO (§2)", () => {
  /**
   * O teste do backfill, e é o único lugar onde ele pode ser provado: exige uma
   * inspeção LEGADA, criada quando `selection_id` não existia.
   *
   * O roteiro desfaz a 061 no banco de upgrade, insere a linha legada do jeito
   * que a 4.5 inseria, e reaplica.
   */
  it("a inspeção legada recebe a seleção histórica correta, e a unicidade troca", async () => {
    const upgradeUrl = makeDatabaseUrl(upgradeDbName);
    await runMigrations(upgradeUrl);

    const up = new Pool(buildPoolConfig(upgradeUrl));
    try {
      // 1. Desfaz a 061 — o banco volta ao estado exato da 4.8.
      await up.query(`DROP INDEX IF EXISTS sale_request_inspections_selection_uidx`);
      await up.query(
        `ALTER TABLE sale_request_inspections
           DROP CONSTRAINT IF EXISTS sale_request_inspections_selection_fk`
      );
      await up.query(`ALTER TABLE sale_request_inspections DROP COLUMN IF EXISTS selection_id`);
      await up.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS sale_request_inspections_request_uidx
           ON sale_request_inspections (sale_request_id)`
      );
      await up.query(`DELETE FROM schema_migrations WHERE filename LIKE '061%'`);

      // 2. Povoa como a 4.5 povoava: solicitação, rodada, oferta, seleção e a
      //    inspeção SEM vínculo com a seleção.
      const { rows: city } = await up.query(
        `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-up')
         RETURNING id`
      );
      const { rows: owner } = await up.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('o@up.test', 'x', 'Dono', 'cpf') RETURNING id`
      );
      const { rows: dealer } = await up.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('d@up.test', 'x', 'Loja', 'cnpj') RETURNING id`
      );
      const { rows: adv } = await up.query(
        `INSERT INTO advertisers (user_id, name, slug, city_id, status, address, whatsapp)
         VALUES ($1, 'Auto Up', 'auto-up', $2, 'active', 'Rua X, 1', '11999990000')
         RETURNING id`,
        [dealer[0].id, city[0].id]
      );
      const { rows: sr } = await up.query(
        `INSERT INTO sale_requests
           (owner_user_id, city_id, brand, brand_slug, model, model_slug,
            fipe_model_description, year, mileage, transmission, fuel_type,
            declared_condition, status, current_round_number)
         VALUES ($1, $2, 'VW', 'vw', 'T-Cross', 't-cross',
                 'T-Cross 200 TSI', 2020, 62000, 'automatico', 'flex',
                 'bom', 'receiving_offers', 1)
         RETURNING id`,
        [owner[0].id, city[0].id]
      );
      const { rows: round } = await up.query(
        `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
         VALUES ($1, 1, 60000.00) RETURNING id`,
        [sr[0].id]
      );
      const { rows: offer } = await up.query(
        `INSERT INTO sale_request_offers
           (sale_request_id, round_id, dealer_user_id, advertiser_id, amount)
         VALUES ($1, $2, $3, $4, 65000.00) RETURNING id`,
        [sr[0].id, round[0].id, dealer[0].id, adv[0].id]
      );
      const { rows: sel } = await up.query(
        `INSERT INTO sale_request_offer_selections
           (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id,
            amount_snapshot)
         VALUES ($1, $2, $3, $4, $5, 65000.00) RETURNING id`,
        [sr[0].id, round[0].id, offer[0].id, adv[0].id, owner[0].id]
      );
      await up.query(
        `UPDATE sale_requests
            SET status = 'offer_selected',
                selected_offer_id = $2,
                selected_offer_at = NOW()
          WHERE id = $1`,
        [sr[0].id, offer[0].id]
      );
      const { rows: insp } = await up.query(
        `INSERT INTO sale_request_inspections
           (sale_request_id, advertiser_id, schedule_status, schedule_round,
            scheduled_at, created_by_user_id)
         VALUES ($1, $2, 'awaiting_slots', 0, NULL, $3) RETURNING id`,
        [sr[0].id, adv[0].id, dealer[0].id]
      );

      // 3. Reaplica a 061 sobre o banco povoado.
      await runMigrations(upgradeUrl);

      // 4. O backfill acertou a seleção — e não "uma qualquer".
      const { rows: depois } = await up.query(
        `SELECT selection_id::text AS selection_id FROM sale_request_inspections WHERE id = $1`,
        [insp[0].id]
      );
      expect(depois[0].selection_id).toBe(String(sel[0].id));

      // 5. E a unicidade trocou de dono, sem perder linha nenhuma.
      const { rows: idx } = await up.query(
        `SELECT indexname FROM pg_indexes
          WHERE tablename = 'sale_request_inspections'
            AND indexname IN ('sale_request_inspections_request_uidx',
                              'sale_request_inspections_selection_uidx')`
      );
      const nomes = idx.map((r) => r.indexname);
      expect(nomes).toContain("sale_request_inspections_selection_uidx");
      expect(nomes).not.toContain("sale_request_inspections_request_uidx");

      const { rows: total } = await up.query(
        `SELECT count(*)::int AS n FROM sale_request_inspections`
      );
      expect(total[0].n).toBe(1);
    } finally {
      await up.end().catch(() => {});
    }
  });
});

// ============================================================================
describe.sequential("integração — o ciclo A → não houve acordo → B (§3 a §7)", () => {
  it("a Loja B agenda a PRÓPRIA avaliação, e a agenda da Loja A não reaparece", async () => {
    const saleRequestId = await publishRequest();
    // Ordem CRESCENTE: cada proposta tem de superar a maior atual (§10 da 4.4).
    // A menor entra primeiro, e depois é a MAIOR que o proprietário aceita — o
    // que também deixa a resseleção cair na menor, como na vida real.
    const offerB = await offerFrom(1, saleRequestId, "63500");
    const offerA = await offerFrom(0, saleRequestId, "65000");

    // §3 — Loja A é aceita e agenda.
    await acceptAndSchedule(0, saleRequestId, offerA);

    const depoisDeA = await readInspections(saleRequestId);
    expect(depoisDeA).toHaveLength(1);
    expect(depoisDeA[0].advertiser_id).toBe(String(world.advertiserIds[0]));

    // §4 — não houve acordo.
    expect((await noAgreement(saleRequestId)).ok).toBe(true);

    // §5 e §6 — Loja B é aceita e agenda a dela. Antes da 061 este INSERT
    // morria com 23505: o índice era por solicitação.
    await acceptAndSchedule(1, saleRequestId, offerB);

    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes, "duas agendas, uma por match").toHaveLength(2);

    const selecoes = await readSelections(saleRequestId);
    expect(selecoes).toHaveLength(2);
    expect(inspecoes.map((i) => i.selection_id).sort()).toEqual(
      selecoes.map((s) => s.id).sort()
    );

    // §7 — a leitura do proprietário devolve a agenda do match ATUAL (B), e
    // nunca a de A. É o teste que a modelagem antiga não conseguia passar.
    const dto = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    const agendaA = inspecoes.find(
      (i) => i.advertiser_id === String(world.advertiserIds[0])
    );
    const agendaB = inspecoes.find(
      (i) => i.advertiser_id === String(world.advertiserIds[1])
    );
    expect(String(dto.inspection?.store?.name ?? "")).toBe("Prime Veículos");
    expect(agendaA.id).not.toBe(agendaB.id);
  });
});

// ============================================================================
describe.sequential("integração — a MESMA loja aceita de novo, noutra rodada (§8 a §10)", () => {
  /**
   * O caso que filtrar por `advertiser_id` não cobre.
   *
   * Loja A aceita na rodada 1, agenda, não fecha. Nova rodada. Loja A oferta e é
   * aceita OUTRA VEZ. O par (sale_request_id, advertiser_id) agora casa DUAS
   * seleções — e a agenda da rodada 1 não pode ser reaproveitada nem lida como
   * se fosse do match novo.
   */
  it("a agenda da rodada 1 não é reaproveitada; a seleção nova ganha a sua", async () => {
    const saleRequestId = await publishRequest({ minimum: "62500" });
    const offerA1 = await offerFrom(0, saleRequestId, "65000");

    await acceptAndSchedule(0, saleRequestId, offerA1);
    const agendaRodada1 = (await readInspections(saleRequestId))[0];

    expect((await noAgreement(saleRequestId)).ok).toBe(true);
    expect((await openRound(saleRequestId, "58000")).ok).toBe(true);

    // §8 — a MESMA loja oferta e é aceita de novo, agora na rodada 2.
    const offerA2 = await offerFrom(0, saleRequestId, "58000");
    expect(offerA2).not.toBe(offerA1);
    await acceptAndSchedule(0, saleRequestId, offerA2);

    const selecoes = await readSelections(saleRequestId);
    expect(selecoes, "duas seleções da MESMA loja").toHaveLength(2);
    expect(new Set(selecoes.map((s) => s.advertiser_id)).size).toBe(1);

    // §9 e §10 — duas agendas distintas, uma por seleção. A da rodada 1
    // continua existindo (histórico), mas não é a do match atual.
    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes).toHaveLength(2);
    expect(inspecoes[0].id).not.toBe(inspecoes[1].id);
    expect(inspecoes[0].selection_id).not.toBe(inspecoes[1].selection_id);

    const agendaRodada2 = inspecoes.find((i) => i.id !== agendaRodada1.id);
    expect(agendaRodada2.selection_id).toBe(selecoes[1].id);

    // A agenda velha continua pendurada na seleção velha — intacta, e fora do
    // caminho da leitura vigente.
    const relida = inspecoes.find((i) => i.id === agendaRodada1.id);
    expect(relida.selection_id).toBe(selecoes[0].id);
  });
});

// ============================================================================
describe.sequential("integração — o que o BANCO recusa (§11, §12, §13)", () => {
  it("§11 — inspeção não pode apontar seleção de OUTRA solicitação", async () => {
    const requestA = await publishRequest();
    const offerA = await offerFrom(0, requestA, "65000");
    // Aceita SEM agendar: com agenda, o UNIQUE(selection_id) dispararia antes da
    // FK e o teste provaria a constraint errada.
    expect((await accept(requestA, offerA)).ok).toBe(true);

    const requestB = await publishRequest();
    const offerB = await offerFrom(1, requestB, "63500");
    expect((await accept(requestB, offerB)).ok).toBe(true);

    const selecaoDeA = (await readSelections(requestA))[0];

    // A seleção existe — mas é de outra solicitação. A FK composta recusa.
    const code = await pgErrorCode(
      `INSERT INTO sale_request_inspections
         (sale_request_id, selection_id, advertiser_id, schedule_status, schedule_round,
          created_by_user_id)
       VALUES ($1, $2, $3, 'awaiting_slots', 0, $4)`,
      [requestB, selecaoDeA.id, world.advertiserIds[1], world.dealerIds[1]]
    );
    expect(code, "violação de FK esperada").toBe("23503");
  });

  it("§12 — inspeção não pode apontar seleção de OUTRA loja", async () => {
    const saleRequestId = await publishRequest();
    await offerFrom(1, saleRequestId, "63500");
    const offerA = await offerFrom(0, saleRequestId, "65000");
    expect((await accept(saleRequestId, offerA)).ok).toBe(true);

    const selecao = (await readSelections(saleRequestId))[0];
    expect(selecao.advertiser_id).toBe(String(world.advertiserIds[0]));

    // Mesma solicitação, mesma seleção — mas declarando a loja B. É exatamente
    // o que a terceira coluna da FK existe para impedir.
    const code = await pgErrorCode(
      `INSERT INTO sale_request_inspections
         (sale_request_id, selection_id, advertiser_id, schedule_status, schedule_round,
          created_by_user_id)
       VALUES ($1, $2, $3, 'awaiting_slots', 0, $4)`,
      [saleRequestId, selecao.id, world.advertiserIds[1], world.dealerIds[1]]
    );
    expect(code, "violação de FK esperada").toBe("23503");
  });

  it("§13 — a MESMA seleção não pode ter duas agendas", async () => {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    await acceptAndSchedule(0, saleRequestId, offerA);

    const selecao = (await readSelections(saleRequestId))[0];

    const code = await pgErrorCode(
      `INSERT INTO sale_request_inspections
         (sale_request_id, selection_id, advertiser_id, schedule_status, schedule_round,
          created_by_user_id)
       VALUES ($1, $2, $3, 'awaiting_slots', 0, $4)`,
      [saleRequestId, selecao.id, world.advertiserIds[0], world.dealerIds[0]]
    );
    expect(code, "violação de unicidade esperada").toBe("23505");
  });
});

// ============================================================================
describe.sequential("integração — concorrência na criação da agenda (§14)", () => {
  /**
   * Duas rodadas de horários da MESMA loja, ao mesmo tempo.
   *
   * O lock da solicitação deveria serializar as duas; o `ON CONFLICT
   * (selection_id)` é a rede embaixo dele. O que NÃO pode acontecer é o banco
   * terminar com duas agendas para o mesmo match — nem uma das chamadas morrer
   * com erro de constraint em vez de resposta de domínio.
   */
  it("duas tentativas simultâneas produzem UMA agenda, e nenhum erro de constraint", async () => {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    expect((await accept(saleRequestId, offerA)).ok).toBe(true);

    const [primeira, segunda] = await Promise.all([
      offerSlots(0, saleRequestId, futureSlots()),
      offerSlots(0, saleRequestId, futureSlots(3)),
    ]);

    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes, "exatamente uma agenda para o match").toHaveLength(1);

    for (const [nome, resultado] of [
      ["primeira", primeira],
      ["segunda", segunda],
    ]) {
      if (!resultado.ok) {
        // Recusa de DOMÍNIO é aceitável; vazamento de erro do PostgreSQL não.
        expect(String(resultado.code ?? ""), nome).not.toMatch(/^23\d{3}$/);
        expect(String(resultado.message ?? ""), nome).not.toMatch(/duplicate key|constraint/i);
      }
    }
  });
});

// ============================================================================
describe.sequential("integração — a LEITURA segue o ponteiro do match (§15)", () => {
  it("a agenda lida acompanha a seleção ATUAL, e nunca volta para a anterior", async () => {
    const saleRequestId = await publishRequest();
    const offerB = await offerFrom(1, saleRequestId, "63500");
    const offerA = await offerFrom(0, saleRequestId, "65000");

    await acceptAndSchedule(0, saleRequestId, offerA);
    const comA = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(comA.inspection?.store?.name).toBe("Auto Center");

    expect((await noAgreement(saleRequestId)).ok).toBe(true);
    await acceptAndSchedule(1, saleRequestId, offerB);

    // O ponteiro moveu para B, então a agenda lida é a de B. Esta é a asserção
    // que a modelagem antiga não conseguia passar: com UNIQUE(sale_request_id)
    // a segunda agenda nem existiria, e a leitura devolveria a da Loja A.
    const comB = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(comB.inspection?.store?.name).toBe("Prime Veículos");

    // E as duas continuam no banco: trocar de match não apaga histórico.
    expect(await readInspections(saleRequestId)).toHaveLength(2);
  });

  /**
   * O caso que DETECTA uma leitura não escopada — de forma determinística.
   *
   * Só a Loja A tem agenda. Depois do "não houve acordo", a Loja B vira o match
   * e ainda NÃO agendou. Existe exatamente UMA linha em
   * `sale_request_inspections`, e ela é da Loja A.
   *
   * Uma leitura escopada pela seleção devolve `null` — B não tem agenda.
   * Uma leitura por `sale_request_id` devolve a agenda da Loja A, porque é a
   * única linha que existe. Não há ambiguidade de ordem física para mascarar o
   * defeito, e é por isso que este teste está aqui e o de cima não basta: com
   * duas linhas, um `LIMIT 1` sem `ORDER BY` acerta por sorte metade das vezes.
   */
  it("match novo sem agenda devolve NULL — e não a agenda da loja anterior", async () => {
    const saleRequestId = await publishRequest();
    const offerB = await offerFrom(1, saleRequestId, "63500");
    const offerA = await offerFrom(0, saleRequestId, "65000");

    await acceptAndSchedule(0, saleRequestId, offerA);
    expect((await noAgreement(saleRequestId)).ok).toBe(true);

    // Loja B é aceita, mas NÃO agenda.
    expect((await accept(saleRequestId, offerB)).ok).toBe(true);

    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes, "só a agenda da Loja A existe").toHaveLength(1);
    expect(inspecoes[0].advertiser_id).toBe(String(world.advertiserIds[0]));

    const dto = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(dto.inspection ?? null, "a agenda da Loja A não pode vazar para o match da B").toBeNull();
  });

  /**
   * O COMPORTAMENTO EM `handoff_failed`, fixado de propósito.
   *
   * A 4.7 decidiu NÃO mexer em `selected_offer_id` quando o proprietário informa
   * que não houve acordo: o ponteiro continua na oferta que falhou, porque é ela
   * que a tela nomeia enquanto ele decide o que fazer
   * (`moveRequestStatus`, sale-requests.handoff.repository.js).
   *
   * Consequência direta para a 4.9A: a seleção "atual" nesse estado é a que
   * falhou, e a agenda que o DTO devolve é a dela. Não é bug — é o ponteiro
   * fazendo o que a 4.7 mandou —, mas é uma armadilha para a 4.9B: a tela NÃO
   * pode renderizar "avaliação agendada" ao lado de "não houve acordo".
   *
   * Este teste existe para que essa consequência seja visível e não mude em
   * silêncio. Se um dia o ponteiro passar a ser limpo, ele acusa.
   */
  it("em handoff_failed o ponteiro (e a agenda) continuam na seleção que falhou", async () => {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    await acceptAndSchedule(0, saleRequestId, offerA);

    expect((await noAgreement(saleRequestId)).ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT status, selected_offer_id::text AS selected_offer_id
         FROM sale_requests WHERE id = $1`,
      [saleRequestId]
    );
    expect(rows[0].status).toBe("handoff_failed");
    expect(rows[0].selected_offer_id, "a 4.7 mantém o ponteiro").toBe(String(offerA));

    const dto = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(dto.inspection?.store?.name).toBe("Auto Center");
  });
});

// ============================================================================
describe.sequential("integração — os writers aposentados continuam 409 (§16)", () => {
  it("ficha e proposta final recusam, mesmo com a agenda de volta", async () => {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    await acceptAndSchedule(0, saleRequestId, offerA);

    const writers = [
      [
        "completeInspection",
        () =>
          inspectionService.completeInspection(world.dealerIds[0], saleRequestId, {
            observed_mileage: "64230",
          }),
      ],
      [
        "submitPostInspectionDecision",
        () =>
          inspectionService.submitPostInspectionDecision(world.dealerIds[0], saleRequestId, {
            decision_type: "final_offer",
            final_amount: "60000",
          }),
      ],
      [
        "decideFinalOffer",
        () =>
          finalDecisionService.decideFinalOffer(world.ownerId, saleRequestId, {
            decision: "accepted",
          }),
      ],
    ];

    for (const [name, run] of writers) {
      const result = await attempt(run);
      expect(result.ok, name).toBe(false);
      expect(result.status, name).toBe(409);
      expect(result.code, name).toBe("SALE_REQUEST_LEGACY_FLOW_RETIRED");
    }

    // E nada foi observado: a ficha continua em branco.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM sale_request_inspections
        WHERE sale_request_id = $1 AND observed_mileage IS NOT NULL`,
      [saleRequestId]
    );
    expect(rows[0].n).toBe(0);
  });
});

// ============================================================================
// FASE 4.9A — CHECAGEM DE AUTORIZAÇÃO
//
// Uma seleção encerrada por `no_agreement` é HISTÓRICA. Ela continua armazenada
// e auditável, mas não pode continuar ESCREVENDO agenda — e isso tem de valer
// mesmo enquanto `selected_offer_id` ainda aponta para a oferta que falhou,
// porque a 4.7 mantém o ponteiro de propósito enquanto o proprietário decide.
// ============================================================================

describe.sequential("integração — match encerrado NÃO escreve agenda (§2, §6)", () => {
  /**
   * O cenário sem saída: A aceita, agenda, confirma, e não houve acordo. Não há
   * Loja B, não há rodada nova. O ponteiro continua em A.
   */
  async function cenarioEncerrado() {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    expect((await accept(saleRequestId, offerA)).ok).toBe(true);
    expect((await offerSlots(0, saleRequestId, futureSlots())).ok).toBe(true);

    const slots = await readSlots(saleRequestId);
    expect(slots.length).toBeGreaterThan(0);

    // O horário NÃO é confirmado aqui, e isso não é conveniência de teste: o
    // `reportNoAgreement` da 4.7 exige `offer_selected`, e confirmar levaria a
    // solicitação a `inspection_scheduled`, de onde ela não consegue mais ser
    // encerrada. Esse beco está fixado no teste logo abaixo.
    expect((await noAgreement(saleRequestId)).ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT status, selected_offer_id::text AS selected_offer_id
         FROM sale_requests WHERE id = $1`,
      [saleRequestId]
    );
    expect(rows[0].status).toBe("handoff_failed");
    // A premissa do §1: o ponteiro NÃO foi limpo.
    expect(rows[0].selected_offer_id).toBe(String(offerA));

    return { saleRequestId, offerA, slots };
  }

  it("os TRÊS writers da agenda são recusados, e nada no banco muda", async () => {
    const { saleRequestId, slots } = await cenarioEncerrado();
    const antes = await snapshotAgenda(saleRequestId);

    // Os códigos são os que o módulo JÁ usava para "o estado não permite" — o
    // §3 pede reutilizar em vez de inventar vocabulário novo.
    const tentativas = [
      [
        "offerInspectionSlots",
        await offerSlots(0, saleRequestId, futureSlots(3)),
        "INSPECTION_INVALID_STATE",
      ],
      [
        "requestNewInspectionSlots",
        await requestNewSlots(saleRequestId),
        "INSPECTION_INVALID_STATE",
      ],
      [
        "confirmInspectionSlot",
        await confirmSlot(saleRequestId, (slots[1] ?? slots[0]).id),
        "INSPECTION_ALREADY_SCHEDULED",
      ],
    ];

    for (const [nome, resultado, codigo] of tentativas) {
      expect(resultado.ok, `${nome} devia ser recusado`).toBe(false);
      expect(resultado.status, nome).toBe(409);
      expect(resultado.code, nome).toBe(codigo);
      // Recusa de DOMÍNIO, e não erro de constraint vazando do PostgreSQL.
      expect(String(resultado.code ?? ""), nome).not.toMatch(/^23\d{3}$/);
    }

    expect(await snapshotAgenda(saleRequestId), "nada podia ter mudado").toBe(antes);
  });

  /**
   * ACHADO DA CHECAGEM — o beco que a 4.9A reabre.
   *
   * `reportNoAgreement` (4.7) exige `offer_selected`. Confirmar um horário leva
   * a solicitação a `inspection_scheduled` — e de lá o proprietário NÃO consegue
   * mais informar que não houve acordo, nem aceitar outra oferta, nem abrir
   * rodada nova.
   *
   * Enquanto os três writers da agenda estavam aposentados, `inspection_scheduled`
   * era inalcançável e o beco não existia na prática. A 4.9A devolve a agenda e,
   * com ela, o caminho até esse estado.
   *
   * NÃO corrigido aqui: o §16 desta checagem proíbe alterar `no_agreement`, e a
   * decisão de quais estados encerram um handoff é de produto. Este teste FIXA o
   * comportamento para que a decisão seja tomada de olhos abertos — e falha no
   * dia em que alguém mudar a regra sem querer.
   */
  it("ACHADO — com horário confirmado, o handoff não pode mais ser encerrado", async () => {
    const saleRequestId = await publishRequest();
    const offerA = await offerFrom(0, saleRequestId, "65000");
    expect((await accept(saleRequestId, offerA)).ok).toBe(true);
    expect((await offerSlots(0, saleRequestId, futureSlots())).ok).toBe(true);

    const slots = await readSlots(saleRequestId);
    expect((await confirmSlot(saleRequestId, slots[0].id)).ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT status FROM sale_requests WHERE id = $1`,
      [saleRequestId]
    );
    expect(rows[0].status).toBe("inspection_scheduled");

    const encerrar = await noAgreement(saleRequestId);
    expect(encerrar.ok, "hoje NÃO é possível — é o achado").toBe(false);
    expect(encerrar.code).toBe("SALE_REQUEST_HANDOFF_NOT_ACTIVE");
  });

  it("§6 — a agenda encerrada continua presa à seleção que falhou", async () => {
    const { saleRequestId } = await cenarioEncerrado();

    // A linha continua no banco — aposentar o match não apaga histórico.
    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes).toHaveLength(1);

    const selecoes = await readSelections(saleRequestId);
    expect(inspecoes[0].selection_id).toBe(selecoes[0].id);
  });
});

// ============================================================================
describe.sequential("integração — A encerrada × B ativa (§4)", () => {
  it("a Loja A não escreve mais nada; a Loja B opera normalmente", async () => {
    const saleRequestId = await publishRequest();
    const offerB = await offerFrom(1, saleRequestId, "63500");
    const offerA = await offerFrom(0, saleRequestId, "65000");

    await acceptAndSchedule(0, saleRequestId, offerA);
    expect((await noAgreement(saleRequestId)).ok).toBe(true);

    // A Loja B passa a ser o match.
    expect((await accept(saleRequestId, offerB)).ok).toBe(true);

    const antesDeA = await snapshotAgenda(saleRequestId);

    // ── A LOJA A: recusada ────────────────────────────────────────────────
    const aSlots = await offerSlots(0, saleRequestId, futureSlots());
    expect(aSlots.ok, "a loja anterior não propõe horários").toBe(false);

    expect(await snapshotAgenda(saleRequestId), "a Loja A não escreveu nada").toBe(antesDeA);

    // ── A LOJA B: opera ───────────────────────────────────────────────────
    const bSlots = await offerSlots(1, saleRequestId, futureSlots());
    expect(bSlots.ok, "a loja aceita propõe horários").toBe(true);

    const slots = await readSlots(saleRequestId);
    const selecoes = await readSelections(saleRequestId);
    const selecaoA = selecoes[0];
    const selecaoB = selecoes[1];

    // Os horários de cada loja ficam presos à SUA seleção. Nunca cruzam.
    const slotsDeA = slots.filter((s) => s.advertiser_id === String(world.advertiserIds[0]));
    const slotsDeB = slots.filter((s) => s.advertiser_id === String(world.advertiserIds[1]));
    expect(slotsDeA.length).toBeGreaterThan(0);
    expect(slotsDeB.length).toBeGreaterThan(0);
    for (const s of slotsDeA) expect(s.selection_id).toBe(selecaoA.id);
    for (const s of slotsDeB) expect(s.selection_id).toBe(selecaoB.id);

    // O proprietário confirma um horário — e ele é da Loja B.
    const escolhido = slotsDeB[0];
    expect((await confirmSlot(saleRequestId, escolhido.id)).ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT i.advertiser_id::text AS advertiser_id
         FROM sale_request_inspections i
        WHERE i.sale_request_id = $1 AND i.confirmed_slot_id IS NOT NULL`,
      [saleRequestId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].advertiser_id).toBe(String(world.advertiserIds[1]));
  });
});

// ============================================================================
describe.sequential("integração — A → rodada 2 → A de novo (§5)", () => {
  it("A1 não reaparece; A2 recebe agenda própria; a leitura devolve só A2", async () => {
    const saleRequestId = await publishRequest({ minimum: "62500" });
    const offerA1 = await offerFrom(0, saleRequestId, "65000");

    await acceptAndSchedule(0, saleRequestId, offerA1);
    const agendaA1 = (await readInspections(saleRequestId))[0];

    expect((await noAgreement(saleRequestId)).ok).toBe(true);
    expect((await openRound(saleRequestId, "58000")).ok).toBe(true);

    // A MESMA loja oferta de novo. Sem aceite, ainda não pode agendar.
    const offerA2 = await offerFrom(0, saleRequestId, "58000");
    const semAceite = await offerSlots(0, saleRequestId, futureSlots());
    expect(semAceite.ok, "sem aceite não há agenda").toBe(false);

    expect((await accept(saleRequestId, offerA2)).ok).toBe(true);
    expect((await offerSlots(0, saleRequestId, futureSlots())).ok).toBe(true);

    const selecoes = await readSelections(saleRequestId);
    expect(selecoes, "duas seleções da MESMA loja").toHaveLength(2);
    expect(new Set(selecoes.map((s) => s.advertiser_id)).size).toBe(1);

    const inspecoes = await readInspections(saleRequestId);
    expect(inspecoes, "duas agendas — UNIQUE(selection_id) permite").toHaveLength(2);

    const agendaA2 = inspecoes.find((i) => i.id !== agendaA1.id);
    expect(agendaA2.selection_id).toBe(selecoes[1].id);
    expect(inspecoes.find((i) => i.id === agendaA1.id).selection_id).toBe(selecoes[0].id);

    // A leitura da agenda VIGENTE devolve A2, e só ela. O discriminador é o id:
    // não depende do sub-estado da agenda, que pode coincidir entre as duas.
    const { rows } = await pool.query(
      `SELECT i.id::text AS id
         FROM sale_requests sr
         JOIN sale_request_offer_selections s
           ON s.sale_request_id = sr.id AND s.offer_id = sr.selected_offer_id
         JOIN sale_request_inspections i ON i.selection_id = s.id
        WHERE sr.id = $1`,
      [saleRequestId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id, "a agenda vigente é a da rodada 2").toBe(agendaA2.id);
    expect(rows[0].id).not.toBe(agendaA1.id);
  });
});
