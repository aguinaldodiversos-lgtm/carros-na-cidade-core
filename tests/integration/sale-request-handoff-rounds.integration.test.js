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
 * RODADAS, RESSELEÇÃO e HANDOFF sob PostgreSQL real (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SÓ EXISTE AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *   §49  o BACKFILL da 060 sobre um banco povoado com os NOVE estados — o
 *        cenário de produção. Um banco vazio não revela nada: não há linha para
 *        violar CHECK nenhum, e foi assim que o defeito da 057 sobreviveu;
 *
 *   §50  a integridade composta. Uma oferta apontando a rodada de OUTRO veículo,
 *        uma seleção apontando oferta de OUTRA rodada, duas rodadas com o mesmo
 *        número. Cada peça, isolada, é válida — é o conjunto que é ficção, e
 *        só uma FK composta o recusa;
 *
 *   §41  duas resseleções simultâneas;
 *   §42  resseleção × nova rodada;
 *   §43  duas rodadas 2 ao mesmo tempo.
 *
 * O teste de service roda contra um array com uma "conexão" só: um service SEM
 * transação nenhuma passaria em todos os casos daquele arquivo.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-handoff-rounds.integration.test.js
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
const dbName = `salerounds_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
const upgradeDbName = `saleroundsup_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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
const dealerService = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.service.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

let world;

const OFFER_A = "65000";
const OFFER_B = "63500";
const OFFER_C = "62000";

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
     VALUES ('Atibaia', 'SP', 'atibaia-sp')
     RETURNING id`
  );

  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@rounds.test', 'x', 'Dono', 'cpf'),
            ('other@rounds.test', 'x', 'Outro', 'cpf')
     RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@rounds.test', 'x', 'Loja A', 'cnpj'),
            ('b@rounds.test', 'x', 'Loja B', 'cnpj'),
            ('c@rounds.test', 'x', 'Loja C', 'cnpj')
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

/**
 * Publica pelo SERVICE real — é o caminho que cria a rodada 1 na mesma
 * transação. Um INSERT à mão pularia justamente a parte que esta fase criou.
 */
let publishSeq = 0;

/**
 * Publica pelo SERVICE real.
 *
 * As chaves de foto sao unicas por publicacao: `sale_request_images.storage_key`
 * tem UNIQUE GLOBAL (migration 053), e reaproveita-las faz o segundo publish
 * morrer com 23505 numa asserção que nao tem nada a ver com o teste.
 */
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
        (i) => `sale-requests/${world.ownerId}/pg/2026/08/r${publishSeq}-foto-${i}.webp`
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

const accept = (saleRequestId, offerId, { owner, delayMs = 0 } = {}) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return selectionService.selectSaleRequestOffer(owner ?? world.ownerId, saleRequestId, {
      offer_id: String(offerId),
    });
  });

const noAgreement = (saleRequestId, { owner } = {}) =>
  attempt(() => handoffService.reportNoAgreement(owner ?? world.ownerId, saleRequestId));

const openRound = (saleRequestId, minimum, { owner, delayMs = 0 } = {}) =>
  attempt(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return handoffService.openNewRound(owner ?? world.ownerId, saleRequestId, {
      minimum_accepted_price: minimum,
    });
  });

async function readRequest(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT status, current_round_number,
            selected_offer_id::text AS selected_offer_id, selected_offer_at
       FROM sale_requests WHERE id = $1`,
    [saleRequestId]
  );
  return rows[0];
}

