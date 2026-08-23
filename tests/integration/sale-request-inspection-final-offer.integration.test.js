import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * A AVALIAÇÃO PRESENCIAL e a PROPOSTA FINAL sob PostgreSQL real (Fase 4.5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ════════════════════════════════════════════════════════════════════════════
 * O teste de service roda contra um array em memória com uma "conexão" só. Ele
 * prova a REGRA (quem pode fazer o quê, o que é recusado, o que não vaza) e não
 * consegue provar nada sobre SERIALIZAÇÃO nem sobre os CHECKs do banco.
 *
 * Os defeitos que este arquivo caça só existem com PostgreSQL de verdade:
 *
 *   §43  o CHECK de coerência da 057, que usava `status <> 'offer_selected'` e
 *        rejeitaria TODOS os estados novos. Sem a reescrita da 058, a fase não
 *        avança uma transição sequer — e um banco VAZIO não revela isso, porque
 *        não há linha para violar o CHECK;
 *
 *   §13  o proprietário confirmando um horário da rodada 1 enquanto a loja
 *        publica a rodada 2;
 *
 *   §37  duas decisões comerciais simultâneas — dois valores, ou proposta contra
 *        desistência;
 *
 *   §29  a integridade composta: uma decisão que mistura peças válidas de
 *        negócios diferentes.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS SERVICES DE VERDADE, NÃO UMA RÉPLICA EM SQL
 * ════════════════════════════════════════════════════════════════════════════
 * O teste importa os services e os executa contra este banco. Escrever o
 * BEGIN/SELECT/UPDATE à mão provaria que o PostgreSQL sabe travar linha — que
 * ninguém duvida — e continuaria passando no dia em que alguém removesse a
 * transação do service.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-inspection-final-offer.integration.test.js
 */

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `saleinspect_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
/** Segundo banco, só para o cenário de UPGRADE 057 → 058 (§43). */
const upgradeDbName = `saleinspectup_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

// ORDEM CRÍTICA: o pool de `db.js` é construído no load do módulo.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";

const inspectionService = await import(
  "../../src/modules/sale-requests/sale-requests.inspection.service.js"
);
const selectionService = await import(
  "../../src/modules/sale-requests/sale-requests.selection.service.js"
);
const offersService = await import(
  "../../src/modules/sale-requests/sale-requests.offers.service.js"
);
const ownerService = await import("../../src/modules/sale-requests/sale-requests.service.js");
const dealerService = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.service.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

let world;

/** Instante futuro em ISO COM offset — o formato que o servidor exige. */
function futureIso(hoursAhead, offset = "-03:00") {
  const date = new Date(Date.now() + hoursAhead * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00${offset}`;
}

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_post_inspection_decisions, sale_request_inspection_slots,
              sale_request_inspections, sale_request_offer_selections,
              sale_request_offers, sale_request_images, sale_requests,
              user_notifications, advertisers, users, cities
     RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug)
     VALUES ('Atibaia', 'SP', 'atibaia-sp'), ('Bragança Paulista', 'SP', 'braganca-paulista-sp')
     RETURNING id`
  );

  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@inspect.test', 'x', 'Dono', 'cpf'),
            ('other@inspect.test', 'x', 'Outro', 'cpf')
     RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@inspect.test', 'x', 'Loja A', 'cnpj'),
            ('b@inspect.test', 'x', 'Loja B', 'cnpj'),
            ('a2@inspect.test', 'x', 'Loja A operador 2', 'cnpj')
     RETURNING id`
  );

  const advertiserIds = [];
  for (const [index, name] of ["Auto Center Atibaia", "Prime Veículos"].entries()) {
    const { rows } = await pool.query(
      `INSERT INTO advertisers (user_id, name, slug, city_id, status, address)
       VALUES ($1, $2, $3, $4, 'active', 'Rua das Lojas, 120') RETURNING id`,
      [dealerRows[index].id, name, `loja-${index}`, cityRows[0].id]
    );
    advertiserIds.push(rows[0].id);
  }

  // NÃO existe "segundo operador da mesma loja" no schema atual:
  // `advertisers` tem UM `user_id` e não há tabela de membros. Criar um
  // advertiser homônimo seria criar OUTRA loja — e o fixture estaria provando
  // algo que o banco não permite. Ver o describe do §4.

  return {
    cityId: cityRows[0].id,
    otherCityId: cityRows[1].id,
    ownerId: String(ownerRows[0].id),
    otherOwnerId: String(ownerRows[1].id),
    dealerIds: dealerRows.map((row) => String(row.id)),
    advertiserIds,
  };
}

async function insertSaleRequest({ minimumAcceptedPrice = "62500.00" } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, year, mileage, transmission, fuel_type,
       declared_condition, minimum_accepted_price, status
     )
     VALUES ($1, $2, 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
             'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.', 2020, 62000, 'automatico', 'flex',
             'bom', $3, 'receiving_offers')
     RETURNING id`,
    [world.ownerId, world.cityId, minimumAcceptedPrice]
  );
  return String(rows[0].id);
}

