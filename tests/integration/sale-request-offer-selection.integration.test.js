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
 * A SELEÇÃO PRELIMINAR sob PostgreSQL real (Fase 4.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ────────────────────────────────────────────────────────────────────────────
 * O teste de service roda contra um array em memória com uma "conexão" só. Ele
 * prova a REGRA (quem pode selecionar o quê, o que é recusado, o que vaza) e não
 * consegue provar nada sobre SERIALIZAÇÃO: duas transações nunca disputam lá, e
 * um service sem `withTransaction` nenhum passaria em todos aqueles casos.
 *
 * Os bugs que este arquivo caça só existem com concorrência de verdade:
 *
 *   §12  duas seleções simultâneas gravando DUAS escolhas para a mesma
 *        solicitação — cada uma apontando para uma loja diferente, e o estado
 *        final decidido por quem escreveu por último;
 *
 *   §13  a seleção de uma oferta que a loja acabou de superar. A leitura de "a
 *        proposta atual desta loja" acontece dentro do lock; fora dele, ela
 *        enxergaria o estado ANTERIOR ao lance concorrente e congelaria um valor
 *        que já não vale;
 *
 *   §14  cancelamento e seleção ao mesmo tempo, terminando num estado que não é
 *        nenhum dos dois;
 *
 *   §22  a notificação sobrevivendo a um rollback da seleção — um "sua proposta
 *        foi selecionada" persistido sobre uma disputa que continua aberta.
 *
 * Nenhum índice único sozinho protege contra o §13, e nenhum poderia: as duas
 * escritas são legítimas do ponto de vista de qualquer chave. Só o
 * `SELECT ... FOR UPDATE` na MESMA linha de `sale_requests` — travada tanto pela
 * proposta quanto pela seleção — serializa as duas decisões.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OS SERVICES DE VERDADE, NÃO UMA RÉPLICA EM SQL
 * ────────────────────────────────────────────────────────────────────────────
 * O teste importa `selectSaleRequestOffer`, `createSaleOffer` e
 * `cancelMySaleRequest` e os executa contra este banco. Escrever o
 * BEGIN/SELECT/UPDATE à mão aqui provaria que o PostgreSQL sabe travar linha —
 * que ninguém duvida — e continuaria passando no dia em que alguém removesse a
 * transação do service. É a diferença entre testar a regra e testar o ALCANCE
 * dela.
 *
 * Para isso o `DATABASE_URL` é apontado para o banco temporário ANTES do
 * primeiro import de `db.js` (o pool é construído no carregamento do módulo).
 * Por isso os imports dos services são dinâmicos e ficam depois do setup.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TESTE POR MUTAÇÃO — A ÚLTIMA SEÇÃO DESTE ARQUIVO
 * ────────────────────────────────────────────────────────────────────────────
 * Um teste de concorrência que passa pode estar passando por sorte de
 * escalonamento, e não porque o lock existe. A última seção prova o contrário:
 * executa, à mão, a MESMA sequência SEM `FOR UPDATE`, e exige que a violação
 * apareça. Se ela não aparecer, o cenário não é discriminante e os testes acima
 * não valem nada — e o próprio teste diz isso, em vez de fingir sucesso.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-offer-selection.integration.test.js
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
const dbName = `saleselection_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
/** Segundo banco, só para o cenário de UPGRADE (§27.2). */
const upgradeDbName = `saleselectionup_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

// --- setup: banco temporário + services apontados para ele ------------------

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(upgradeDbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

// ORDEM CRÍTICA: o pool de `db.js` é construído no load do módulo, a partir de
// `env.DATABASE_URL`. Apontar depois do import não teria efeito nenhum.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";

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

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_offer_selections, sale_request_offers, sale_request_images,
              sale_requests, user_notifications, advertisers, users, cities
     RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug)
     VALUES ('Atibaia', 'SP', 'atibaia-sp'), ('Bragança Paulista', 'SP', 'braganca-paulista-sp')
     RETURNING id`
  );
  const cityId = cityRows[0].id;
  const otherCityId = cityRows[1].id;

  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@selection.test', 'x', 'Dono', 'cpf'),
            ('other@selection.test', 'x', 'Outro dono', 'cpf')
     RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@selection.test', 'x', 'Loja A', 'cnpj'),
            ('b@selection.test', 'x', 'Loja B', 'cnpj'),
            ('c@selection.test', 'x', 'Loja C', 'cnpj')
     RETURNING id`
  );

  const storeNames = ["Auto Center Atibaia", "Prime Veículos", "Garagem Central"];
  const advertiserIds = [];
  for (const [index, dealer] of dealerRows.entries()) {
    const { rows } = await pool.query(
      `INSERT INTO advertisers (user_id, name, slug, city_id, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [dealer.id, storeNames[index], `loja-${index}-${dealer.id}`, cityId]
    );
    advertiserIds.push(rows[0].id);
  }

  return {
    cityId,
    otherCityId,
    ownerId: String(ownerRows[0].id),
    otherOwnerId: String(ownerRows[1].id),
    dealerIds: dealerRows.map((row) => String(row.id)),
    advertiserIds,
  };
}

async function insertSaleRequest({
  cityId,
  ownerId,
  status = "receiving_offers",
  minimumAcceptedPrice = "60000.00",
} = {}) {
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, year, mileage, transmission, fuel_type,
       declared_condition, minimum_accepted_price, status
     )
     VALUES ($1, $2, 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
             'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.', 2020, 45000, 'automatico', 'flex',
             'bom', $3, $4)
     RETURNING id`,
    [ownerId ?? world.ownerId, cityId ?? world.cityId, minimumAcceptedPrice, status]
  );
  return String(rows[0].id);
}