async function readRounds(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, round_number, minimum_accepted_price::text AS minimum
       FROM sale_request_rounds WHERE sale_request_id = $1 ORDER BY round_number`,
    [saleRequestId]
  );
  return rows;
}

async function readSelections(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id, round_id::text AS round_id, offer_id::text AS offer_id,
            advertiser_id::text AS advertiser_id, amount_snapshot::text AS amount_snapshot
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
describe.sequential("integração — o SCHEMA da migration 060", () => {
  it("o CHECK de status aceita handoff_failed e mantém os NOVE anteriores", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_requests_status_check'`
    );

    for (const status of [
      "receiving_offers",
      "offer_selected",
      "handoff_failed",
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

  it("handoff_failed exige seleção; receiving_offers exige a ausência dela", async () => {
    const saleRequestId = await publishRequest();
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerId);

    // Com seleção: passa.
    expect(
      await pgErrorCode(`UPDATE sale_requests SET status = 'handoff_failed' WHERE id = $1`, [
        saleRequestId,
      ])
    ).toBeNull();

    // Voltar a receiving_offers SEM limpar o ponteiro viola a partição.
    expect(
      await pgErrorCode(`UPDATE sale_requests SET status = 'receiving_offers' WHERE id = $1`, [
        saleRequestId,
      ])
    ).toBe("23514");
  });

  it("a publicação cria a rodada 1 na MESMA transação", async () => {
    const saleRequestId = await publishRequest({ minimum: "60000" });

    const rounds = await readRounds(saleRequestId);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].round_number).toBe(1);
    expect(rounds[0].minimum).toBe("60000.00");
    expect((await readRequest(saleRequestId)).current_round_number).toBe(1);
  });

  it("a UNIQUE de UMA seleção por solicitação foi substituída pela de oferta", async () => {
    const { rows: old } = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'sale_request_offer_selections_request_uidx'`
    );
    expect(old).toHaveLength(0);

    const { rows: fresh } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_offer_selections_request_offer_unique'`
    );
    expect(fresh[0].def).toContain("UNIQUE (sale_request_id, offer_id)");
  });

  it("a FK da seleção prova oferta + solicitação + loja + RODADA", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_offer_selections_offer_round_fk'`
    );
    expect(rows[0].def).toContain("(offer_id, sale_request_id, advertiser_id, round_id)");
    expect(rows[0].def).not.toMatch(/MATCH FULL/i);
  });
});