/** Leva a solicitação até `offer_selected`, pelos caminhos REAIS. */
async function seedSelected({ amountA = "65000", amountB = "67000" } = {}) {
  const saleRequestId = await insertSaleRequest();

  await offersService.createSaleOffer(world.dealerIds[0], saleRequestId, { amount: amountA });
  const { rows: aRows } = await pool.query(
    `SELECT id FROM sale_request_offers WHERE sale_request_id = $1 AND advertiser_id = $2`,
    [saleRequestId, world.advertiserIds[0]]
  );

  await offersService.createSaleOffer(world.dealerIds[1], saleRequestId, { amount: amountB });

  await selectionService.selectSaleRequestOffer(world.ownerId, saleRequestId, {
    offer_id: String(aRows[0].id),
  });

  return { saleRequestId, offerId: String(aRows[0].id) };
}

const FULL_FORM = {
  observed_mileage: "64230",
  observed_condition: "regular",
  observed_tire_condition: "replace_now",
  observed_engine_condition: "ok",
  observed_gearbox_condition: "ok",
  observed_suspension_condition: "issue",
  observed_body_paint_status: "issues",
  observed_body_paint_issues: ["scratches", "dents"],
  inspection_notes: "Suspensão dianteira com ruído.",
};

/** Wrappers que devolvem `{ ok }` em vez de lançar. */
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

const offerSlots = (saleRequestId, slots, dealerIndex = 0, delayMs = 0) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return inspectionService.offerInspectionSlots(
      world.dealerIds[dealerIndex],
      saleRequestId,
      { slots }
    );
  });

const confirmSlot = (saleRequestId, slotId, { owner, delayMs = 0 } = {}) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return inspectionService.confirmInspectionSlot(owner ?? world.ownerId, saleRequestId, {
      slot_id: String(slotId),
    });
  });

const completeInspection = (saleRequestId, form = FULL_FORM, dealerIndex = 0) =>
  attempt(() =>
    inspectionService.completeInspection(world.dealerIds[dealerIndex], saleRequestId, form)
  );

const decide = (saleRequestId, body, { dealerIndex = 0, delayMs = 0 } = {}) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return inspectionService.submitPostInspectionDecision(
      world.dealerIds[dealerIndex],
      saleRequestId,
      body
    );
  });

async function currentSlots(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT s.id::text AS id, s.round_no, s.starts_at
       FROM sale_request_inspection_slots s
       JOIN sale_request_inspections i ON i.id = s.inspection_id
      WHERE i.sale_request_id = $1
        AND s.round_no = i.schedule_round
      ORDER BY s.starts_at ASC`,
    [saleRequestId]
  );
  return rows;
}

async function readRequest(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT status, selected_offer_id::text AS selected_offer_id, selected_offer_at, mileage
       FROM sale_requests WHERE id = $1`,
    [saleRequestId]
  );
  return rows[0];
}

async function readInspection(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, schedule_status, schedule_round,
            confirmed_slot_id::text AS confirmed_slot_id, scheduled_at, completed_at,
            observed_mileage, observed_condition, advertiser_id::text AS advertiser_id
       FROM sale_request_inspections WHERE sale_request_id = $1`,
    [saleRequestId]
  );
  return rows[0] ?? null;
}

async function readDecisions(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id, decision_type, final_amount::text AS final_amount,
            preliminary_amount_snapshot::text AS preliminary_amount_snapshot,
            adjustment_reason, adjustment_note, internal_note,
            advertiser_id::text AS advertiser_id, inspection_id::text AS inspection_id
       FROM sale_request_post_inspection_decisions
      WHERE sale_request_id = $1 ORDER BY id`,
    [saleRequestId]
  );
  return rows;
}