/** Um lance, pelo caminho REAL (o service), para que a regra da 4.3 valha. */
async function propose(dealerIndex, saleRequestId, amount) {
  const result = await offersService.createSaleOffer(
    world.dealerIds[dealerIndex],
    saleRequestId,
    { amount: String(amount) }
  );
  return result;
}

/** O id do último lance de uma loja numa solicitação — a proposta ATUAL dela. */
async function currentOfferId(saleRequestId, advertiserIndex) {
  const { rows } = await pool.query(
    `SELECT id FROM sale_request_offers
     WHERE sale_request_id = $1 AND advertiser_id = $2
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [saleRequestId, world.advertiserIds[advertiserIndex]]
  );
  return rows[0] ? String(rows[0].id) : null;
}

/**
 * Executa a seleção e devolve `{ ok }` ou `{ ok:false, status, code }`.
 *
 * `delayMs` existe para VARIAR quem chega primeiro ao lock. Sem ele, duas
 * chamadas disparadas no mesmo `Promise.all` tendem a entrar sempre na mesma
 * ordem, e o teste passaria a provar um único escalonamento — o mais favorável.
 * Com jitter, rodadas diferentes têm vencedores de LOCK diferentes, e o
 * invariante precisa valer em todas.
 */
async function select(saleRequestId, offerId, { owner, delayMs = 0 } = {}) {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  try {
    const result = await selectionService.selectSaleRequestOffer(
      owner ?? world.ownerId,
      saleRequestId,
      { offer_id: String(offerId) }
    );
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      status: error?.statusCode ?? null,
      code: error?.details?.code ?? null,
      message: error?.message ?? null,
    };
  }
}

async function proposeSafe(dealerIndex, saleRequestId, amount, { delayMs = 0 } = {}) {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  try {
    return { ok: true, result: await propose(dealerIndex, saleRequestId, amount) };
  } catch (error) {
    return {
      ok: false,
      status: error?.statusCode ?? null,
      code: error?.details?.code ?? null,
    };
  }
}

async function cancelSafe(saleRequestId, { delayMs = 0 } = {}) {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  try {
    return { ok: true, result: await ownerService.cancelMySaleRequest(world.ownerId, saleRequestId) };
  } catch (error) {
    return {
      ok: false,
      status: error?.statusCode ?? null,
      code: error?.details?.code ?? null,
    };
  }
}

async function readRequest(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT status, selected_offer_id::text AS selected_offer_id, selected_offer_at
     FROM sale_requests WHERE id = $1`,
    [saleRequestId]
  );
  return rows[0];
}