// ============================================================================
describe.sequential("integração — UPGRADE 059 → 060 (§49)", () => {
  /**
   * O cenário de produção: um banco com solicitações nos NOVE estados da 4.6,
   * com ofertas e seleções, e a 060 entrando em cima.
   *
   * Se o backfill deixasse uma linha sem rodada, o `SET NOT NULL` de
   * `offers.round_id` morreria aqui — sobre dados reais.
   */
  it("aplica sobre um banco povoado e faz o backfill da rodada 1", async () => {
    const upgradeUrl = makeDatabaseUrl(upgradeDbName);
    await runMigrations(upgradeUrl);

    const up = new Pool(buildPoolConfig(upgradeUrl));

    try {
      // 1. Desfaz a 060 — o banco volta ao estado exato da 4.6.
      await up.query(`DROP TABLE IF EXISTS sale_request_handoff_outcomes CASCADE`);
      await up.query(
        `ALTER TABLE sale_request_offer_selections
           DROP CONSTRAINT IF EXISTS sale_request_offer_selections_offer_round_fk,
           DROP CONSTRAINT IF EXISTS sale_request_offer_selections_request_offer_unique,
           DROP CONSTRAINT IF EXISTS sale_request_offer_selections_id_request_unique,
           DROP CONSTRAINT IF EXISTS sale_request_offer_selections_request_advertiser_round_unique,
           DROP COLUMN IF EXISTS round_id`
      );
      await up.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS sale_request_offer_selections_request_uidx
           ON sale_request_offer_selections (sale_request_id)`
      );
      await up.query(
        `ALTER TABLE sale_request_offers
           DROP CONSTRAINT IF EXISTS sale_request_offers_round_request_fk,
           DROP CONSTRAINT IF EXISTS sale_request_offers_id_request_advertiser_round_unique,
           DROP COLUMN IF EXISTS round_id`
      );
      await up.query(
        `ALTER TABLE sale_requests
           DROP CONSTRAINT IF EXISTS sale_requests_current_round_check,
           DROP COLUMN IF EXISTS current_round_number`
      );
      await up.query(`DROP TABLE IF EXISTS sale_request_rounds CASCADE`);
      await up.query(
        `ALTER TABLE sale_requests DROP CONSTRAINT IF EXISTS sale_requests_status_check`
      );
      await up.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_status_check
           CHECK (status IN (
             'receiving_offers', 'offer_selected', 'inspection_scheduled',
             'inspection_completed', 'final_offer_submitted', 'final_offer_declined',
             'final_offer_accepted', 'final_offer_rejected', 'cancelled'
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
             (status IN ('offer_selected','inspection_scheduled','inspection_completed',
                         'final_offer_submitted','final_offer_declined',
                         'final_offer_accepted','final_offer_rejected')
              AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL)
             OR
             (status IN ('receiving_offers','cancelled')
              AND selected_offer_id IS NULL AND selected_offer_at IS NULL)
           )`
      );
      await up.query(`DELETE FROM schema_migrations WHERE filename LIKE '060%'`);

      // 2. Povoa: uma linha em CADA estado da 4.6.
      const { rows: c } = await up.query(
        `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-up7') RETURNING id`
      );
      const { rows: u } = await up.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('o@up7.test', 'x', 'Dono', 'cpf'), ('d@up7.test', 'x', 'Loja', 'cnpj')
         RETURNING id`
      );
      const { rows: adv } = await up.query(
        `INSERT INTO advertisers (user_id, name, slug, city_id, status, address)
         VALUES ($1, 'Loja Legada', 'loja-up7', $2, 'active', 'Rua X, 1') RETURNING id`,
        [u[1].id, c[0].id]
      );

      const LEGACY = [
        "receiving_offers",
        "cancelled",
        "offer_selected",
        "inspection_scheduled",
        "inspection_completed",
        "final_offer_submitted",
        "final_offer_declined",
        "final_offer_accepted",
        "final_offer_rejected",
      ];
      const withSelection = new Set(LEGACY.slice(2));

      const ids = {};
      for (const status of LEGACY) {
        const { rows } = await up.query(
          `INSERT INTO sale_requests (
             owner_user_id, city_id, brand, brand_slug, model, model_slug,
             fipe_model_description, year, mileage, transmission, fuel_type,
             declared_condition, minimum_accepted_price, status
           )
           VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo 1.0', 2019, 60000,
                   'manual', 'flex', 'bom', 48000.00, 'receiving_offers')
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

      // 3. Reaplica a 060 sobre o banco povoado.
      await runMigrations(upgradeUrl);

      // 4. TODOS os estados sobreviveram, com a seleção como estava.
      for (const status of LEGACY) {
        const { rows } = await up.query(
          `SELECT status, selected_offer_id, current_round_number
             FROM sale_requests WHERE id = $1`,
          [ids[status]]
        );
        expect(rows[0].status, `estado ${status}`).toBe(status);
        expect(rows[0].current_round_number, `rodada de ${status}`).toBe(1);

        if (withSelection.has(status)) {
          expect(rows[0].selected_offer_id, `seleção de ${status}`).not.toBeNull();
        } else {
          expect(rows[0].selected_offer_id, `sem seleção em ${status}`).toBeNull();
        }
      }

      // 5. O BACKFILL: rodada 1 para todos, com o piso original, e toda oferta
      //    e toda seleção vinculadas a ela.
      const { rows: rounds } = await up.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE round_number = 1)::int AS first_round,
                count(*) FILTER (WHERE minimum_accepted_price = 48000.00)::int AS with_minimum
           FROM sale_request_rounds`
      );
      expect(rounds[0].total).toBe(LEGACY.length);
      expect(rounds[0].first_round).toBe(LEGACY.length);
      expect(rounds[0].with_minimum).toBe(LEGACY.length);

      const { rows: orphans } = await up.query(
        `SELECT
           (SELECT count(*)::int FROM sale_request_offers WHERE round_id IS NULL) AS offers,
           (SELECT count(*)::int FROM sale_request_offer_selections WHERE round_id IS NULL) AS selections`
      );
      expect(orphans[0].offers).toBe(0);
      expect(orphans[0].selections).toBe(0);

      // 6. E cada oferta ficou na rodada da PRÓPRIA solicitação.
      const { rows: mismatched } = await up.query(
        `SELECT count(*)::int AS total
           FROM sale_request_offers o
           JOIN sale_request_rounds r ON r.id = o.round_id
          WHERE r.sale_request_id <> o.sale_request_id`
      );
      expect(mismatched[0].total).toBe(0);
    } finally {
      await up.end().catch(() => {});
    }
  });
});

// ============================================================================
describe.sequential("integração — integridade que só o banco prova (§50)", () => {
  it("recusa uma oferta apontando a rodada de OUTRA solicitação", async () => {
    const first = await publishRequest();
    const second = await publishRequest();
    const otherRound = (await readRounds(second))[0];

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offers (sale_request_id, round_id, dealer_user_id, advertiser_id, amount)
       VALUES ($1, $2, $3, $4, 60000.00)`,
      [first, otherRound.id, world.dealerIds[0], world.advertiserIds[0]]
    );

    expect(code).toBe("23503");
  });

  it("recusa uma seleção apontando oferta de OUTRA rodada", async () => {
    const saleRequestId = await publishRequest();
    const otherOfferId = await offerFrom(1, saleRequestId, OFFER_B);
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerId);
    await noAgreement(saleRequestId);
    await openRound(saleRequestId, "58000");

    const rounds = await readRounds(saleRequestId);
    const round2 = rounds.find((r) => r.round_number === 2);

    // A oferta e da rodada 1; a selecao declara a rodada 2.
    //
    // Usa a oferta da loja B — NUNCA aceita. A da loja A ja tem selecao, e o
    // UNIQUE (sale_request_id, offer_id) dispararia 23505 antes de a FK ser
    // avaliada: o teste passaria pelo motivo errado.
    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 63500.00)`,
      [saleRequestId, round2.id, otherOfferId, world.advertiserIds[1], world.ownerId]
    );

    expect(code).toBe("23503");
  });

  it("recusa uma seleção com advertiser incompatível com a oferta", async () => {
    const saleRequestId = await publishRequest();
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    const round = (await readRounds(saleRequestId))[0];

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 65000.00)`,
      [saleRequestId, round.id, offerId, world.advertiserIds[1], world.ownerId]
    );

    expect(code).toBe("23503");
  });

  it("recusa DUAS rodadas com o mesmo número", async () => {
    const saleRequestId = await publishRequest();

    const code = await pgErrorCode(
      `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
       VALUES ($1, 1, 58000.00)`,
      [saleRequestId]
    );

    expect(code).toBe("23505");
  });

  it("recusa aceitar DUAS VEZES a mesma oferta", async () => {
    const saleRequestId = await publishRequest();
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    const round = (await readRounds(saleRequestId))[0];
    await accept(saleRequestId, offerId);

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 65000.00)`,
      [saleRequestId, round.id, offerId, world.advertiserIds[0], world.ownerId]
    );

    expect(code).toBe("23505");
  });

  it("recusa encerrar a seleção de OUTRA solicitação", async () => {
    const first = await publishRequest();
    const firstOffer = await offerFrom(0, first, OFFER_A);
    await accept(first, firstOffer);

    const second = await publishRequest();
    const secondOffer = await offerFrom(0, second, OFFER_A);
    await accept(second, secondOffer);

    const otherSelection = (await readSelections(second))[0];

    const code = await pgErrorCode(
      `INSERT INTO sale_request_handoff_outcomes
         (sale_request_id, selection_id, outcome, recorded_by_user_id)
       VALUES ($1, $2, 'no_agreement', $3)`,
      [first, otherSelection.id, world.ownerId]
    );

    expect(code).toBe("23503");
  });

  it("recusa um outcome fora do vocabulário", async () => {
    const saleRequestId = await publishRequest();
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerId);
    const selection = (await readSelections(saleRequestId))[0];

    const code = await pgErrorCode(
      `INSERT INTO sale_request_handoff_outcomes
         (sale_request_id, selection_id, outcome, recorded_by_user_id)
       VALUES ($1, $2, 'agreed', $3)`,
      [saleRequestId, selection.id, world.ownerId]
    );

    expect(code).toBe("23514");
  });

  /** §50 — o histórico não some, e a rodada 1 não é reescrita. */
  it("nova rodada não altera o piso nem as ofertas da rodada 1", async () => {
    const saleRequestId = await publishRequest({ minimum: "60000" });
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerId);
    await noAgreement(saleRequestId);

    const before = await pool.query(
      `SELECT to_jsonb(r) AS round FROM sale_request_rounds r
        WHERE sale_request_id = $1 AND round_number = 1`,
      [saleRequestId]
    );
    const offersBefore = await pool.query(
      `SELECT to_jsonb(o) AS offer FROM sale_request_offers o WHERE sale_request_id = $1 ORDER BY id`,
      [saleRequestId]
    );

    await openRound(saleRequestId, "58000");

    const after = await pool.query(
      `SELECT to_jsonb(r) AS round FROM sale_request_rounds r
        WHERE sale_request_id = $1 AND round_number = 1`,
      [saleRequestId]
    );
    const offersAfter = await pool.query(
      `SELECT to_jsonb(o) AS offer FROM sale_request_offers o WHERE sale_request_id = $1 ORDER BY id`,
      [saleRequestId]
    );

    expect(after.rows[0].round).toEqual(before.rows[0].round);
    expect(offersAfter.rows.map((r) => r.offer)).toEqual(offersBefore.rows.map((r) => r.offer));
  });

  /** A trilha auditável não cascateia. */
  it("apagar a solicitação com trilha é recusado", async () => {
    const saleRequestId = await publishRequest();
    const offerId = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerId);
    await noAgreement(saleRequestId);

    expect(
      await pgErrorCode(`DELETE FROM sale_requests WHERE id = $1`, [saleRequestId])
    ).toBe("23503");
  });
});

// ============================================================================
describe.sequential("integração — o ciclo completo pelos services reais", () => {
  it("aceite → sem acordo → resseleção preserva o histórico", async () => {
    const saleRequestId = await publishRequest();
    // ORDEM CRESCENTE: a regra da 4.3 exige superar a maior atual, entao C
    // (62.000) vem antes de B (63.500), que vem antes de A (65.000).
    await offerFrom(2, saleRequestId, OFFER_C);
    const offerB = await offerFrom(1, saleRequestId, OFFER_B);
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);

    await accept(saleRequestId, offerA);
    expect((await readRequest(saleRequestId)).status).toBe("offer_selected");

    await noAgreement(saleRequestId);
    expect((await readRequest(saleRequestId)).status).toBe("handoff_failed");

    const reselect = await accept(saleRequestId, offerB);
    expect(reselect.ok).toBe(true);

    const request = await readRequest(saleRequestId);
    expect(request.status).toBe("offer_selected");
    expect(request.selected_offer_id).toBe(String(offerB));

    // DUAS seleções, na ordem em que aconteceram.
    const trail = await readSelections(saleRequestId);
    expect(trail).toHaveLength(2);
    expect(trail[0].offer_id).toBe(String(offerA));
    expect(trail[0].amount_snapshot).toBe("65000.00");
    expect(trail[1].offer_id).toBe(String(offerB));

    // E exatamente UM desfecho, sobre a PRIMEIRA seleção.
    const { rows: outcomes } = await pool.query(
      `SELECT selection_id::text AS selection_id, outcome
         FROM sale_request_handoff_outcomes WHERE sale_request_id = $1`,
      [saleRequestId]
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].selection_id).toBe(trail[0].id);
  });

  it("nova rodada limpa o ponteiro e mantém o histórico", async () => {
    const saleRequestId = await publishRequest({ minimum: "60000" });
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerA);
    await noAgreement(saleRequestId);

    await openRound(saleRequestId, "58000");

    const request = await readRequest(saleRequestId);
    expect(request.status).toBe("receiving_offers");
    expect(request.current_round_number).toBe(2);
    expect(request.selected_offer_id).toBeNull();
    expect(request.selected_offer_at).toBeNull();

    // A seleção da rodada 1 continua lá.
    expect(await readSelections(saleRequestId)).toHaveLength(1);

    const rounds = await readRounds(saleRequestId);
    expect(rounds.map((r) => r.minimum)).toEqual(["60000.00", "58000.00"]);
  });

  it("a oferta da rodada 2 usa o piso NOVO e não vê o líder da rodada 1", async () => {
    const saleRequestId = await publishRequest({ minimum: "60000" });
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerA);
    await noAgreement(saleRequestId);
    await openRound(saleRequestId, "58000");

    // 58.000 é MENOR que o líder da rodada 1 (65.000) e passa: a rodada nova
    // não herda a disputa da anterior.
    const result = await attempt(() =>
      offersService.createSaleOffer(world.dealerIds[0], saleRequestId, { amount: "58000" })
    );
    expect(result.ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT r.round_number FROM sale_request_offers o
         JOIN sale_request_rounds r ON r.id = o.round_id
        WHERE o.sale_request_id = $1 ORDER BY o.id DESC LIMIT 1`,
      [saleRequestId]
    );
    expect(rows[0].round_number).toBe(2);
  });

  it("o detalhe do dono mostra as outras ofertas em handoff_failed", async () => {
    const saleRequestId = await publishRequest();
    await offerFrom(1, saleRequestId, OFFER_B);
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerA);
    await noAgreement(saleRequestId);

    const detail = await ownerService.getMySaleRequest(world.ownerId, saleRequestId);

    expect(detail.sale_request.status).toBe("handoff_failed");
    expect(detail.proposals.length).toBe(2);
    expect(detail.selection_history).toHaveLength(1);
    expect(detail.selection_history[0].outcome).toBe("no_agreement");
  });

  it("o WhatsApp resolvido é o da loja aceita, e muda com a resseleção", async () => {
    const saleRequestId = await publishRequest();
    const offerB = await offerFrom(1, saleRequestId, OFFER_B);
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);

    await accept(saleRequestId, offerA);
    const first = await handoffService.getSelectedStoreWhatsapp(world.ownerId, saleRequestId);
    expect(first.url).toContain("5511999990000");

    await noAgreement(saleRequestId);
    await accept(saleRequestId, offerB);

    const second = await handoffService.getSelectedStoreWhatsapp(world.ownerId, saleRequestId);
    expect(second.url).toContain("5511999990001");
  });

  it("a loja perdedora continua 404 depois da resseleção", async () => {
    const saleRequestId = await publishRequest();
    const offerB = await offerFrom(1, saleRequestId, OFFER_B);
    const offerA = await offerFrom(0, saleRequestId, OFFER_A);
    await accept(saleRequestId, offerA);
    await noAgreement(saleRequestId);
    await accept(saleRequestId, offerB);

    const loser = await attempt(() =>
      dealerService.getDealerSaleOpportunity(world.dealerIds[0], saleRequestId, {})
    );
    expect(loser.ok).toBe(false);
    expect(loser.status).toBe(404);

    const winner = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[1],
      saleRequestId,
      {}
    );
    expect(winner.sale_opportunity.is_selected).toBe(true);
  });
});

