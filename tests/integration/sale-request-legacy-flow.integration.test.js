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
 * O FLUXO APOSENTADO sob PostgreSQL real (Fase 4.7, §11, §12, §32).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO SUBSTITUI
 * ════════════════════════════════════════════════════════════════════════════
 * `sale-request-inspection-final-offer.integration.test.js` (Fase 4.5, 27
 * testes) e `sale-request-owner-final-decision.integration.test.js` (Fase 4.6,
 * 32 testes).
 *
 * Aqueles arquivos exercitavam os SERVICES da avaliação presencial contra
 * PostgreSQL real — agendar, inspecionar, propor valor final, aceitá-lo. A 4.7
 * aposentou os seis writers, e não é possível testar contra o banco um caminho
 * que o service recusa antes de abrir transação.
 *
 * A classificação do §58 aplicada aos 59 testes:
 *
 *   A. invariantes ainda válidos     → PORTADOS: as tabelas, as FKs compostas e
 *                                      os CHECKs das migrations 058 e 059
 *                                      CONTINUAM existindo. Nada foi apagado, e
 *                                      é isso que os §11 e §12 exigem provar;
 *   B. comportamento legacy          → PORTADO: uma linha em estado legado
 *                                      continua satisfazendo o CHECK de
 *                                      coerência da 060 e continua legível
 *                                      pelos DTOs;
 *   C. comportamento removido        → substituído pela prova de que cada writer
 *                                      recusa com 409 e código próprio.
 *
 * Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-legacy-flow.integration.test.js
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
const dbName = `salelegacy_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

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
const ownerService = await import("../../src/modules/sale-requests/sale-requests.service.js");
const dealerService = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.service.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");
const { SALE_REQUEST_LEGACY_STATUSES } = await import(
  "../../src/modules/sale-requests/sale-requests.constants.js"
);

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

  const { rows: c } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const { rows: u } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@legacy.test', 'x', 'Dono', 'cpf'),
            ('a@legacy.test', 'x', 'Loja A', 'cnpj'),
            ('b@legacy.test', 'x', 'Loja B', 'cnpj')
     RETURNING id`
  );

  const advertiserIds = [];
  for (const [index, name] of ["Auto Center", "Prime Veículos"].entries()) {
    const { rows } = await pool.query(
      `INSERT INTO advertisers (user_id, name, slug, city_id, status, address, whatsapp)
       VALUES ($1, $2, $3, $4, 'active', 'Rua das Lojas, 120', '11999990000') RETURNING id`,
      [u[index + 1].id, name, `loja-${index}`, c[0].id]
    );
    advertiserIds.push(rows[0].id);
  }

  return {
    cityId: c[0].id,
    ownerId: String(u[0].id),
    dealerIds: [String(u[1].id), String(u[2].id)],
    advertiserIds,
  };
}

/**
 * Uma solicitação num estado LEGADO, com a cadeia inteira da 4.5/4.6 montada.
 *
 * Por SQL, porque os endpoints que a produziriam já não existem — que é
 * exatamente o que este arquivo prova. As relações e as FKs são as reais: se a
 * 060 tivesse quebrado alguma delas, este fixture morreria aqui.
 */