async function readSelections(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id, offer_id::text AS offer_id, advertiser_id::text AS advertiser_id,
            selected_by_user_id::text AS selected_by_user_id,
            amount_snapshot::text AS amount_snapshot, selected_at
     FROM sale_request_offer_selections
     WHERE sale_request_id = $1
     ORDER BY id ASC`,
    [saleRequestId]
  );
  return rows;
}

async function readNotifications(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT recipient_user_id::text AS recipient_user_id, event_type,
            idempotency_key, title, body, payload
     FROM user_notifications
     WHERE entity_type = 'sale_request' AND entity_id = $1
     ORDER BY id ASC`,
    [String(saleRequestId)]
  );
  return rows;
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
describe.sequential("integração — o SCHEMA da migration 057", () => {
  it("cria as colunas de seleção com os tipos certos e sem DEFAULT", async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'sale_requests'
         AND column_name IN ('selected_offer_id', 'selected_offer_at')
       ORDER BY column_name`
    );

    expect(rows).toHaveLength(2);
    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.selected_offer_id.data_type).toBe("bigint");
    expect(byName.selected_offer_id.is_nullable).toBe("YES");
    expect(byName.selected_offer_id.column_default).toBeNull();

    expect(byName.selected_offer_at.data_type).toBe("timestamp with time zone");
    expect(byName.selected_offer_at.is_nullable).toBe("YES");
    // Um DEFAULT NOW() aqui faria toda linha nascer com data de seleção.
    expect(byName.selected_offer_at.column_default).toBeNull();
  });

  it("cria a trilha append-only com as FKs e o UNIQUE por solicitação", async () => {
    const { rows: fks } = await pool.query(
      `SELECT conname, confrelid::regclass::text AS references_table
       FROM pg_constraint
       WHERE conrelid = 'sale_request_offer_selections'::regclass
         AND contype = 'f'
       ORDER BY conname`
    );

    expect(fks.map((row) => row.references_table).sort()).toEqual(
      ["advertisers", "sale_request_offers", "sale_requests", "users"].sort()
    );

    const { rows: unique } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'sale_request_offer_selections'
         AND indexname = 'sale_request_offer_selections_request_uidx'`
    );
    expect(unique).toHaveLength(1);
    expect(unique[0].indexdef).toMatch(/UNIQUE/i);
  });

  it("o CHECK de status aceita offer_selected e recusa vocabulário inventado", async () => {
    const id = await insertSaleRequest();

    await expect(
      pool.query(`UPDATE sale_requests SET status = 'sold' WHERE id = $1`, [id])
    ).rejects.toThrow(/sale_requests_status_check/);
  });

  /**
   * O CHECK de coerência (§5/§6): o estado e os campos não podem discordar.
   *
   * Os três estados impossíveis são testados um a um. Cada um deles, se
   * expressável, apareceria como bug de TELA — "proposta selecionada" sem nada
   * para mostrar, ou uma disputa aberta com escolha já gravada.
   */
  it("recusa offer_selected sem selected_offer_id", async () => {
    const id = await insertSaleRequest();

    await expect(
      pool.query(`UPDATE sale_requests SET status = 'offer_selected' WHERE id = $1`, [id])
    ).rejects.toThrow(/coherence/);
  });

  it("recusa selected_offer_id com status receiving_offers", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    await expect(
      pool.query(
        `UPDATE sale_requests SET selected_offer_id = $2, selected_offer_at = NOW() WHERE id = $1`,
        [id, offerId]
      )
    ).rejects.toThrow(/coherence/);
  });

  it("recusa selected_offer_id sem selected_offer_at", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    await expect(
      pool.query(
        `UPDATE sale_requests SET status = 'offer_selected', selected_offer_id = $2 WHERE id = $1`,
        [id, offerId]
      )
    ).rejects.toThrow(/coherence/);
  });

  it("a FK impede apontar para uma proposta de outra solicitação inexistente", async () => {
    const id = await insertSaleRequest();

    await expect(
      pool.query(
        `UPDATE sale_requests
         SET status = 'offer_selected', selected_offer_id = 999999, selected_offer_at = NOW()
         WHERE id = $1`,
        [id]
      )
    ).rejects.toThrow(/sale_requests_selected_offer_fk/);
  });

  /**
   * O UPGRADE de um banco POVOADO (§27.2).
   *
   * O cenário real: produção já tem solicitações e propostas quando a 057 roda.
   * O teste desfaz a migration num banco à parte, insere dados anteriores à
   * regra (abertas E cancelada), e reaplica — que é exatamente a sequência que
   * o deploy vai executar.
   *
   * Provar isso importa porque o CHECK de coerência é adicionado SEM `NOT VALID`
   * e, portanto, varre a tabela inteira: se a bi-implicação não fosse satisfeita
   * por toda linha legada, a migration falharia no primeiro banco com dados —
   * que é o de produção, e ninguém descobriria antes.
   */
  it("aplica sobre um banco POVOADO com dados anteriores à regra", async () => {
    const upgradeUrl = makeDatabaseUrl(upgradeDbName);
    await runMigrations(upgradeUrl);

    const upgradePool = new Pool(buildPoolConfig(upgradeUrl));

    try {
      // 1. Desfaz a 057 — o banco volta ao estado da 4.3.3.
      await upgradePool.query(`DROP TABLE IF EXISTS sale_request_offer_selections`);
      await upgradePool.query(
        `ALTER TABLE sale_requests
           DROP CONSTRAINT IF EXISTS sale_requests_selected_offer_coherence_check,
           DROP CONSTRAINT IF EXISTS sale_requests_selected_offer_fk,
           DROP COLUMN IF EXISTS selected_offer_id,
           DROP COLUMN IF EXISTS selected_offer_at`
      );
      await upgradePool.query(
        `ALTER TABLE sale_requests DROP CONSTRAINT IF EXISTS sale_requests_status_check`
      );
      await upgradePool.query(
        `ALTER TABLE sale_requests
           ADD CONSTRAINT sale_requests_status_check
           CHECK (status IN ('receiving_offers', 'cancelled'))`
      );
      await upgradePool.query(`DELETE FROM schema_migrations WHERE filename LIKE '057%'`);

      // 2. Povoa como um banco de produção anterior à fase.
      const { rows: cityRows } = await upgradePool.query(
        `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-upgrade')
         RETURNING id`
      );
      const { rows: userRows } = await upgradePool.query(
        `INSERT INTO users (email, password_hash, name, document_type)
         VALUES ('legacy@upgrade.test', 'x', 'Legado', 'cpf') RETURNING id`
      );
      const { rows: advRows } = await upgradePool.query(
        `INSERT INTO advertisers (user_id, name, slug, city_id, status)
         VALUES ($1, 'Loja Legada', 'loja-legada-upgrade', $2, 'active') RETURNING id`,
        [userRows[0].id, cityRows[0].id]
      );

      for (const status of ["receiving_offers", "cancelled"]) {
        const { rows } = await upgradePool.query(
          `INSERT INTO sale_requests (
             owner_user_id, city_id, brand, brand_slug, model, model_slug,
             fipe_model_description, year, mileage, transmission, fuel_type,
             declared_condition, status
           )
           VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo 1.0', 2019, 60000,
                   'manual', 'flex', 'bom', $3)
           RETURNING id`,
          [userRows[0].id, cityRows[0].id, status]
        );
        await upgradePool.query(
          `INSERT INTO sale_request_offers (sale_request_id, dealer_user_id, advertiser_id, amount)
           VALUES ($1, $2, $3, 48000.00)`,
          [rows[0].id, userRows[0].id, advRows[0].id]
        );
      }

      // 3. Reaplica a migration sobre o banco povoado.
      await runMigrations(upgradeUrl);

      // 4. As colunas existem, toda linha legada é NULL, e nenhuma delas violou
      //    a bi-implicação do CHECK.
      const { rows: after } = await upgradePool.query(
        `SELECT status, selected_offer_id, selected_offer_at FROM sale_requests ORDER BY id`
      );
      expect(after).toHaveLength(2);
      for (const row of after) {
        expect(row.selected_offer_id).toBeNull();
        expect(row.selected_offer_at).toBeNull();
      }

      // 5. E o novo estado passou a ser aceito.
      const { rows: check } = await upgradePool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'sale_requests_status_check'`
      );
      expect(check[0].def).toContain("offer_selected");
    } finally {
      await upgradePool.end().catch(() => {});
    }
  });
});

// ============================================================================
describe.sequential("integração — a seleção no caminho feliz", () => {
  it("receiving_offers → offer_selected, com estado e trilha coerentes", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");

    const chosen = await currentOfferId(id, 1);
    const outcome = await select(id, chosen);

    expect(outcome.ok).toBe(true);
    expect(outcome.result.changed).toBe(true);

    const row = await readRequest(id);
    expect(row.status).toBe("offer_selected");
    expect(row.selected_offer_id).toBe(chosen);
    expect(row.selected_offer_at).toBeInstanceOf(Date);

    const [event] = await readSelections(id);
    expect(event.offer_id).toBe(chosen);
    expect(event.advertiser_id).toBe(String(world.advertiserIds[1]));
    expect(event.selected_by_user_id).toBe(world.ownerId);
    expect(event.amount_snapshot).toBe("65000.00");
  });

  /**
   * §28 — O TESTE CRÍTICO, agora contra PostgreSQL real.
   *
   * Loja A em 65.000, Loja B em 67.000, e o proprietário escolhe A. Se algum dia
   * o servidor passar a comparar o valor escolhido com o maior, é aqui que a
   * mentira aparece — no banco, com as duas propostas gravadas e a menor
   * vencendo.
   */
  it("a proposta MENOR pode ser selecionada, e o banco registra a menor", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "65000"); // Loja A
    await propose(1, id, "67000"); // Loja B — a maior

    const smaller = await currentOfferId(id, 0);
    const outcome = await select(id, smaller);

    expect(outcome.ok).toBe(true);

    const row = await readRequest(id);
    expect(row.selected_offer_id).toBe(smaller);

    const [event] = await readSelections(id);
    expect(event.amount_snapshot).toBe("65000.00");
    expect(event.advertiser_id).toBe(String(world.advertiserIds[0]));

    // E a maior continua gravada, intocada: escolher não recusa nem apaga nada.
    const { rows } = await pool.query(
      `SELECT amount::text AS amount FROM sale_request_offers
       WHERE sale_request_id = $1 ORDER BY amount DESC`,
      [id]
    );
    expect(rows[0].amount).toBe("67000.00");
  });

  it("o dono recebe UMA proposta atual por loja, ordenadas por valor", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "63000");
    await propose(0, id, "64000"); // Loja A aumenta

    const proposals = await selectionService.listOwnerProposals(id, world.ownerId);

    expect(proposals).toHaveLength(2);
    expect(proposals.map((item) => item.amount)).toEqual(["64000.00", "63000.00"]);
    expect(proposals[0].store_name).toBe("Auto Center Atibaia");
    expect(proposals[0].store_city).toBe("Atibaia - SP");
    expect(proposals[0].is_highest).toBe(true);

    // Três lances no banco, duas linhas na visão do dono.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM sale_request_offers WHERE sale_request_id = $1`,
      [id]
    );
    expect(rows[0].total).toBe(3);
  });

  it("a proposta ATUAL da lista é a MESMA que a transação considera atual", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(0, id, "64000");

    const [proposal] = await selectionService.listOwnerProposals(id, world.ownerId);

    // Se as duas definições de "atual" divergissem, a tela ofereceria uma
    // proposta que a transação recusaria como obsoleta — um botão que nunca
    // funciona.
    const outcome = await select(id, proposal.id);
    expect(outcome.ok).toBe(true);
  });
});