// ============================================================================
describe.sequential("integração — concorrência (§41, §42, §43)", () => {
  /**
   * §41 — duas RESSELEÇÕES simultâneas.
   *
   * Exatamente uma vence. Nunca duas seleções "atuais": o ponteiro é uma coluna
   * só, e o `fromStatus` do UPDATE só casa uma vez.
   */
  it("resseleção × resseleção: exatamente uma vence", async () => {
    for (let round = 0; round < 5; round += 1) {
      // Reset por ITERACAO: SALE_REQUEST_ACTIVE_LIMIT permite 3 solicitacoes
      // abertas por dono, e cinco rodadas estourariam o teto num erro que nao
      // tem nada a ver com o que este teste prova.
      world = await seedWorld();
      const saleRequestId = await publishRequest();
      // ORDEM CRESCENTE: cada proposta precisa superar a maior atual.
      const offerC = await offerFrom(2, saleRequestId, OFFER_C);
      const offerB = await offerFrom(1, saleRequestId, OFFER_B);
      const offerA = await offerFrom(0, saleRequestId, OFFER_A);

      await accept(saleRequestId, offerA);
      await noAgreement(saleRequestId);

      const [b, c] = await Promise.all([
        accept(saleRequestId, offerB, { delayMs: round % 3 }),
        accept(saleRequestId, offerC, { delayMs: (round + 1) % 3 }),
      ]);

      const winners = [b, c].filter((r) => r.ok && r.result?.changed !== false);
      expect(winners, `rodada ${round}`).toHaveLength(1);

      const request = await readRequest(saleRequestId);
      expect(request.status).toBe("offer_selected");

      // DUAS seleções no total: a da Loja A e a da vencedora. Nunca três.
      const trail = await readSelections(saleRequestId);
      expect(trail, `rodada ${round}`).toHaveLength(2);
      // E o ponteiro concorda com a última linha da trilha.
      expect(request.selected_offer_id).toBe(trail[1].offer_id);
    }
  });

  /**
   * §42 — resseleção × nova rodada.
   *
   * O desastre a evitar: rodada 2 aberta E uma oferta da rodada 1 como seleção
   * atual. As duas transações travam a MESMA linha, então uma delas acorda com o
   * estado já movido.
   */
  it("resseleção × nova rodada: nunca rodada 2 com seleção da rodada 1", async () => {
    for (let round = 0; round < 5; round += 1) {
      world = await seedWorld();
      const saleRequestId = await publishRequest();
      const offerB = await offerFrom(1, saleRequestId, OFFER_B);
      const offerA = await offerFrom(0, saleRequestId, OFFER_A);

      await accept(saleRequestId, offerA);
      await noAgreement(saleRequestId);

      const [selected, opened] = await Promise.all([
        accept(saleRequestId, offerB, { delayMs: round % 3 }),
        openRound(saleRequestId, "58000", { delayMs: (round + 1) % 3 }),
      ]);

      // Exatamente uma das duas ações venceu.
      const winners = [selected, opened].filter((r) => r.ok);
      expect(winners, `rodada ${round}`).toHaveLength(1);

      const request = await readRequest(saleRequestId);
      const rounds = await readRounds(saleRequestId);

      if (opened.ok) {
        // A rodada abriu: disputa reaberta, ponteiro limpo, UMA seleção histórica.
        expect(request.status, `rodada ${round}`).toBe("receiving_offers");
        expect(request.current_round_number).toBe(2);
        expect(request.selected_offer_id).toBeNull();
        expect(await readSelections(saleRequestId)).toHaveLength(1);
      } else {
        // A resseleção venceu: continua na rodada 1, com duas seleções.
        expect(request.status, `rodada ${round}`).toBe("offer_selected");
        expect(request.current_round_number).toBe(1);
        expect(rounds).toHaveLength(1);
        expect(await readSelections(saleRequestId)).toHaveLength(2);
      }
    }
  });

  /**
   * §43 — duas NOVAS RODADAS simultâneas.
   *
   * Só uma rodada 2. O UNIQUE (sale_request_id, round_number) é a rede final,
   * mesmo que o lock desapareça.
   */
  it("nova rodada × nova rodada: só existe uma rodada 2", async () => {
    for (let round = 0; round < 5; round += 1) {
      world = await seedWorld();
      const saleRequestId = await publishRequest();
      const offerA = await offerFrom(0, saleRequestId, OFFER_A);
      await accept(saleRequestId, offerA);
      await noAgreement(saleRequestId);

      const [first, second] = await Promise.all([
        openRound(saleRequestId, "58000", { delayMs: round % 3 }),
        openRound(saleRequestId, "57000", { delayMs: (round + 1) % 3 }),
      ]);

      const winners = [first, second].filter((r) => r.ok);
      expect(winners, `rodada ${round}`).toHaveLength(1);

      const rounds = await readRounds(saleRequestId);
      expect(rounds, `rodada ${round}`).toHaveLength(2);
      expect(rounds.filter((r) => r.round_number === 2)).toHaveLength(1);

      // O piso persistido é o da transação vencedora — nunca uma mistura.
      const winningMinimum = winners[0].result.round.minimum_accepted_price;
      expect(rounds[1].minimum).toBe(String(winningMinimum));

      expect((await readRequest(saleRequestId)).current_round_number).toBe(2);
    }
  });

  /** §44 — "não houve acordo" simultâneo consigo mesmo. */
  it("dois 'não houve acordo' simultâneos: um evento só", async () => {
    for (let round = 0; round < 4; round += 1) {
      world = await seedWorld();
      const saleRequestId = await publishRequest();
      const offerA = await offerFrom(0, saleRequestId, OFFER_A);
      await accept(saleRequestId, offerA);

      const [a, b] = await Promise.all([
        noAgreement(saleRequestId),
        noAgreement(saleRequestId),
      ]);

      expect(a.ok, `rodada ${round}`).toBe(true);
      expect(b.ok).toBe(true);

      const { rows } = await pool.query(
        `SELECT count(*)::int AS total FROM sale_request_handoff_outcomes
          WHERE sale_request_id = $1`,
        [saleRequestId]
      );
      expect(rows[0].total, `rodada ${round}`).toBe(1);
      expect((await readRequest(saleRequestId)).status).toBe("handoff_failed");
    }
  });
});