/** Executa SQL cru e devolve o SQLSTATE, ou `null` se passou. */
async function pgErrorCode(sql, params = []) {
  try {
    await pool.query(sql, params);
    return null;
  } catch (error) {
    return error?.code ?? "unknown";
  }
}

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool?.().catch?.(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(upgradeDbName)} WITH (FORCE)`);
  await adminPool.end().catch(() => {});
});

// ============================================================================
describe.sequential("integração — o SCHEMA da migration 058", () => {
  it("o CHECK de status aceita os quatro estados novos", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_requests_status_check'`
    );

    for (const status of [
      "inspection_scheduled",
      "inspection_completed",
      "final_offer_submitted",
      "final_offer_declined",
    ]) {
      expect(rows[0].def).toContain(status);
    }
  });

  /**
   * §43 — O GATE DA FASE.
   *
   * O CHECK da 057 dizia `status <> 'offer_selected' AND selected_offer_id IS
   * NULL`. Todo estado novo cai nessa segunda metade e seria REJEITADO com a
   * seleção que acabou de acontecer.
   *
   * Este teste move a solicitação pelos quatro estados por SQL direto,
   * mantendo a seleção — se o CHECK não tiver sido reescrito, a primeira
   * transição já falha.
   */
  it("a seleção permanece obrigatória em TODOS os estados posteriores", async () => {
    const { saleRequestId } = await seedSelected();

    for (const status of [
      "inspection_scheduled",
      "inspection_completed",
      "final_offer_submitted",
      "final_offer_declined",
    ]) {
      const code = await pgErrorCode(`UPDATE sale_requests SET status = $2 WHERE id = $1`, [
        saleRequestId,
        status,
      ]);
      expect(code, `transição para ${status} foi rejeitada`).toBeNull();

      const row = await readRequest(saleRequestId);
      expect(row.status).toBe(status);
      // A seleção continua sendo a raiz do processo em todos eles.
      expect(row.selected_offer_id).not.toBeNull();
      expect(row.selected_offer_at).not.toBeNull();
    }
  });

  it("um estado da avaliação SEM seleção é rejeitado pelo banco", async () => {
    const saleRequestId = await insertSaleRequest();

    const code = await pgErrorCode(
      `UPDATE sale_requests SET status = 'inspection_scheduled' WHERE id = $1`,
      [saleRequestId]
    );

    expect(code).toBe("23514");
  });

  it("receiving_offers e cancelled continuam SEM seleção", async () => {
    const { saleRequestId } = await seedSelected();

    const code = await pgErrorCode(
      `UPDATE sale_requests SET status = 'receiving_offers' WHERE id = $1`,
      [saleRequestId]
    );

    // A seleção está preenchida; voltar para `receiving_offers` sem limpá-la
    // viola a partição.
    expect(code).toBe("23514");
  });

  it("cria as três tabelas da fase, com as chaves candidatas compostas", async () => {
    const { rows: tables } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'sale_request_inspections',
            'sale_request_inspection_slots',
            'sale_request_post_inspection_decisions'
          )
        ORDER BY table_name`
    );
    expect(tables).toHaveLength(3);

    const { rows: uniques } = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname IN (
          'sale_request_offer_selections_request_advertiser_unique',
          'sale_request_inspections_id_request_advertiser_unique',
          'sale_request_inspection_slots_id_inspection_unique'
        )`
    );
    expect(uniques).toHaveLength(3);
  });

  it("a FK do horário confirmado é COMPOSTA e sem MATCH FULL", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_inspections_confirmed_slot_fk'`
    );

    expect(rows[0].def).toContain("(confirmed_slot_id, id)");
    expect(rows[0].def).toContain("sale_request_inspection_slots(id, inspection_id)");
    // MATCH FULL rejeitaria toda inspeção sem horário confirmado.
    expect(rows[0].def).not.toMatch(/MATCH FULL/i);
  });

  /**
   * §16/§43 — o UPGRADE de um banco com linha REAL em `offer_selected`.
   *
   * É o cenário de produção: a 4.4 já rodou, existem solicitações selecionadas,
   * e a 058 entra em cima. O CHECK novo é adicionado SEM `NOT VALID`, então ele
   * varre a tabela — se a partição estivesse errada, a migration morreria aqui.
   */
  it("aplica sobre um banco com solicitações em offer_selected", async () => {
    const upgradeUrl = makeDatabaseUrl(upgradeDbName);
    await runMigrations(upgradeUrl);

    const up = new Pool(buildPoolConfig(upgradeUrl));

    try {
      // 1. Desfaz a 058 — o banco volta ao estado da 4.4.1.
      // CASCADE porque `inspections` e `inspection_slots` se referenciam
      // mutuamente (a FK do horário confirmado fecha o ciclo): nenhuma ordem de
      // DROP simples resolve isso.
      await up.query(
        `DROP TABLE IF EXISTS sale_request_post_inspection_decisions,
                              sale_request_inspection_slots,
                              sale_request_inspections CASCADE`
      );
      await up.query(
        `ALTER TABLE sale_request_offer_selections
           DROP CONSTRAINT IF EXISTS sale_request_offer_selections_request_advertiser_unique`
      );
      await up.query(`ALTER TABLE sale_requests DROP CONSTRAINT IF EXISTS sale_requests_status_check`);
      await up.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_status_check
           CHECK (status IN ('receiving_offers', 'offer_selected', 'cancelled'))`
      );
      await up.query(
        `ALTER TABLE sale_requests
           DROP CONSTRAINT IF EXISTS sale_requests_selected_offer_coherence_check`
      );
      await up.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_selected_offer_coherence_check
           CHECK (
             (status =  'offer_selected' AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL)
             OR
             (status <> 'offer_selected' AND selected_offer_id IS     NULL AND selected_offer_at IS     NULL)
           )`
      );
      await up.query(`DELETE FROM schema_migrations WHERE filename LIKE '058%'`);

      // 2. Povoa: uma aberta, uma cancelada e uma SELECIONADA.
      const { rows: c } = await up.query(
        `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-up') RETURNING id`
      );
      const { rows: u } = await up.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('o@up.test', 'x', 'Dono', 'cpf'), ('d@up.test', 'x', 'Loja', 'cnpj')
         RETURNING id`
      );
      const { rows: adv } = await up.query(
        `INSERT INTO advertisers (user_id, name, slug, city_id, status, address)
         VALUES ($1, 'Loja Legada', 'loja-up', $2, 'active', 'Rua X, 1') RETURNING id`,
        [u[1].id, c[0].id]
      );

      const ids = {};
      for (const status of ["receiving_offers", "cancelled", "offer_selected"]) {
        const { rows } = await up.query(
          `INSERT INTO sale_requests (
             owner_user_id, city_id, brand, brand_slug, model, model_slug,
             fipe_model_description, year, mileage, transmission, fuel_type,
             declared_condition, status
           )
           VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo 1.0', 2019, 60000,
                   'manual', 'flex', 'bom', 'receiving_offers')
           RETURNING id`,
          [u[0].id, c[0].id]
        );
        ids[status] = rows[0].id;

        const { rows: offer } = await up.query(
          `INSERT INTO sale_request_offers (sale_request_id, dealer_user_id, advertiser_id, amount)
           VALUES ($1, $2, $3, 48000.00) RETURNING id`,
          [rows[0].id, u[1].id, adv[0].id]
        );

        if (status === "cancelled") {
          await up.query(`UPDATE sale_requests SET status = 'cancelled' WHERE id = $1`, [
            rows[0].id,
          ]);
        }

        if (status === "offer_selected") {
          await up.query(
            `INSERT INTO sale_request_offer_selections
               (sale_request_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
             VALUES ($1, $2, $3, $4, 48000.00)`,
            [rows[0].id, offer[0].id, adv[0].id, u[0].id]
          );
          await up.query(
            `UPDATE sale_requests
                SET status = 'offer_selected', selected_offer_id = $2, selected_offer_at = NOW()
              WHERE id = $1`,
            [rows[0].id, offer[0].id]
          );
        }
      }

      // 3. Reaplica a 058 sobre o banco povoado.
      await runMigrations(upgradeUrl);

      // 4. A linha selecionada sobreviveu, com a seleção intacta.
      const { rows: selected } = await up.query(
        `SELECT status, selected_offer_id FROM sale_requests WHERE id = $1`,
        [ids.offer_selected]
      );
      expect(selected[0].status).toBe("offer_selected");
      expect(selected[0].selected_offer_id).not.toBeNull();

      // 5. E as duas SEM seleção continuam sem.
      const { rows: unselected } = await up.query(
        `SELECT status, selected_offer_id FROM sale_requests WHERE id = ANY($1)`,
        [[ids.receiving_offers, ids.cancelled]]
      );
      for (const row of unselected) {
        expect(row.selected_offer_id).toBeNull();
      }

      // 6. E a solicitação selecionada JÁ AVANÇA para os estados novos.
      await up.query(
        `UPDATE sale_requests SET status = 'inspection_scheduled' WHERE id = $1`,
        [ids.offer_selected]
      );
      const { rows: moved } = await up.query(
        `SELECT status FROM sale_requests WHERE id = $1`,
        [ids.offer_selected]
      );
      expect(moved[0].status).toBe("inspection_scheduled");
    } finally {
      await up.end().catch(() => {});
    }
  });
});

// ============================================================================
describe.sequential("integração — o caminho feliz completo", () => {
  it("offer_selected → scheduled → completed → final_offer_submitted", async () => {
    const { saleRequestId } = await seedSelected();

    const slots = await offerSlots(saleRequestId, [futureIso(48), futureIso(72)]);
    expect(slots.ok).toBe(true);
    expect((await readRequest(saleRequestId)).status).toBe("offer_selected");

    const [slot] = await currentSlots(saleRequestId);
    const confirmed = await confirmSlot(saleRequestId, slot.id);
    expect(confirmed.ok).toBe(true);
    expect((await readRequest(saleRequestId)).status).toBe("inspection_scheduled");

    const completed = await completeInspection(saleRequestId);
    expect(completed.ok).toBe(true);
    expect((await readRequest(saleRequestId)).status).toBe("inspection_completed");

    const decision = await decide(saleRequestId, {
      decision_type: "final_offer",
      final_amount: "60000.00",
      adjustment_reason: "mileage_difference",
      adjustment_note: "Odômetro acima do informado.",
    });
    expect(decision.ok).toBe(true);
    expect((await readRequest(saleRequestId)).status).toBe("final_offer_submitted");
  });

  /**
   * §45 — o declarado NUNCA é sobrescrito.
   */
  it("a quilometragem declarada permanece intacta ao lado da observada", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);

    const request = await readRequest(saleRequestId);
    const inspection = await readInspection(saleRequestId);

    expect(request.mileage).toBe(62000);
    expect(inspection.observed_mileage).toBe(64230);
  });
});

// ============================================================================
describe.sequential("integração — §44: a proposta final abaixo de tudo", () => {
  /**
   * Piso: 62.500. Preliminar selecionada: 65.000. Maior proposta: 67.000.
   * Final: 60.000 — abaixo dos três.
   *
   * Se algum dia alguém reaplicar a regra da disputa aqui "por segurança", é
   * este teste que cai.
   */
  it("60.000 é aceito com piso 62.500, preliminar 65.000 e maior 67.000", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);

    const decision = await decide(saleRequestId, {
      decision_type: "final_offer",
      final_amount: "60000.00",
      adjustment_reason: "tires",
      adjustment_note: "Quatro pneus no limite.",
    });

    expect(decision.ok).toBe(true);

    const [row] = await readDecisions(saleRequestId);
    expect(row.final_amount).toBe("60000.00");
    expect(row.preliminary_amount_snapshot).toBe("65000.00");

    const request = await pool.query(
      `SELECT minimum_accepted_price::text AS m FROM sale_requests WHERE id = $1`,
      [saleRequestId]
    );
    expect(Number(row.final_amount)).toBeLessThan(Number(request.rows[0].m));
  });

  it("o CHECK do banco recusa redução SEM justificativa", async () => {
    const { saleRequestId, offerId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);
    const inspection = await readInspection(saleRequestId);

    const code = await pgErrorCode(
      `INSERT INTO sale_request_post_inspection_decisions (
         sale_request_id, inspection_id, advertiser_id, selected_offer_id,
         decision_type, preliminary_amount_snapshot, final_amount, decided_by_user_id
       ) VALUES ($1, $2, $3, $4, 'final_offer', 65000.00, 57000.00, $5)`,
      [saleRequestId, inspection.id, world.advertiserIds[0], offerId, world.ownerId]
    );

    expect(code).toBe("23514");
  });

  it("o CHECK do banco liga tipo e valor", async () => {
    const { saleRequestId, offerId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);
    const inspection = await readInspection(saleRequestId);

    // `no_offer` COM valor.
    const withAmount = await pgErrorCode(
      `INSERT INTO sale_request_post_inspection_decisions (
         sale_request_id, inspection_id, advertiser_id, selected_offer_id,
         decision_type, preliminary_amount_snapshot, final_amount,
         adjustment_reason, decided_by_user_id
       ) VALUES ($1, $2, $3, $4, 'no_offer', 65000.00, 60000.00, 'tires', $5)`,
      [saleRequestId, inspection.id, world.advertiserIds[0], offerId, world.ownerId]
    );
    expect(withAmount).toBe("23514");

    // `final_offer` SEM valor.
    const withoutAmount = await pgErrorCode(
      `INSERT INTO sale_request_post_inspection_decisions (
         sale_request_id, inspection_id, advertiser_id, selected_offer_id,
         decision_type, preliminary_amount_snapshot, adjustment_reason, decided_by_user_id
       ) VALUES ($1, $2, $3, $4, 'final_offer', 65000.00, 'tires', $5)`,
      [saleRequestId, inspection.id, world.advertiserIds[0], offerId, world.ownerId]
    );
    expect(withoutAmount).toBe("23514");
  });
});

// ============================================================================
describe.sequential("integração — §29: integridade composta", () => {
  it("a inspeção não pode ser de uma loja que NÃO foi selecionada", async () => {
    const { saleRequestId } = await seedSelected();

    const code = await pgErrorCode(
      `INSERT INTO sale_request_inspections (sale_request_id, advertiser_id, created_by_user_id)
       VALUES ($1, $2, $3)`,
      // Loja B — que perdeu a disputa.
      [saleRequestId, world.advertiserIds[1], world.dealerIds[1]]
    );

    expect(code).toBe("23503");
  });

  it("a decisão não pode apontar para uma inspeção de OUTRA solicitação", async () => {
    const first = await seedSelected();
    const second = await seedSelected();

    for (const target of [first, second]) {
      await offerSlots(target.saleRequestId, [futureIso(48)]);
      const [slot] = await currentSlots(target.saleRequestId);
      await confirmSlot(target.saleRequestId, slot.id);
      await completeInspection(target.saleRequestId);
    }

    const foreignInspection = await readInspection(second.saleRequestId);

    const code = await pgErrorCode(
      `INSERT INTO sale_request_post_inspection_decisions (
         sale_request_id, inspection_id, advertiser_id, selected_offer_id,
         decision_type, preliminary_amount_snapshot, final_amount, decided_by_user_id
       ) VALUES ($1, $2, $3, $4, 'final_offer', 65000.00, 70000.00, $5)`,
      [
        first.saleRequestId,
        foreignInspection.id,
        world.advertiserIds[0],
        first.offerId,
        world.ownerId,
      ]
    );

    expect(code).toBe("23503");
  });

  it("o horário confirmado não pode ser de outra inspeção", async () => {
    const first = await seedSelected();
    const second = await seedSelected();

    await offerSlots(first.saleRequestId, [futureIso(48)]);
    await offerSlots(second.saleRequestId, [futureIso(72)]);

    const firstInspection = await readInspection(first.saleRequestId);
    const foreignSlots = await currentSlots(second.saleRequestId);

    const code = await pgErrorCode(
      `UPDATE sale_request_inspections
          SET schedule_status = 'scheduled', confirmed_slot_id = $2, scheduled_at = NOW()
        WHERE id = $1`,
      [firstInspection.id, foreignSlots[0].id]
    );

    expect(code).toBe("23503");
  });
});

// ============================================================================
describe.sequential("integração — §13: horário × nova rodada", () => {
  it("nunca confirma um horário que já foi substituído", async () => {
    for (let round = 0; round < 6; round += 1) {
      world = await seedWorld();
      const { saleRequestId } = await seedSelected();

      await offerSlots(saleRequestId, [futureIso(48)]);
      const [targeted] = await currentSlots(saleRequestId);

      // A loja publica a rodada 2 no mesmo instante em que o proprietário
      // confirma o horário da rodada 1. As duas disputam a MESMA linha de
      // `sale_requests`.
      const [confirmation, newRound] = await Promise.all([
        confirmSlot(saleRequestId, targeted.id, { delayMs: round % 3 }),
        (async () => {
          // A nova rodada exige passar por `awaiting_slots` — o proprietário
          // pediu, ou a loja reenviou. Aqui simulamos o reenvio direto.
          await new Promise((r) => setTimeout(r, (round + 1) % 3));
          await pool
            .query(
              `UPDATE sale_request_inspections SET schedule_status = 'awaiting_slots'
                WHERE sale_request_id = $1 AND schedule_status = 'awaiting_owner'`,
              [saleRequestId]
            )
            .catch(() => {});
          return offerSlots(saleRequestId, [futureIso(96)]);
        })(),
      ]);

      const inspection = await readInspection(saleRequestId);

      if (confirmation.ok) {
        // A confirmação venceu: o horário confirmado é o que foi apontado.
        expect(inspection.confirmed_slot_id).toBe(String(targeted.id));
      } else {
        // A rodada nova venceu: a confirmação caiu, e nunca em silêncio.
        expect([409]).toContain(confirmation.status);
        expect(inspection.confirmed_slot_id).toBeNull();
      }

      // Em NENHUM desfecho existe horário confirmado fora da rodada vigente.
      if (inspection.confirmed_slot_id) {
        const { rows } = await pool.query(
          `SELECT s.round_no, i.schedule_round
             FROM sale_request_inspection_slots s
             JOIN sale_request_inspections i ON i.id = s.inspection_id
            WHERE s.id = $1`,
          [inspection.confirmed_slot_id]
        );
        expect(Number(rows[0].round_no)).toBe(Number(rows[0].schedule_round));
      }
    }
  });
});

// ============================================================================
describe.sequential("integração — §13: horário × horário", () => {
  it("dois cliques em horários diferentes: exatamente um confirma", async () => {
    for (let round = 0; round < 6; round += 1) {
      world = await seedWorld();
      const { saleRequestId } = await seedSelected();

      await offerSlots(saleRequestId, [futureIso(48), futureIso(72)]);
      const slots = await currentSlots(saleRequestId);

      const [a, b] = await Promise.all([
        confirmSlot(saleRequestId, slots[0].id, { delayMs: round % 3 }),
        confirmSlot(saleRequestId, slots[1].id, { delayMs: (round + 1) % 3 }),
      ]);

      const winners = [a, b].filter((o) => o.ok);
      expect(winners).toHaveLength(1);

      const loser = [a, b].find((o) => !o.ok);
      expect(loser.status).toBe(409);

      const inspection = await readInspection(saleRequestId);
      expect(inspection.schedule_status).toBe("scheduled");
      expect([String(slots[0].id), String(slots[1].id)]).toContain(
        inspection.confirmed_slot_id
      );
      expect((await readRequest(saleRequestId)).status).toBe("inspection_scheduled");
    }
  });

  it("retry do MESMO horário é idempotente sob concorrência", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);

    const [a, b] = await Promise.all([
      confirmSlot(saleRequestId, slot.id),
      confirmSlot(saleRequestId, slot.id, { delayMs: 3 }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM user_notifications
        WHERE entity_type = 'sale_request' AND entity_id = $1
          AND event_type = 'appointment.confirmed'`,
      [String(saleRequestId)]
    );
    expect(rows[0].total).toBe(1);
  });
});