// ============================================================================
describe.sequential("integração — o que a seleção recusa", () => {
  it("proposta de OUTRA solicitação é recusada e nada é gravado", async () => {
    const mine = await insertSaleRequest();
    const other = await insertSaleRequest();
    await propose(0, mine, "62000");
    await propose(1, other, "70000");

    const foreign = await currentOfferId(other, 1);
    const outcome = await select(mine, foreign);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(404);
    expect(outcome.code).toBe("SALE_REQUEST_OFFER_NOT_FOUND");
    expect((await readRequest(mine)).status).toBe("receiving_offers");
    expect(await readSelections(mine)).toHaveLength(0);
  });

  it("proposta OBSOLETA da mesma loja é 409 com o valor atualizado", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const staleOffer = await currentOfferId(id, 0);
    await propose(0, id, "65000");

    const outcome = await select(id, staleOffer);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(409);
    expect(outcome.code).toBe("SALE_REQUEST_OFFER_STALE");
    expect((await readRequest(id)).status).toBe("receiving_offers");
  });

  it("dono ERRADO é 404, sem tocar no estado", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    const outcome = await select(id, offerId, { owner: world.otherOwnerId });

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(404);
    expect((await readRequest(id)).status).toBe("receiving_offers");
    expect(await readSelections(id)).toHaveLength(0);
  });

  it("solicitação CANCELADA recusa a seleção", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);
    await pool.query(`UPDATE sale_requests SET status = 'cancelled' WHERE id = $1`, [id]);

    const outcome = await select(id, offerId);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(409);
    expect(outcome.code).toBe("SALE_REQUEST_SELECTION_CLOSED");
  });

  it("depois da seleção, NENHUMA loja consegue propor — nem a escolhida", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await select(id, await currentOfferId(id, 0));

    const outsider = await proposeSafe(1, id, "90000");
    const winner = await proposeSafe(0, id, "95000");

    expect(outsider.ok).toBe(false);
    expect(outsider.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");
    expect(winner.ok).toBe(false);
    expect(winner.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM sale_request_offers WHERE sale_request_id = $1`,
      [id]
    );
    expect(rows[0].total).toBe(1);
  });
});

// ============================================================================
describe.sequential("integração — idempotência (§11)", () => {
  it("o RETRY da mesma seleção não cria segunda trilha nem segunda notificação", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    const first = await select(id, offerId);
    const retry = await select(id, offerId);

    expect(first.ok).toBe(true);
    expect(first.result.changed).toBe(true);
    expect(retry.ok).toBe(true);
    expect(retry.result.changed).toBe(false);

    expect(await readSelections(id)).toHaveLength(1);
    expect(await readNotifications(id)).toHaveLength(1);
  });

  it("selecionar OUTRA proposta depois é 409, e o estado não muda de loja", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");

    const chosen = await currentOfferId(id, 0);
    const rival = await currentOfferId(id, 1);

    await select(id, chosen);
    const second = await select(id, rival);

    expect(second.ok).toBe(false);
    expect(second.status).toBe(409);
    expect(second.code).toBe("SALE_REQUEST_ALREADY_SELECTED");

    expect((await readRequest(id)).selected_offer_id).toBe(chosen);
    expect(await readSelections(id)).toHaveLength(1);
  });

  /**
   * O retry CONCORRENTE — o caso que a idempotência sequencial não cobre.
   *
   * Duas abas (ou dois cliques com a resposta perdida na rede) mandando a MESMA
   * seleção ao mesmo tempo. As duas precisam terminar bem, e o banco precisa
   * ficar com exatamente um evento e uma notificação.
   */
  it("dois retries SIMULTÂNEOS da mesma seleção terminam com UM evento", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    const [a, b] = await Promise.all([
      select(id, offerId),
      select(id, offerId, { delayMs: 3 }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(await readSelections(id)).toHaveLength(1);
    expect(await readNotifications(id)).toHaveLength(1);
  });
});

// ============================================================================
describe.sequential("integração — §12: seleção × seleção", () => {
  it("duas seleções SIMULTÂNEAS de lojas diferentes: exatamente uma vence", async () => {
    for (let round = 0; round < 6; round += 1) {
      world = await seedWorld();

      const id = await insertSaleRequest();
      await propose(0, id, "62000");
      await propose(1, id, "65000");

      const offerA = await currentOfferId(id, 0);
      const offerB = await currentOfferId(id, 1);

      const [a, b] = await Promise.all([
        select(id, offerA, { delayMs: round % 3 }),
        select(id, offerB, { delayMs: (round + 1) % 3 }),
      ]);

      const winners = [a, b].filter((outcome) => outcome.ok);
      expect(winners).toHaveLength(1);

      const loser = [a, b].find((outcome) => !outcome.ok);
      expect(loser.status).toBe(409);
      expect(loser.code).toBe("SALE_REQUEST_ALREADY_SELECTED");

      // UMA linha efetiva na trilha, e o estado APONTANDO para ela: o histórico
      // e o estado corrente não podem discordar.
      const selections = await readSelections(id);
      expect(selections).toHaveLength(1);

      const row = await readRequest(id);
      expect(row.status).toBe("offer_selected");
      expect(row.selected_offer_id).toBe(selections[0].offer_id);

      // E o vencedor da corrida é quem foi notificado — uma notificação só.
      const notifications = await readNotifications(id);
      expect(notifications).toHaveLength(1);
    }
  });
});

// ============================================================================
describe.sequential("integração — §13: seleção × nova proposta", () => {
  /**
   * O cenário mais perigoso da fase.
   *
   * O proprietário aponta para a proposta ATUAL da loja A. No mesmo instante, a
   * loja A aumenta. As duas ordens possíveis têm resultados diferentes, e as
   * DUAS são corretas:
   *
   *   aumento primeiro  → a oferta apontada virou obsoleta → seleção recusada;
   *   seleção primeiro  → a disputa acabou → proposta recusada.
   *
   * O que NÃO pode acontecer, em ordem nenhuma: a seleção congelar a oferta
   * antiga DEPOIS de a nova ter sido commitada. Seria o proprietário levando
   * menos dinheiro do que a loja acabou de oferecer, sem erro em lugar nenhum.
   */
  it("nunca seleciona uma oferta antiga quando a nova da MESMA loja já entrou", async () => {
    for (let round = 0; round < 8; round += 1) {
      world = await seedWorld();

      const id = await insertSaleRequest();
      await propose(0, id, "62000");
      const targeted = await currentOfferId(id, 0);

      const [selection, bid] = await Promise.all([
        select(id, targeted, { delayMs: round % 4 }),
        proposeSafe(0, id, "68000", { delayMs: (round + 2) % 4 }),
      ]);

      const row = await readRequest(id);

      if (selection.ok) {
        // A seleção venceu a corrida: o estado aponta para a oferta apontada, e
        // o lance novo TEM de ter sido recusado.
        expect(row.selected_offer_id).toBe(targeted);
        expect(bid.ok).toBe(false);
        expect(bid.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");
      } else {
        // O lance venceu: a oferta apontada ficou obsoleta e a seleção caiu com
        // o código certo — nunca com um 500, e nunca em silêncio.
        expect(bid.ok).toBe(true);
        expect(selection.status).toBe(409);
        expect(selection.code).toBe("SALE_REQUEST_OFFER_STALE");
        expect(row.status).toBe("receiving_offers");
        expect(row.selected_offer_id).toBeNull();
      }

      // Em NENHUM dos dois desfechos existe seleção apontando para uma oferta
      // que já não é a atual da loja.
      if (row.selected_offer_id) {
        const stillCurrent = await currentOfferId(id, 0);
        expect(row.selected_offer_id).toBe(stillCurrent);
      }
    }
  });
});

// ============================================================================
describe.sequential("integração — §14: seleção × cancelamento", () => {
  it("exatamente uma transição vence, e o estado final é coerente", async () => {
    for (let round = 0; round < 8; round += 1) {
      world = await seedWorld();

      const id = await insertSaleRequest();
      await propose(0, id, "62000");
      const offerId = await currentOfferId(id, 0);

      const [selection, cancellation] = await Promise.all([
        select(id, offerId, { delayMs: round % 4 }),
        cancelSafe(id, { delayMs: (round + 1) % 4 }),
      ]);

      const row = await readRequest(id);

      // Nunca um terceiro estado, e nunca `receiving_offers`: uma das duas
      // transições necessariamente aconteceu.
      expect(["offer_selected", "cancelled"]).toContain(row.status);

      if (row.status === "offer_selected") {
        expect(selection.ok).toBe(true);
        expect(row.selected_offer_id).toBe(offerId);
        // O cancelamento NÃO pode ter respondido sucesso silencioso sobre uma
        // solicitação que continua selecionada — era exatamente o defeito que o
        // §14 mandou endurecer.
        expect(cancellation.ok).toBe(false);
        expect(cancellation.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
        expect(await readSelections(id)).toHaveLength(1);
      } else {
        expect(cancellation.ok).toBe(true);
        expect(selection.ok).toBe(false);
        expect(selection.code).toBe("SALE_REQUEST_SELECTION_CLOSED");
        // Cancelada NUNCA carrega escolha: nem estado, nem trilha.
        expect(row.selected_offer_id).toBeNull();
        expect(await readSelections(id)).toHaveLength(0);
        expect(await readNotifications(id)).toHaveLength(0);
      }
    }
  });
});

// ============================================================================
describe.sequential("integração — §22: a notificação é atômica", () => {
  it("a notificação existe DEPOIS do commit, endereçada à loja escolhida", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");

    await select(id, await currentOfferId(id, 1));

    const notifications = await readNotifications(id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient_user_id).toBe(world.dealerIds[1]);
    expect(notifications[0].event_type).toBe("sale_request.bid_selected");
    // A loja PERDEDORA não recebe nada.
    expect(notifications[0].recipient_user_id).not.toBe(world.dealerIds[0]);
  });

  it("a chave de idempotência é determinística por (solicitação, oferta)", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    await select(id, offerId);

    const [notification] = await readNotifications(id);
    expect(notification.idempotency_key).toBe(`sale-request:${id}:offer-selected:${offerId}`);
  });

  /**
   * O ROLLBACK — a metade que dá sentido à atomicidade.
   *
   * O teste força a transação a falhar DEPOIS de a notificação já ter sido
   * inserida, derrubando a inserção do estado com um gatilho temporário no
   * `UPDATE` de `sale_requests`. É a ordem exata do service (evento → estado →
   * notificação... e o `UPDATE` do estado vem ANTES da notificação, então o
   * gatilho aborta antes dela) — por isso a segunda metade do teste força a
   * falha no ponto oposto: um gatilho na PRÓPRIA `user_notifications`, que só
   * dispara depois de tudo o mais já ter sido escrito.
   *
   * Se a notificação vivesse fora da transação, ela sobreviveria ao rollback e
   * a loja receberia "sua proposta foi selecionada" sobre uma disputa que
   * continua aberta — uma mentira persistida para um terceiro, sem nada que a
   * corrija depois.
   */
  it("um erro DEPOIS da notificação não deixa seleção, estado nem aviso órfão", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    const offerId = await currentOfferId(id, 0);

    await pool.query(`
      CREATE OR REPLACE FUNCTION fail_notification() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'falha simulada na notificação';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      CREATE TRIGGER fail_notification_trigger
      BEFORE INSERT ON user_notifications
      FOR EACH ROW EXECUTE FUNCTION fail_notification();
    `);

    try {
      const outcome = await select(id, offerId);
      expect(outcome.ok).toBe(false);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS fail_notification_trigger ON user_notifications`);
      await pool.query(`DROP FUNCTION IF EXISTS fail_notification()`);
    }

    // Rollback completo: as TRÊS escritas desapareceram juntas.
    const row = await readRequest(id);
    expect(row.status).toBe("receiving_offers");
    expect(row.selected_offer_id).toBeNull();
    expect(await readSelections(id)).toHaveLength(0);
    expect(await readNotifications(id)).toHaveLength(0);

    // E a solicitação continua utilizável: o rollback não a deixou num estado
    // do qual não se sai.
    const retry = await select(id, offerId);
    expect(retry.ok).toBe(true);
  });
});