async function seedLegacyRequest(status, { decisionType = "final_offer" } = {}) {
  const { rows: sr } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, year, mileage, transmission, fuel_type,
       declared_condition, minimum_accepted_price, status
     )
     VALUES ($1, $2, 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
             'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.', 2020, 62000, 'automatico', 'flex',
             'bom', 62500.00, 'receiving_offers')
     RETURNING id`,
    [world.ownerId, world.cityId]
  );
  const saleRequestId = String(sr[0].id);

  const { rows: round } = await pool.query(
    `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
     VALUES ($1, 1, 62500.00) RETURNING id`,
    [saleRequestId]
  );

  const { rows: offer } = await pool.query(
    `INSERT INTO sale_request_offers (sale_request_id, round_id, dealer_user_id, advertiser_id, amount)
     VALUES ($1, $2, $3, $4, 65000.00) RETURNING id`,
    [saleRequestId, round[0].id, world.dealerIds[0], world.advertiserIds[0]]
  );

  await pool.query(
    `INSERT INTO sale_request_offer_selections
       (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
     VALUES ($1, $2, $3, $4, $5, 65000.00)`,
    [saleRequestId, round[0].id, offer[0].id, world.advertiserIds[0], world.ownerId]
  );

  await pool.query(
    `UPDATE sale_requests
        SET status = $2, selected_offer_id = $3, selected_offer_at = NOW()
      WHERE id = $1`,
    [saleRequestId, status, offer[0].id]
  );

  const { rows: inspection } = await pool.query(
    `INSERT INTO sale_request_inspections (
       sale_request_id, advertiser_id, schedule_status, schedule_round,
       observed_mileage, observed_condition, observed_tire_condition,
       observed_engine_condition, observed_gearbox_condition,
       observed_suspension_condition, observed_body_paint_status,
       completed_at, completed_by_user_id, created_by_user_id
     )
     VALUES ($1, $2, 'awaiting_slots', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, NULL, $3)
     RETURNING id`,
    [saleRequestId, world.advertiserIds[0], world.dealerIds[0]]
  );

  await pool.query(
    `INSERT INTO sale_request_post_inspection_decisions (
       sale_request_id, inspection_id, advertiser_id, selected_offer_id,
       decision_type, preliminary_amount_snapshot, final_amount,
       adjustment_reason, internal_note, decided_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, 65000.00, $6, 'tires', 'Margem apertada.', $7)`,
    [
      saleRequestId,
      inspection[0].id,
      world.advertiserIds[0],
      offer[0].id,
      decisionType,
      decisionType === "final_offer" ? "60000.00" : null,
      world.dealerIds[0],
    ]
  );

  return { saleRequestId, offerId: String(offer[0].id), inspectionId: String(inspection[0].id) };
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

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool?.().catch?.(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
  await adminPool.end().catch(() => {});
});

// ============================================================================
describe.sequential("integração — NADA das migrations 058 e 059 foi destruído (§11)", () => {
  it("as quatro tabelas legadas continuam existindo", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'sale_request_inspections',
            'sale_request_inspection_slots',
            'sale_request_post_inspection_decisions',
            'sale_request_owner_final_decisions'
          )
        ORDER BY table_name`
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "sale_request_inspection_slots",
      "sale_request_inspections",
      "sale_request_owner_final_decisions",
      "sale_request_post_inspection_decisions",
    ]);
  });

  it("a FK de 5 colunas da 4.6 continua intacta", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_owner_final_decisions_source_fk'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain("post_inspection_decision_type");
    expect(rows[0].def).toContain("final_amount_snapshot");
  });

  it("a FK composta do horário confirmado (4.5) continua intacta", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_inspections_confirmed_slot_fk'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain("(confirmed_slot_id, id)");
  });

  /**
   * A ÚNICA relaxação deliberada da 060, documentada na própria migration.
   *
   * `sale_request_inspections_selected_store_fk` provava "esta inspeção é da
   * loja SELECIONADA". Com histórico de seleções essa proposição deixou de ser
   * bem definida — a mesma solicitação pode ter tido duas lojas escolhidas — e a
   * UNIQUE que era alvo dela precisou ganhar a rodada.
   *
   * O teste existe para que a remoção seja uma decisão VISÍVEL, e não algo que
   * alguém descubra por acaso três fases adiante.
   */
  it("a FK da loja selecionada na inspeção foi removida — deliberadamente", async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'sale_request_inspections_selected_store_fk'`
    );
    expect(rows).toHaveLength(0);

    // O que a substituiu: a UNIQUE da trilha agora inclui a rodada.
    const { rows: unique } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_offer_selections_request_advertiser_round_unique'`
    );
    expect(unique[0].def).toContain("UNIQUE (sale_request_id, advertiser_id, round_id)");
  });

  it("as demais FKs da inspeção continuam de pé", async () => {
    const { rows } = await pool.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'sale_request_inspections'::regclass AND contype = 'f'
        ORDER BY conname`
    );
    const names = rows.map((r) => r.conname);
    expect(names).toContain("sale_request_inspections_request_fk");
    expect(names).toContain("sale_request_inspections_advertiser_fk");
  });
});

// ============================================================================
describe.sequential("integração — os estados legados continuam VÁLIDOS (§12)", () => {
  it("cada um dos seis satisfaz o CHECK de coerência da 060", async () => {
    for (const status of SALE_REQUEST_LEGACY_STATUSES) {
      const { saleRequestId } = await seedLegacyRequest(status);

      const { rows } = await pool.query(
        `SELECT status, selected_offer_id, current_round_number
           FROM sale_requests WHERE id = $1`,
        [saleRequestId]
      );

      expect(rows[0].status, status).toBe(status);
      expect(rows[0].selected_offer_id, `seleção de ${status}`).not.toBeNull();
      // O backfill não se aplica (a linha nasceu depois), mas o DEFAULT sim.
      expect(rows[0].current_round_number).toBe(1);
    }
  });

  it("um estado legado SEM seleção continua sendo recusado", async () => {
    const { rows } = await pool.query(
      `INSERT INTO sale_requests (
         owner_user_id, city_id, brand, brand_slug, model, model_slug,
         fipe_model_description, year, mileage, transmission, fuel_type,
         declared_condition, status
       )
       VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo 1.0', 2019, 60000,
               'manual', 'flex', 'bom', 'receiving_offers')
       RETURNING id`,
      [world.ownerId, world.cityId]
    );

    let code = null;
    try {
      await pool.query(`UPDATE sale_requests SET status = 'final_offer_submitted' WHERE id = $1`, [
        rows[0].id,
      ]);
    } catch (error) {
      code = error?.code ?? "unknown";
    }
    expect(code).toBe("23514");
  });

  it("os DTOs continuam servindo inspeção e proposta final das linhas legadas", async () => {
    const { saleRequestId } = await seedLegacyRequest("final_offer_submitted");

    const owner = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);
    expect(owner.sale_request.status).toBe("final_offer_submitted");
    expect(owner.inspection).toBeTruthy();
    expect(owner.final_decision.final_amount).toBe("60000.00");

    // E a nota interna da loja continua sem atravessar.
    expect(JSON.stringify(owner)).not.toMatch(/internal_note|Margem apertada/i);

    const dealer = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[0],
      saleRequestId,
      {}
    );
    expect(dealer.sale_opportunity.is_selected).toBe(true);
  });

  it("a loja perdedora continua 404 nos estados legados", async () => {
    for (const status of SALE_REQUEST_LEGACY_STATUSES) {
      const { saleRequestId } = await seedLegacyRequest(status);

      const result = await attempt(() =>
        dealerService.getDealerSaleOpportunity(world.dealerIds[1], saleRequestId, {})
      );
      expect(result.ok, status).toBe(false);
      expect(result.status).toBe(404);
    }
  });
});

// ============================================================================
describe.sequential("integração — os SEIS writers recusam (§32)", () => {
  const LEGACY_CODE = "SALE_REQUEST_LEGACY_FLOW_RETIRED";

  it("recusa os quatro writers da 4.5 e os dois da 4.6", async () => {
    const { saleRequestId } = await seedLegacyRequest("final_offer_submitted");

    const writers = [
      [
        "offerInspectionSlots",
        () =>
          inspectionService.offerInspectionSlots(world.dealerIds[0], saleRequestId, {
            slots: ["2026-09-01T10:00:00-03:00"],
          }),
      ],
      [
        "confirmInspectionSlot",
        () =>
          inspectionService.confirmInspectionSlot(world.ownerId, saleRequestId, { slot_id: "1" }),
      ],
      [
        "requestNewInspectionSlots",
        () => inspectionService.requestNewInspectionSlots(world.ownerId, saleRequestId),
      ],
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
      expect(result.code, name).toBe(LEGACY_CODE);
    }
  });

  it("nenhum deles escreve linha nenhuma no banco", async () => {
    const { saleRequestId } = await seedLegacyRequest("final_offer_submitted");

    const before = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM sale_request_inspection_slots) AS slots,
         (SELECT count(*)::int FROM sale_request_owner_final_decisions) AS owner_decisions,
         (SELECT count(*)::int FROM user_notifications) AS notifications,
         (SELECT status FROM sale_requests WHERE id = $1) AS status`,
      [saleRequestId]
    );

    await attempt(() =>
      inspectionService.offerInspectionSlots(world.dealerIds[0], saleRequestId, {
        slots: ["2026-09-01T10:00:00-03:00"],
      })
    );
    await attempt(() =>
      finalDecisionService.decideFinalOffer(world.ownerId, saleRequestId, { decision: "accepted" })
    );

    const after = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM sale_request_inspection_slots) AS slots,
         (SELECT count(*)::int FROM sale_request_owner_final_decisions) AS owner_decisions,
         (SELECT count(*)::int FROM user_notifications) AS notifications,
         (SELECT status FROM sale_requests WHERE id = $1) AS status`,
      [saleRequestId]
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  /**
   * A recusa acontece ANTES de qualquer leitura de estado — inclusive para uma
   * solicitação da experiência 4.7, em `offer_selected`.
   *
   * É o que garante que nenhuma solicitação NOVA entra na máquina aposentada.
   */
  it("recusa também numa solicitação 4.7, em offer_selected", async () => {
    const { saleRequestId } = await seedLegacyRequest("offer_selected");

    const result = await attempt(() =>
      inspectionService.offerInspectionSlots(world.dealerIds[0], saleRequestId, {
        slots: ["2026-09-01T10:00:00-03:00"],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe(LEGACY_CODE);
  });
});