// ============================================================================
describe.sequential("integração — §37: a decisão comercial sob concorrência", () => {
  async function seedCompleted() {
    const seeded = await seedSelected();
    await offerSlots(seeded.saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(seeded.saleRequestId);
    await confirmSlot(seeded.saleRequestId, slot.id);
    await completeInspection(seeded.saleRequestId);
    return seeded;
  }

  it("dois valores simultâneos: exatamente uma decisão vence", async () => {
    for (let round = 0; round < 5; round += 1) {
      world = await seedWorld();
      const { saleRequestId } = await seedCompleted();

      const [a, b] = await Promise.all([
        decide(saleRequestId, { decision_type: "final_offer", final_amount: "70000.00" }, { delayMs: round % 3 }),
        decide(saleRequestId, { decision_type: "final_offer", final_amount: "71000.00" }, { delayMs: (round + 1) % 3 }),
      ]);

      const winners = [a, b].filter((o) => o.ok);
      expect(winners).toHaveLength(1);
      expect([a, b].find((o) => !o.ok).status).toBe(409);

      expect(await readDecisions(saleRequestId)).toHaveLength(1);
      expect((await readRequest(saleRequestId)).status).toBe("final_offer_submitted");
    }
  });

  it("proposta × desistência simultâneas: o estado nunca contradiz a decisão", async () => {
    for (let round = 0; round < 5; round += 1) {
      world = await seedWorld();
      const { saleRequestId } = await seedCompleted();

      const [offer, no] = await Promise.all([
        decide(saleRequestId, { decision_type: "final_offer", final_amount: "70000.00" }, { delayMs: round % 3 }),
        decide(
          saleRequestId,
          { decision_type: "no_offer", adjustment_reason: "mechanical" },
          { delayMs: (round + 1) % 3 }
        ),
      ]);

      expect([offer, no].filter((o) => o.ok)).toHaveLength(1);

      const decisions = await readDecisions(saleRequestId);
      expect(decisions).toHaveLength(1);

      const request = await readRequest(saleRequestId);

      // O invariante: o status da solicitação e o tipo da decisão CONCORDAM.
      // Nunca `final_offer_submitted` com `no_offer`, nem o inverso.
      if (decisions[0].decision_type === "final_offer") {
        expect(request.status).toBe("final_offer_submitted");
      } else {
        expect(request.status).toBe("final_offer_declined");
      }
    }
  });
});

// ============================================================================
describe.sequential("integração — notificações e privacidade", () => {
  it("a notificação da decisão é criada na mesma transação", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);
    await decide(saleRequestId, {
      decision_type: "final_offer",
      final_amount: "60000.00",
      adjustment_reason: "tires",
    });

    const { rows } = await pool.query(
      `SELECT recipient_user_id::text AS recipient, event_type
         FROM user_notifications
        WHERE entity_type = 'sale_request' AND entity_id = $1
          AND event_type = 'sale_request.final_offer_submitted'`,
      [String(saleRequestId)]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].recipient).toBe(world.ownerId);
  });

  /**
   * O ROLLBACK: um erro depois da notificação não deixa decisão nem aviso órfão.
   */
  it("rollback da decisão não deixa notificação órfã", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);

    await pool.query(`
      CREATE OR REPLACE FUNCTION fail_notification() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'falha simulada'; END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      CREATE TRIGGER fail_notification_trigger
      BEFORE INSERT ON user_notifications
      FOR EACH ROW EXECUTE FUNCTION fail_notification();
    `);

    try {
      const outcome = await decide(saleRequestId, {
        decision_type: "final_offer",
        final_amount: "60000.00",
        adjustment_reason: "tires",
      });
      expect(outcome.ok).toBe(false);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS fail_notification_trigger ON user_notifications`);
      await pool.query(`DROP FUNCTION IF EXISTS fail_notification()`);
    }

    expect(await readDecisions(saleRequestId)).toHaveLength(0);
    expect((await readRequest(saleRequestId)).status).toBe("inspection_completed");

    // E a solicitação continua utilizável.
    const retry = await decide(saleRequestId, {
      decision_type: "final_offer",
      final_amount: "60000.00",
      adjustment_reason: "tires",
    });
    expect(retry.ok).toBe(true);
  });

  it("a nota INTERNA fica no banco e NUNCA no DTO do proprietário", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);
    await decide(saleRequestId, {
      decision_type: "final_offer",
      final_amount: "60000.00",
      adjustment_reason: "tires",
      adjustment_note: "Pneus no limite.",
      internal_note: "Falar com o Marcos — margem apertada.",
    });

    // Está no banco…
    const [row] = await readDecisions(saleRequestId);
    expect(row.internal_note).toContain("Marcos");

    // …e não sai no DTO.
    const detail = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("Marcos");
    expect(serialized).not.toContain("internal_note");
    expect(detail.final_decision.note).toBe("Pneus no limite.");
  });

  it("a loja PERDEDORA continua com 404 em todos os estados novos", async () => {
    const { saleRequestId } = await seedSelected();

    await offerSlots(saleRequestId, [futureIso(48)]);
    await expect(
      dealerService.getDealerSaleOpportunity(world.dealerIds[1], saleRequestId)
    ).rejects.toMatchObject({ statusCode: 404 });

    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await expect(
      dealerService.getDealerSaleOpportunity(world.dealerIds[1], saleRequestId)
    ).rejects.toMatchObject({ statusCode: 404 });

    await completeInspection(saleRequestId);
    await expect(
      dealerService.getDealerSaleOpportunity(world.dealerIds[1], saleRequestId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("o DTO do lojista não carrega NADA do proprietário", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);

    const detail = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[0],
      saleRequestId
    );
    const serialized = JSON.stringify(detail).toLowerCase();

    for (const forbidden of [
      "seller",
      "owner_user_id",
      "whatsapp",
      "phone",
      "email",
      "cpf",
      "owner@inspect.test",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

// ============================================================================
describe.sequential("integração — §4: a autorização é por LOJA", () => {
  /**
   * O §4 pede que "qualquer usuário autorizado a operar a mesma loja" possa
   * agir. A AUDITORIA revelou que o schema atual não expressa isso:
   * `advertisers` tem UM `user_id`, e não existe tabela de membros. "Dois
   * operadores da mesma loja" é, hoje, inexprimível.
   *
   * O que o código faz — e o que este teste prova — é a forma correta e à prova
   * de futuro: a autorização é resolvida pelo ADVERTISER
   * (`o.advertiser_id = $2` no lock), nunca comparando `dealer_user_id` com
   * quem enviou a proposta. No dia em que o schema ganhar múltiplos operadores,
   * nada nesta camada precisa mudar.
   *
   * O que se prova aqui é o caso que o schema PERMITE e que importa: um usuário
   * com DUAS lojas só age em nome da que foi selecionada.
   */
  it("um usuário com duas lojas só age pela loja SELECIONADA", async () => {
    // A ORDEM importa: a segunda loja nasce DEPOIS da disputa.
    //
    // Criá-la antes faria o próprio `seedSelected` falhar — com duas lojas
    // elegíveis e nenhuma escolhida, `createSaleOffer` já devolve o 409 de
    // seleção da 4.3. O cenário que se quer montar é "a loja foi escolhida, e só
    // depois o lojista ganhou uma filial".
    const { saleRequestId } = await seedSelected();

    // A loja B pertence ao dealer 1. Damos a ele uma SEGUNDA loja, na mesma
    // cidade — o que o schema permite (`advertisers.user_id` não tem UNIQUE).
    const { rows: extra } = await pool.query(
      `INSERT INTO advertisers (user_id, name, slug, city_id, status, address)
       VALUES ($1, 'Prime Filial', 'prime-filial', $2, 'active', 'Av. B, 200')
       RETURNING id`,
      [world.dealerIds[1], world.cityId]
    );

    // Com duas lojas elegíveis e nenhuma escolhida, o servidor NÃO adivinha:
    // devolve 409 pedindo a escolha (regra da 4.3, preservada).
    const ambiguous = await offerSlots(saleRequestId, [futureIso(48)], 1);
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.code).toBe("SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED");

    // Escolhendo explicitamente a loja NÃO selecionada: 404 — a linha do lock
    // não casa, porque o `advertiser_id` não é o da proposta escolhida.
    const wrongStore = await attempt(() =>
      inspectionService.offerInspectionSlots(
        world.dealerIds[1],
        saleRequestId,
        { slots: [futureIso(48)] },
        { advertiserId: String(extra[0].id) }
      )
    );
    expect(wrongStore.ok).toBe(false);
    expect(wrongStore.status).toBe(404);

    // E a loja SELECIONADA (do dealer 0) age normalmente.
    const right = await offerSlots(saleRequestId, [futureIso(48)], 0);
    expect(right.ok).toBe(true);
  });

  it("o AUTOR de cada ato é registrado — auditoria, não permissão", async () => {
    const { saleRequestId } = await seedSelected();
    await offerSlots(saleRequestId, [futureIso(48)]);
    const [slot] = await currentSlots(saleRequestId);
    await confirmSlot(saleRequestId, slot.id);
    await completeInspection(saleRequestId);

    const { rows } = await pool.query(
      `SELECT created_by_user_id::text AS created, completed_by_user_id::text AS completed
         FROM sale_request_inspections WHERE sale_request_id = $1`,
      [saleRequestId]
    );

    expect(rows[0].created).toBe(world.dealerIds[0]);
    expect(rows[0].completed).toBe(world.dealerIds[0]);
  });
});
