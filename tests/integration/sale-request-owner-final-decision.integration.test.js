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
 * A DECISÃO DO PROPRIETÁRIO sobre a proposta final, sob PostgreSQL real
 * (Fase 4.6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ════════════════════════════════════════════════════════════════════════════
 * O teste de service roda contra um array em memória com uma "conexão" só. Ele
 * prova a REGRA (quem pode fazer o quê, o que é recusado, o que não vaza) e não
 * consegue provar nada sobre SERIALIZAÇÃO nem sobre as constraints do banco.
 *
 * Os defeitos que este arquivo caça só existem com PostgreSQL de verdade:
 *
 *   §36  `accepted` × `rejected` simultâneos. Exatamente uma vence, e o estado
 *        final concorda com a linha da trilha — nunca a combinação cruzada;
 *
 *   §34  o CHECK de status e o de coerência da seleção, sobre um banco POVOADO.
 *        Um banco vazio não revela nada aqui: não há linha para violar o CHECK,
 *        e foi assim que o defeito da 057 sobreviveu até a 058;
 *
 *   §35  a FK composta de 5 colunas. É o que torna estruturalmente impossível
 *        gravar um `final_amount_snapshot` diferente do valor que a loja
 *        apresentou — inclusive um que viesse do navegador. O fake NÃO
 *        reproduz a constraint de propósito: um fake que a imitasse estaria
 *        concordando consigo mesmo;
 *
 *   §33  a integridade composta: uma decisão montada com peças válidas de
 *        negócios DIFERENTES.
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
 *   npx vitest run tests/integration/sale-request-owner-final-decision.integration.test.js
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
const dbName = `saleowndec_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
/** Segundo banco, só para o cenário de UPGRADE 058 → 059 (§34). */
const upgradeDbName = `saleowndecup_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

const finalDecisionService = await import(
  "../../src/modules/sale-requests/sale-requests.final-decision.service.js"
);
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

const PRELIMINARY = "65000";
const FINAL = "60000";

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
    `TRUNCATE sale_request_owner_final_decisions,
              sale_request_post_inspection_decisions, sale_request_inspection_slots,
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
     VALUES ('owner@decision.test', 'x', 'Dono', 'cpf'),
            ('other@decision.test', 'x', 'Outro', 'cpf')
     RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@decision.test', 'x', 'Loja A', 'cnpj'),
            ('b@decision.test', 'x', 'Loja B', 'cnpj')
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

/** Leva a solicitação até `offer_selected`, pelos caminhos REAIS. */
async function seedSelected({ amountA = PRELIMINARY, amountB = "67000" } = {}) {
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

/**
 * Leva até `final_offer_submitted` — o estado de entrada da 4.6 — pelos
 * caminhos REAIS: proposta, seleção, horários, confirmação, inspeção e decisão
 * comercial.
 *
 * Passar pelos services de verdade em vez de montar as linhas por INSERT é o que
 * garante que as FKs compostas da 058 e da 059 estejam satisfeitas por
 * construção. Um fixture montado à mão pode gravar um conjunto que o produto
 * jamais produziria — e aí o teste prova algo sobre um banco que não existe.
 */
async function seedFinalOffer({ finalAmount = FINAL, decisionType = "final_offer" } = {}) {
  const { saleRequestId, offerId } = await seedSelected();

  await inspectionService.offerInspectionSlots(world.dealerIds[0], saleRequestId, {
    slots: [futureIso(48), futureIso(72)],
  });

  const { rows: slots } = await pool.query(
    `SELECT s.id FROM sale_request_inspection_slots s
       JOIN sale_request_inspections i ON i.id = s.inspection_id
      WHERE i.sale_request_id = $1 ORDER BY s.starts_at ASC LIMIT 1`,
    [saleRequestId]
  );

  await inspectionService.confirmInspectionSlot(world.ownerId, saleRequestId, {
    slot_id: String(slots[0].id),
  });

  await inspectionService.completeInspection(world.dealerIds[0], saleRequestId, FULL_FORM);

  await inspectionService.submitPostInspectionDecision(world.dealerIds[0], saleRequestId, {
    decision_type: decisionType,
    ...(decisionType === "final_offer" ? { final_amount: finalAmount } : {}),
    adjustment_reason: "tires",
    internal_note: "Margem apertada, avisar o gerente.",
  });

  const { rows: decisionRows } = await pool.query(
    `SELECT id, advertiser_id, inspection_id FROM sale_request_post_inspection_decisions
      WHERE sale_request_id = $1`,
    [saleRequestId]
  );

  return {
    saleRequestId,
    offerId,
    decisionId: String(decisionRows[0].id),
    advertiserId: String(decisionRows[0].advertiser_id),
    inspectionId: String(decisionRows[0].inspection_id),
  };
}

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

const respond = (saleRequestId, decision, { owner, delayMs = 0 } = {}) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return finalDecisionService.decideFinalOffer(owner ?? world.ownerId, saleRequestId, {
      decision,
    });
  });

async function readRequest(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT status, selected_offer_id::text AS selected_offer_id, selected_offer_at
       FROM sale_requests WHERE id = $1`,
    [saleRequestId]
  );
  return rows[0];
}