// ============================================================================
describe.sequential("integração — §19/§20: quem vê o quê depois da decisão", () => {
  it("a loja escolhida abre a oportunidade em modo selecionado", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await select(id, await currentOfferId(id, 0));

    const { sale_opportunity: detail } = await dealerService.getDealerSaleOpportunity(
      world.dealerIds[0],
      id
    );

    expect(detail.is_selected).toBe(true);
    expect(detail.selected_amount).toBe("62000.00");
    expect(detail.status).toBe("offer_selected");
  });

  it("a loja PERDEDORA perde o acesso ao detalhe privado", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");
    await select(id, await currentOfferId(id, 0)); // a MENOR vence

    await expect(
      dealerService.getDealerSaleOpportunity(world.dealerIds[1], id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("uma loja que nunca propôs também não vê a solicitação decidida", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await select(id, await currentOfferId(id, 0));

    await expect(
      dealerService.getDealerSaleOpportunity(world.dealerIds[2], id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("a solicitação decidida SAI do feed da cidade", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await select(id, await currentOfferId(id, 0));

    const feed = await dealerService.listDealerSaleOpportunities(world.dealerIds[0]);

    expect(feed.items.map((item) => String(item.id))).not.toContain(String(id));
  });

  it("NENHUM payload do lojista carrega dado do proprietário", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await select(id, await currentOfferId(id, 0));

    const detail = await dealerService.getDealerSaleOpportunity(world.dealerIds[0], id);
    const serialized = JSON.stringify(detail).toLowerCase();

    for (const forbidden of [
      "seller",
      "owner_user_id",
      "whatsapp",
      "phone",
      "email",
      "document",
      "cpf",
      "address",
      "owner@selection.test",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("o payload do PROPRIETÁRIO não carrega identificadores internos da loja", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");

    const proposals = await selectionService.listOwnerProposals(id, world.ownerId);
    const serialized = JSON.stringify(proposals);

    expect(serialized).not.toContain("advertiser_id");
    expect(serialized).not.toContain("dealer_user_id");
    expect(serialized).not.toContain("note");
    for (const email of ["a@selection.test", "b@selection.test"]) {
      expect(serialized).not.toContain(email);
    }
  });
});

// ============================================================================
describe.sequential("integração — TESTE POR MUTAÇÃO do lock", () => {
  /**
   * O cenário acima é discriminante?
   *
   * Este teste executa à mão a MESMA sequência da seleção, SEM `FOR UPDATE`, e
   * exige que a violação apareça: duas transações lendo `status =
   * 'receiving_offers'` ao mesmo tempo e as duas seguindo em frente.
   *
   * Sem esta prova, os testes de concorrência acima poderiam estar passando por
   * sorte de escalonamento — e continuariam passando no dia em que alguém
   * removesse o lock do repositório.
   *
   * O UNIQUE de `sale_request_offer_selections` continua ativo aqui, e é isso
   * que a violação expõe: sem lock, a segunda transação não é recusada com um
   * 409 legível pelo service — ela ESTOURA no banco, com erro de constraint.
   * Duas coisas diferentes, e a segunda é a que o usuário veria como 500.
   */
  it("SEM o lock, as duas transações passam da leitura e o banco precisa arbitrar", async () => {
    const id = await insertSaleRequest();
    await propose(0, id, "62000");
    await propose(1, id, "65000");

    const offerA = await currentOfferId(id, 0);
    const offerB = await currentOfferId(id, 1);

    async function selectWithoutLock(offerId, delayMs) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

        // A leitura SEM `FOR UPDATE` — a mutação.
        const { rows } = await client.query(
          `SELECT status, selected_offer_id FROM sale_requests WHERE id = $1`,
          [id]
        );
        if (rows[0].status !== "receiving_offers") {
          await client.query("ROLLBACK");
          return { passedTheCheck: false, committed: false };
        }

        await new Promise((resolve) => setTimeout(resolve, 25));

        const { rows: offerRows } = await client.query(
          `SELECT advertiser_id, amount FROM sale_request_offers WHERE id = $1`,
          [offerId]
        );

        await client.query(
          `INSERT INTO sale_request_offer_selections (
             sale_request_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot
           ) VALUES ($1, $2, $3, $4, $5)`,
          [id, offerId, offerRows[0].advertiser_id, world.ownerId, offerRows[0].amount]
        );
        await client.query(
          `UPDATE sale_requests
           SET status = 'offer_selected', selected_offer_id = $2, selected_offer_at = NOW()
           WHERE id = $1`,
          [id, offerId]
        );

        await client.query("COMMIT");
        return { passedTheCheck: true, committed: true };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        return { passedTheCheck: true, committed: false, error: error?.message ?? null };
      } finally {
        client.release();
      }
    }

    const [a, b] = await Promise.all([
      selectWithoutLock(offerA, 0),
      selectWithoutLock(offerB, 5),
    ]);

    // AS DUAS passaram da checagem de estado — que é a corrida. Se apenas uma
    // tivesse passado, o cenário não seria discriminante e os testes de
    // concorrência acima não provariam nada.
    expect(a.passedTheCheck).toBe(true);
    expect(b.passedTheCheck).toBe(true);

    // E a arbitragem coube ao banco, não à aplicação: exatamente uma commitou, e
    // a outra morreu com erro de constraint em vez de um 409 legível.
    const committed = [a, b].filter((outcome) => outcome.committed);
    expect(committed).toHaveLength(1);

    const failed = [a, b].find((outcome) => !outcome.committed);
    expect(failed.error).toBeTruthy();
  });
});