async function readOwnerDecisions(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id, decision_type, final_amount_snapshot::text AS final_amount_snapshot,
            post_inspection_decision_type,
            post_inspection_decision_id::text AS post_inspection_decision_id,
            advertiser_id::text AS advertiser_id,
            decided_by_user_id::text AS decided_by_user_id, created_at
       FROM sale_request_owner_final_decisions
      WHERE sale_request_id = $1 ORDER BY id`,
    [saleRequestId]
  );
  return rows;
}

async function readNotifications(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT recipient_user_id::text AS recipient_user_id, event_type, title, body, payload
       FROM user_notifications WHERE entity_type = 'sale_request' AND entity_id = $1
      ORDER BY id`,
    [String(saleRequestId)]
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
describe.sequential("integração — o SCHEMA da migration 059", () => {
  it("o CHECK de status aceita os dois estados novos e mantém os sete antigos", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_requests_status_check'`
    );

    for (const status of [
      "receiving_offers",
      "offer_selected",
      "inspection_scheduled",
      "inspection_completed",
      "final_offer_submitted",
      "final_offer_declined",
      "final_offer_accepted",
      "final_offer_rejected",
      "cancelled",
    ]) {
      expect(rows[0].def, `status ${status}`).toContain(status);
    }
  });

  /**
   * §34 — o gate estrutural desta fase, na mesma forma que a 058 usou.
   *
   * O CHECK de coerência é reescrito a cada fase. Se a partição nova tivesse
   * esquecido os dois estados, a PRIMEIRA transição falharia aqui — com a
   * seleção preenchida, um estado fora das duas listas viola o CHECK.
   */
  it("a seleção permanece obrigatória nos DOIS estados novos", async () => {
    const { saleRequestId } = await seedSelected();

    for (const status of ["final_offer_accepted", "final_offer_rejected"]) {
      const code = await pgErrorCode(`UPDATE sale_requests SET status = $2 WHERE id = $1`, [
        saleRequestId,
        status,
      ]);
      expect(code, `transição para ${status} foi rejeitada`).toBeNull();

      const row = await readRequest(saleRequestId);
      expect(row.status).toBe(status);
      expect(row.selected_offer_id).not.toBeNull();
      expect(row.selected_offer_at).not.toBeNull();
    }
  });

  it("final_offer_accepted SEM seleção é rejeitado com 23514", async () => {
    const saleRequestId = await insertSaleRequest();

    const code = await pgErrorCode(
      `UPDATE sale_requests SET status = 'final_offer_accepted' WHERE id = $1`,
      [saleRequestId]
    );

    expect(code).toBe("23514");
  });

  it("final_offer_rejected SEM seleção é rejeitado com 23514", async () => {
    const saleRequestId = await insertSaleRequest();

    const code = await pgErrorCode(
      `UPDATE sale_requests SET status = 'final_offer_rejected' WHERE id = $1`,
      [saleRequestId]
    );

    expect(code).toBe("23514");
  });

  it("cria a tabela da fase com o UNIQUE por solicitação", async () => {
    const { rows: tables } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sale_request_owner_final_decisions'`
    );
    expect(tables).toHaveLength(1);

    const { rows: idx } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'sale_request_owner_final_decisions'
          AND indexname = 'sale_request_owner_final_decisions_request_uidx'`
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/UNIQUE/i);
  });

  /**
   * §7 — a trilha é APPEND-ONLY, e a ausência das colunas é o que garante isso.
   *
   * `updated_at`, `deleted_at` e `status` numa linha de trilha são o convite
   * para "corrigir" uma decisão já tomada. A asserção é sobre o schema porque é
   * lá que a tentação nasce.
   */
  it("a trilha não tem updated_at, deleted_at nem status", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sale_request_owner_final_decisions'`
    );
    const columns = rows.map((r) => r.column_name);

    expect(columns).not.toContain("updated_at");
    expect(columns).not.toContain("deleted_at");
    expect(columns).not.toContain("status");
  });

  /**
   * §9/§10 — a FK que prova o que uma FK simples não provaria.
   *
   * Cinco colunas: as duas de pertencimento (solicitação, loja), o TIPO da
   * decisão da loja e o VALOR. É o que torna `no_offer` inalcançável e o
   * snapshot inforjável, sem trigger nenhum.
   */
  it("a FK da origem é COMPOSTA de 5 colunas, e sem MATCH FULL", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_owner_final_decisions_source_fk'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain("post_inspection_decision_id");
    expect(rows[0].def).toContain("post_inspection_decision_type");
    expect(rows[0].def).toContain("final_amount_snapshot");
    expect(rows[0].def).toContain(
      "sale_request_post_inspection_decisions(id, sale_request_id, advertiser_id, decision_type, final_amount)"
    );
    // MATCH FULL não teria o que governar: nenhuma coluna do lado filho é
    // nullable. Declará-lo sugeriria uma proteção que não é a que está em jogo.
    expect(rows[0].def).not.toMatch(/MATCH FULL/i);
  });

  /**
   * A outra metade do mecanismo: TODA coluna do lado filho é NOT NULL.
   *
   * Não é detalhe. O default do PostgreSQL é MATCH SIMPLE, e nele basta UMA
   * coluna filha nula para a FK inteira deixar de ser verificada. Uma coluna
   * nullable aqui abriria uma porta pela qual passaria qualquer coisa.
   */
  it("nenhuma coluna da FK composta é nullable", async () => {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'sale_request_owner_final_decisions'
          AND column_name IN (
            'post_inspection_decision_id', 'sale_request_id', 'advertiser_id',
            'post_inspection_decision_type', 'final_amount_snapshot'
          )`
    );

    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.is_nullable, `coluna ${row.column_name}`).toBe("NO");
    }
  });

  it("o UNIQUE alvo da FK existe na tabela pai, com as colunas exatas", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_post_inspection_decisions_offer_identity_unique'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain(
      "UNIQUE (id, sale_request_id, advertiser_id, decision_type, final_amount)"
    );
  });
});

// ============================================================================
describe.sequential("integração — UPGRADE 058 → 059 (§34)", () => {
  /**
   * O cenário de produção: a 4.5 já rodou, existem solicitações em TODOS os
   * estados dela, e a 059 entra em cima.
   *
   * O CHECK novo é adicionado SEM `NOT VALID`, então ele varre a tabela — se a
   * partição estivesse errada, a migration morreria aqui, sobre dados reais. Um
   * banco vazio não revelaria nada disso.
   */
  it("aplica sobre um banco povoado com TODOS os estados da 4.5", async () => {
    const upgradeUrl = makeDatabaseUrl(upgradeDbName);
    await runMigrations(upgradeUrl);

    const up = new Pool(buildPoolConfig(upgradeUrl));

    try {
      // 1. Desfaz a 059 — o banco volta ao estado exato da 4.5.
      await up.query(`DROP TABLE IF EXISTS sale_request_owner_final_decisions CASCADE`);
      await up.query(
        `ALTER TABLE sale_request_post_inspection_decisions
           DROP CONSTRAINT IF EXISTS sale_request_post_inspection_decisions_offer_identity_unique`
      );
      await up.query(
        `ALTER TABLE sale_requests DROP CONSTRAINT IF EXISTS sale_requests_status_check`
      );
      await up.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_status_check
           CHECK (status IN (
             'receiving_offers', 'offer_selected', 'inspection_scheduled',
             'inspection_completed', 'final_offer_submitted', 'final_offer_declined',
             'cancelled'
           ))`
      );
      await up.query(
        `ALTER TABLE sale_requests
           DROP CONSTRAINT IF EXISTS sale_requests_selected_offer_coherence_check`
      );
      await up.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_selected_offer_coherence_check
           CHECK (
             (
               status IN ('offer_selected', 'inspection_scheduled', 'inspection_completed',
                          'final_offer_submitted', 'final_offer_declined')
               AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL
             )
             OR
             (
               status IN ('receiving_offers', 'cancelled')
               AND selected_offer_id IS NULL AND selected_offer_at IS NULL
             )
           )`
      );
      await up.query(`DELETE FROM schema_migrations WHERE filename LIKE '059%'`);

      // 2. Povoa: uma linha em CADA estado que a 4.5 conhece.
      const { rows: c } = await up.query(
        `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-up') RETURNING id`
      );
      const { rows: u } = await up.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('o@up6.test', 'x', 'Dono', 'cpf'), ('d@up6.test', 'x', 'Loja', 'cnpj')
         RETURNING id`
      );
      const { rows: adv } = await up.query(
        `INSERT INTO advertisers (user_id, name, slug, city_id, status, address)
         VALUES ($1, 'Loja Legada', 'loja-up6', $2, 'active', 'Rua X, 1') RETURNING id`,
        [u[1].id, c[0].id]
      );

      const LEGACY_STATUSES = [
        "receiving_offers",
        "cancelled",
        "offer_selected",
        "inspection_scheduled",
        "inspection_completed",
        "final_offer_submitted",
        "final_offer_declined",
      ];
      const withSelection = new Set(LEGACY_STATUSES.slice(2));

      const ids = {};
      for (const status of LEGACY_STATUSES) {
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
          continue;
        }

        if (!withSelection.has(status)) continue;

        await up.query(
          `INSERT INTO sale_request_offer_selections
             (sale_request_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
           VALUES ($1, $2, $3, $4, 48000.00)`,
          [rows[0].id, offer[0].id, adv[0].id, u[0].id]
        );
        await up.query(
          `UPDATE sale_requests
              SET status = $2, selected_offer_id = $3, selected_offer_at = NOW()
            WHERE id = $1`,
          [rows[0].id, status, offer[0].id]
        );
      }

      // 3. Reaplica a 059 sobre o banco povoado.
      await runMigrations(upgradeUrl);

      // 4. TODOS os estados antigos sobreviveram, com a seleção como estava.
      for (const status of LEGACY_STATUSES) {
        const { rows } = await up.query(
          `SELECT status, selected_offer_id FROM sale_requests WHERE id = $1`,
          [ids[status]]
        );
        expect(rows[0].status, `estado ${status} preservado`).toBe(status);

        if (withSelection.has(status)) {
          expect(rows[0].selected_offer_id, `seleção de ${status}`).not.toBeNull();
        } else {
          expect(rows[0].selected_offer_id, `sem seleção em ${status}`).toBeNull();
        }
      }

      // 5. E a solicitação em `final_offer_submitted` JÁ AVANÇA para os novos.
      await up.query(
        `UPDATE sale_requests SET status = 'final_offer_accepted' WHERE id = $1`,
        [ids.final_offer_submitted]
      );
      const { rows: moved } = await up.query(
        `SELECT status FROM sale_requests WHERE id = $1`,
        [ids.final_offer_submitted]
      );
      expect(moved[0].status).toBe("final_offer_accepted");

      // 6. E um estado novo SEM seleção continua sendo recusado.
      let code = null;
      try {
        await up.query(
          `UPDATE sale_requests SET status = 'final_offer_rejected' WHERE id = $1`,
          [ids.receiving_offers]
        );
      } catch (error) {
        code = error?.code ?? "unknown";
      }
      expect(code).toBe("23514");
    } finally {
      await up.end().catch(() => {});
    }
  });
});

// ============================================================================
describe.sequential("integração — os dois caminhos, pelos services reais", () => {
  it("aceite: estado, trilha e notificação num commit só", async () => {
    const { saleRequestId, decisionId, advertiserId } = await seedFinalOffer();

    const result = await respond(saleRequestId, "accepted");
    expect(result.ok).toBe(true);
    expect(result.result.changed).toBe(true);

    const request = await readRequest(saleRequestId);
    expect(request.status).toBe("final_offer_accepted");

    const trail = await readOwnerDecisions(saleRequestId);
    expect(trail).toHaveLength(1);
    expect(trail[0].decision_type).toBe("accepted");
    expect(trail[0].post_inspection_decision_id).toBe(decisionId);
    expect(trail[0].advertiser_id).toBe(advertiserId);
    expect(trail[0].decided_by_user_id).toBe(world.ownerId);

    const sent = await readNotifications(saleRequestId);
    const accepted = sent.filter((n) => n.event_type === "sale_request.final_offer_accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].recipient_user_id).toBe(world.dealerIds[0]);
  });

  it("recusa: estado, trilha e notificação num commit só", async () => {
    const { saleRequestId } = await seedFinalOffer();

    const result = await respond(saleRequestId, "rejected");
    expect(result.ok).toBe(true);

    expect((await readRequest(saleRequestId)).status).toBe("final_offer_rejected");

    const trail = await readOwnerDecisions(saleRequestId);
    expect(trail).toHaveLength(1);
    expect(trail[0].decision_type).toBe("rejected");

    const sent = await readNotifications(saleRequestId);
    expect(sent.filter((n) => n.event_type === "sale_request.final_offer_rejected")).toHaveLength(
      1
    );
  });

  /** §35 — o snapshot é o valor PERSISTIDO, e vem do banco. */
  it("o snapshot copia o final_amount da proposta final", async () => {
    const { saleRequestId } = await seedFinalOffer({ finalAmount: "60000" });
    await respond(saleRequestId, "accepted");

    const trail = await readOwnerDecisions(saleRequestId);
    expect(trail[0].final_amount_snapshot).toBe("60000.00");
    expect(trail[0].post_inspection_decision_type).toBe("final_offer");

    const { rows } = await pool.query(
      `SELECT final_amount::text AS final_amount
         FROM sale_request_post_inspection_decisions WHERE sale_request_id = $1`,
      [saleRequestId]
    );
    expect(trail[0].final_amount_snapshot).toBe(rows[0].final_amount);
  });

  it("nem seleção, nem inspeção, nem proposta final são tocadas", async () => {
    const { saleRequestId, inspectionId, decisionId } = await seedFinalOffer();

    const before = await pool.query(
      `SELECT
         (SELECT to_jsonb(s) FROM sale_request_offer_selections s WHERE s.sale_request_id = $1) AS sel,
         (SELECT to_jsonb(i) FROM sale_request_inspections i WHERE i.id = $2) AS insp,
         (SELECT to_jsonb(d) FROM sale_request_post_inspection_decisions d WHERE d.id = $3) AS dec`,
      [saleRequestId, inspectionId, decisionId]
    );

    await respond(saleRequestId, "rejected");

    const after = await pool.query(
      `SELECT
         (SELECT to_jsonb(s) FROM sale_request_offer_selections s WHERE s.sale_request_id = $1) AS sel,
         (SELECT to_jsonb(i) FROM sale_request_inspections i WHERE i.id = $2) AS insp,
         (SELECT to_jsonb(d) FROM sale_request_post_inspection_decisions d WHERE d.id = $3) AS dec`,
      [saleRequestId, inspectionId, decisionId]
    );

    expect(after.rows[0].sel).toEqual(before.rows[0].sel);
    expect(after.rows[0].insp).toEqual(before.rows[0].insp);
    expect(after.rows[0].dec).toEqual(before.rows[0].dec);
  });

  it("a PF errada recebe 404 e nada é gravado", async () => {
    const { saleRequestId } = await seedFinalOffer();

    const result = await respond(saleRequestId, "accepted", { owner: world.otherOwnerId });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);

    expect(await readOwnerDecisions(saleRequestId)).toHaveLength(0);
    expect((await readRequest(saleRequestId)).status).toBe("final_offer_submitted");
  });

  it("final_offer_declined não pode receber decisão do proprietário (§13)", async () => {
    const { saleRequestId } = await seedFinalOffer({ decisionType: "no_offer" });
    expect((await readRequest(saleRequestId)).status).toBe("final_offer_declined");

    for (const decision of ["accepted", "rejected"]) {
      const result = await respond(saleRequestId, decision);
      expect(result.ok, `decisão ${decision}`).toBe(false);
      expect(result.status).toBe(409);
      expect(result.code).toBe("OWNER_FINAL_DECISION_INVALID_STATE");
    }

    expect(await readOwnerDecisions(saleRequestId)).toHaveLength(0);
    expect((await readRequest(saleRequestId)).status).toBe("final_offer_declined");
  });
});

// ============================================================================
describe.sequential("integração — integridade que só o banco prova (§33)", () => {
  /**
   * SQL CRU montando a decisão com peças de negócios DIFERENTES.
   *
   * A `sale_request_id` é de um negócio; a `post_inspection_decision_id` é do
   * outro. Cada peça, isolada, existe e é válida — é exatamente o conjunto que
   * uma FK simples por coluna aceitaria sem reclamar.
   */
  it("recusa uma decisão cuja solicitação não é a da proposta final", async () => {
    const first = await seedFinalOffer();
    const second = await seedFinalOffer();

    const code = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'accepted', 60000.00, $4)`,
      [first.saleRequestId, second.decisionId, first.advertiserId, world.ownerId]
    );

    expect(code).toBe("23503");
    expect(await readOwnerDecisions(first.saleRequestId)).toHaveLength(0);
  });

  it("recusa uma decisão cujo advertiser não é o da proposta final", async () => {
    const { saleRequestId, decisionId } = await seedFinalOffer();

    const code = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'accepted', 60000.00, $4)`,
      [saleRequestId, decisionId, String(world.advertiserIds[1]), world.ownerId]
    );

    expect(code).toBe("23503");
  });

  /**
   * §35, a prova estrutural: um snapshot DIFERENTE do valor apresentado não
   * grava.
   *
   * É este teste que transforma "o service copia o valor certo" em "o banco
   * recusa qualquer outro". Se a FK composta perdesse a coluna `final_amount`,
   * este INSERT passaria — e passaria em silêncio.
   */
  it("recusa um snapshot que não é o valor da proposta final", async () => {
    const { saleRequestId, decisionId, advertiserId } = await seedFinalOffer({
      finalAmount: "60000",
    });

    const code = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'accepted', 1.00, $4)`,
      [saleRequestId, decisionId, advertiserId, world.ownerId]
    );

    expect(code).toBe("23503");
  });

  /**
   * §10 — a decisão só existe sobre uma proposta REAL.
   *
   * Duas barreiras independentes: o CHECK fixa a cópia em `final_offer`, e a FK
   * exige que a cópia case com o pai. Apontar para um `no_offer` esbarra nas
   * duas — o CHECK primeiro, se a cópia disser a verdade; a FK, se ela mentir.
   */
  it("recusa uma decisão sobre uma decisão no_offer", async () => {
    const { saleRequestId, decisionId, advertiserId } = await seedFinalOffer({
      decisionType: "no_offer",
    });

    // Cópia HONESTA do tipo: o CHECK recusa.
    const checkCode = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'no_offer', 'accepted', 60000.00, $4)`,
      [saleRequestId, decisionId, advertiserId, world.ownerId]
    );
    expect(checkCode).toBe("23514");

    // Cópia MENTIROSA: o CHECK passa, e a FK recusa — não existe linha-pai
    // `final_offer` com aquele id.
    const fkCode = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'accepted', 60000.00, $4)`,
      [saleRequestId, decisionId, advertiserId, world.ownerId]
    );
    expect(fkCode).toBe("23503");

    expect(await readOwnerDecisions(saleRequestId)).toHaveLength(0);
  });

  it("recusa uma SEGUNDA decisão na mesma solicitação, por SQL cru", async () => {
    const { saleRequestId, decisionId, advertiserId } = await seedFinalOffer();
    await respond(saleRequestId, "accepted");

    const code = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'rejected', 60000.00, $4)`,
      [saleRequestId, decisionId, advertiserId, world.ownerId]
    );

    expect(code).toBe("23505");
    expect(await readOwnerDecisions(saleRequestId)).toHaveLength(1);
  });

  it("recusa um decision_type fora do vocabulário", async () => {
    const { saleRequestId, decisionId, advertiserId } = await seedFinalOffer();

    const code = await pgErrorCode(
      `INSERT INTO sale_request_owner_final_decisions (
         sale_request_id, post_inspection_decision_id, advertiser_id,
         post_inspection_decision_type, decision_type, final_amount_snapshot,
         decided_by_user_id
       ) VALUES ($1, $2, $3, 'final_offer', 'maybe', 60000.00, $4)`,
      [saleRequestId, decisionId, advertiserId, world.ownerId]
    );

    expect(code).toBe("23514");
  });

  /**
   * §33 (21) — a trilha auditável não some quando seria consultada.
   *
   * Nenhuma FK desta fase declara `ON DELETE CASCADE`. Apagar a solicitação com
   * uma decisão registrada é RECUSADO — que é o comportamento certo para uma
   * trilha: o dia em que ela sumiria em silêncio é justamente o dia em que
   * alguém precisaria dela.
   */
  it("não há CASCADE: apagar a solicitação com trilha é recusado", async () => {
    const { saleRequestId } = await seedFinalOffer();
    await respond(saleRequestId, "accepted");

    const code = await pgErrorCode(`DELETE FROM sale_requests WHERE id = $1`, [saleRequestId]);
    expect(code).toBe("23503");
    expect(await readOwnerDecisions(saleRequestId)).toHaveLength(1);

    const { rows } = await pool.query(
      `SELECT confdeltype FROM pg_constraint
        WHERE conname LIKE 'sale_request_owner_final_decisions_%_fk'`
    );
    // 'a' = NO ACTION. Nenhuma das FKs cascateia.
    for (const row of rows) expect(row.confdeltype).toBe("a");
  });
});

// ============================================================================
describe.sequential("integração — idempotência e concorrência (§16, §17, §36)", () => {
  it("retry da MESMA decisão é idempotente, sem segunda linha nem segundo aviso", async () => {
    for (const decision of ["accepted", "rejected"]) {
      const { saleRequestId } = await seedFinalOffer();

      const first = await respond(saleRequestId, decision);
      const second = await respond(saleRequestId, decision);

      expect(first.result.changed, `primeira ${decision}`).toBe(true);
      expect(second.ok, `retry ${decision}`).toBe(true);
      expect(second.result.changed).toBe(false);

      expect(await readOwnerDecisions(saleRequestId)).toHaveLength(1);
      const sent = await readNotifications(saleRequestId);
      expect(sent.filter((n) => n.event_type.startsWith("sale_request.final_offer_a") ||
                                n.event_type.startsWith("sale_request.final_offer_r"))
      ).toHaveLength(1);
    }
  });

  it("a decisão OPOSTA depois de decidido é 409, e nada muda", async () => {
    const pairs = [
      ["accepted", "rejected", "final_offer_accepted"],
      ["rejected", "accepted", "final_offer_rejected"],
    ];

    for (const [first, opposite, expectedStatus] of pairs) {
      const { saleRequestId } = await seedFinalOffer();
      await respond(saleRequestId, first);

      const result = await respond(saleRequestId, opposite);
      expect(result.ok, `${first} → ${opposite}`).toBe(false);
      expect(result.status).toBe(409);
      expect(result.code).toBe("OWNER_FINAL_DECISION_ALREADY_DECIDED");

      const trail = await readOwnerDecisions(saleRequestId);
      expect(trail).toHaveLength(1);
      expect(trail[0].decision_type).toBe(first);
      expect((await readRequest(saleRequestId)).status).toBe(expectedStatus);
    }
  });

  /**
   * §36 — O TESTE CRÍTICO DESTA FASE.
   *
   * `accepted` e `rejected` partem juntos contra a MESMA solicitação. Com jitter,
   * para que a ordem real de chegada varie entre as rodadas — sem ele, a mesma
   * ordem se repetiria e o teste provaria um caso só.
   *
   * A invariante é dupla e indivisível:
   *
   *   COUNT(trilha) = 1
   *   status = final_offer_accepted  ⇔  decision_type = accepted
   *   status = final_offer_rejected  ⇔  decision_type = rejected
   *
   * A combinação CRUZADA é o desastre que este teste existe para impedir: o
   * proprietário vê "recusada" e a loja recebe "aceita". Nenhuma constraint do
   * banco pode recusá-la (são tabelas diferentes), então quem a impede é o lock
   * mais o mapa único decisão → status.
   */
  it("accepted × rejected simultâneos: exatamente uma vence, e o estado concorda", async () => {
    for (let round = 0; round < 6; round += 1) {
      const { saleRequestId } = await seedFinalOffer();

      const jitterA = round % 3;
      const jitterB = (round + 1) % 3;

      const [a, b] = await Promise.all([
        respond(saleRequestId, "accepted", { delayMs: jitterA }),
        respond(saleRequestId, "rejected", { delayMs: jitterB }),
      ]);

      const trail = await readOwnerDecisions(saleRequestId);
      expect(trail, `rodada ${round}`).toHaveLength(1);

      const request = await readRequest(saleRequestId);

      // Estado e trilha, sempre de acordo. Nunca a combinação cruzada.
      if (trail[0].decision_type === "accepted") {
        expect(request.status, `rodada ${round}`).toBe("final_offer_accepted");
      } else {
        expect(request.status, `rodada ${round}`).toBe("final_offer_rejected");
      }

      // Uma venceu; a outra recebeu 409 e não gravou nada.
      const winners = [a, b].filter((r) => r.ok && r.result?.changed === true);
      expect(winners, `rodada ${round}`).toHaveLength(1);

      const losers = [a, b].filter((r) => !r.ok);
      expect(losers, `rodada ${round}`).toHaveLength(1);
      expect(losers[0].status).toBe(409);

      // E exatamente UM aviso, do tipo que corresponde à decisão vencedora.
      const sent = await readNotifications(saleRequestId);
      const decisionEvents = sent.filter(
        (n) =>
          n.event_type === "sale_request.final_offer_accepted" ||
          n.event_type === "sale_request.final_offer_rejected"
      );
      expect(decisionEvents, `rodada ${round}`).toHaveLength(1);
      expect(decisionEvents[0].event_type).toBe(
        `sale_request.final_offer_${trail[0].decision_type}`
      );
    }
  });

  /**
   * §17 — `accepted` × `accepted` simultâneos.
   *
   * Aqui NENHUMA das duas está errada: as duas querem a mesma coisa. O esperado
   * é que ambas terminem semanticamente bem-sucedidas — uma com `changed: true`
   * e a outra com `changed: false` —, sobre uma única linha e um único aviso.
   *
   * Um 409 aqui seria um defeito: é o cenário do duplo clique, e o segundo
   * clique pediu exatamente o que o primeiro conseguiu.
   */
  it("accepted × accepted simultâneos: ambas bem-sucedidas, uma linha, um aviso", async () => {
    for (let round = 0; round < 4; round += 1) {
      const { saleRequestId } = await seedFinalOffer();

      const [a, b] = await Promise.all([
        respond(saleRequestId, "accepted", { delayMs: round % 2 }),
        respond(saleRequestId, "accepted", { delayMs: (round + 1) % 2 }),
      ]);

      expect(a.ok, `rodada ${round} — A`).toBe(true);
      expect(b.ok, `rodada ${round} — B`).toBe(true);

      const changed = [a, b].filter((r) => r.result?.changed === true);
      expect(changed, `rodada ${round}`).toHaveLength(1);

      expect(await readOwnerDecisions(saleRequestId)).toHaveLength(1);

      const sent = await readNotifications(saleRequestId);
      expect(
        sent.filter((n) => n.event_type === "sale_request.final_offer_accepted"),
        `rodada ${round}`
      ).toHaveLength(1);

      expect((await readRequest(saleRequestId)).status).toBe("final_offer_accepted");
    }
  });

  /**
   * §19 — a notificação está DENTRO da transação, e não é best-effort.
   *
   * A prova é por contradição: força-se a INSERÇÃO DA NOTIFICAÇÃO a falhar e
   * observa-se se a decisão sobreviveu. Se ela sobreviver, a notificação está
   * fora da transação — e o proprietário teria aceitado uma proposta sem que a
   * loja jamais ficasse sabendo, num produto onde o aviso É o canal.
   *
   * A falha é induzida por um CHECK temporário em `user_notifications` que
   * recusa exatamente o evento desta fase. É determinístico e cirúrgico: não
   * depende de FK de terceiros, não mexe em `users` nem em `advertisers` (onde
   * um DELETE esbarraria em `advertisers_user_id_fkey`), e falha no INSERT
   * certo — o passo 9 da transação, o último antes do commit.
   *
   * O CHECK é removido no `finally`: os outros testes deste describe rodam em
   * sequência sobre o MESMO banco, e uma constraint esquecida aqui os derrubaria
   * a todos com uma mensagem que não teria nada a ver com o defeito real.
   */
  it("se a notificação falha, a decisão INTEIRA é revertida", async () => {
    const { saleRequestId } = await seedFinalOffer();

    await pool.query(
      `ALTER TABLE user_notifications
         ADD CONSTRAINT tmp_reject_final_decision_event
         CHECK (event_type <> 'sale_request.final_offer_accepted')`
    );

    try {
      const result = await respond(saleRequestId, "accepted");

      expect(result.ok).toBe(false);

      // O ponto do teste: NADA foi gravado. Nem a trilha, nem o status.
      expect(await readOwnerDecisions(saleRequestId)).toHaveLength(0);
      expect((await readRequest(saleRequestId)).status).toBe("final_offer_submitted");
      expect(await readNotifications(saleRequestId)).toEqual(
        // As notificações das fases ANTERIORES continuam lá — o rollback é da
        // transação desta decisão, não do histórico da solicitação.
        expect.arrayContaining([])
      );
    } finally {
      await pool.query(
        `ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS tmp_reject_final_decision_event`
      );
    }

    // E depois de removida a barreira, a MESMA decisão passa: o que falhou foi
    // a gravação do aviso, e não a solicitação ter ficado num estado impossível.
    const retry = await respond(saleRequestId, "accepted");
    expect(retry.ok).toBe(true);
    expect(retry.result.changed).toBe(true);
    expect((await readRequest(saleRequestId)).status).toBe("final_offer_accepted");
  });
});

// ============================================================================
describe.sequential("integração — o que as duas telas veem (§29, §30, §31)", () => {
  it("o proprietário vê a decisão; a loja selecionada também, sem o valor duplicado", async () => {
    const { saleRequestId } = await seedFinalOffer();
    await respond(saleRequestId, "accepted");

    const owner = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(owner.sale_request.status).toBe("final_offer_accepted");
    expect(Object.keys(owner.owner_final_decision).sort()).toEqual([
      "decided_at",
      "final_amount",
      "type",
    ]);
    expect(String(owner.owner_final_decision.final_amount)).toBe("60000.00");

    const dealer = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[0],
      saleRequestId,
      {}
    );
    expect(Object.keys(dealer.sale_opportunity.owner_final_decision).sort()).toEqual([
      "decided_at",
      "type",
    ]);
    expect(dealer.sale_opportunity.owner_final_decision.type).toBe("accepted");
    expect(dealer.sale_opportunity.is_selected).toBe(true);
  });

  it("a loja PERDEDORA continua recebendo 404 nos dois estados novos", async () => {
    for (const decision of ["accepted", "rejected"]) {
      const { saleRequestId } = await seedFinalOffer();
      await respond(saleRequestId, decision);

      const result = await attempt(() =>
        dealerService.getDealerSaleOpportunity(world.dealerIds[1], saleRequestId, {})
      );
      expect(result.ok, `decisão ${decision}`).toBe(false);
      expect(result.status).toBe(404);
    }
  });

  /** §31 — a nota interna da loja não atravessa, e o contato de ninguém também não. */
  it("nenhum DTO carrega internal_note nem dado de contato", async () => {
    const { saleRequestId } = await seedFinalOffer();
    await respond(saleRequestId, "accepted");

    const owner = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    const dealer = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[0],
      saleRequestId,
      {}
    );

    expect(JSON.stringify(owner)).not.toMatch(/internal_note|Margem apertada/i);
    expect(JSON.stringify(dealer)).not.toMatch(/owner_user_id|decided_by_user_id/i);
    expect(JSON.stringify(dealer)).not.toMatch(/@decision\.test/i);
  });

  /**
   * §28 — o cancelamento não cria sucesso falso depois da decisão.
   *
   * O guard usa a lista de estados com seleção, e ela cresceu junto com a
   * máquina. Uma igualdade que envelheceu faria o `UPDATE` não casar linha e o
   * service responder 200 — dizendo "cancelada" sobre uma solicitação cuja
   * proposta acabou de ser aceita.
   */
  it("cancelar depois de decidir é 409 nos dois caminhos", async () => {
    for (const [decision, expected] of [
      ["accepted", "final_offer_accepted"],
      ["rejected", "final_offer_rejected"],
    ]) {
      const { saleRequestId } = await seedFinalOffer();
      await respond(saleRequestId, decision);

      const result = await attempt(() =>
        ownerService.cancelMySaleRequest(world.ownerId, saleRequestId)
      );

      expect(result.ok, `decisão ${decision}`).toBe(false);
      expect(result.status).toBe(409);
      expect(result.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
      expect((await readRequest(saleRequestId)).status).toBe(expected);
    }
  });
});
