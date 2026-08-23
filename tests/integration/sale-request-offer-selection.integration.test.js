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

  // FASE 4.7 — a RODADA 1.
  //
  // A publicacao real cria a rodada na mesma transacao da solicitacao, e toda
  // oferta carrega `round_id` NOT NULL com FK composta. Um fixture que insere a
  // solicitacao a mao precisa criar a rodada tambem, senao a solicitacao nasce
  // incapaz de receber proposta — um estado que producao nao produz.
  await pool.query(
    `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
     VALUES ($1, 1, $2)`,
    [rows[0].id, minimumAcceptedPrice]
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
      `SELECT conname, confrelid::regclass::text AS references_table, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'sale_request_offer_selections'::regclass
         AND contype = 'f'
       ORDER BY conname`
    );

    // ────────────────────────────────────────────────────────────────────
    // FASE 4.7 — a rodada NÃO ganhou FK própria aqui, e isso é deliberado
    // ────────────────────────────────────────────────────────────────────
    // `sale_request_offer_selections.round_id` existe, mas não aponta para
    // `sale_request_rounds` diretamente. Ele é provado por TRANSITIVIDADE: a FK
    // de 4 colunas exige que a rodada da seleção seja a mesma da OFERTA, e a
    // oferta já tem FK composta provando que a rodada dela é uma rodada daquela
    // solicitação.
    //
    // Uma FK direta seria redundante — e o §9 da fase anterior é explícito:
    // índice sem consumidor é custo de escrita permanente em troca de nada.
    //
    // São CINCO constraints sobre QUATRO tabelas: `sale_request_offers` aparece
    // duas vezes (a tripla da 4.4.1 e a de 4 colunas da 4.7).
    expect(fks).toHaveLength(5);
    expect([...new Set(fks.map((row) => row.references_table))].sort()).toEqual(
      ["advertisers", "sale_request_offers", "sale_requests", "users"].sort()
    );

    // FASE 4.4.1 — NENHUMA delas apaga a trilha em cascata. 'a' = NO ACTION.
    for (const fk of fks) {
      expect(fk.confdeltype, `${fk.conname} não é NO ACTION`).toBe("a");
    }

    // ────────────────────────────────────────────────────────────────────
    // A UNIQUE MUDOU DE CHAVE NA FASE 4.7 — e a asserção mudou junto
    // ────────────────────────────────────────────────────────────────────
    // Era `UNIQUE (sale_request_id)`: UMA seleção por solicitação, para sempre.
    // Estava certo enquanto a escolha era irreversível.
    //
    // A 4.7 criou a RESSELEÇÃO: depois de "não houve acordo" o proprietário
    // aceita outra oferta, e a seleção anterior PERMANECE como prova do match
    // que houve. A invariante que sobra é `UNIQUE (sale_request_id, offer_id)`
    // — a mesma oferta é aceita no máximo uma vez.
    //
    // "No máximo um match ATUAL" não vive mais aqui: vive em
    // `sale_requests.selected_offer_id`, que é uma coluna e portanto
    // estruturalmente única.
    const { rows: oldUnique } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'sale_request_offer_selections'
         AND indexname = 'sale_request_offer_selections_request_uidx'`
    );
    expect(oldUnique).toHaveLength(0);

    const { rows: unique } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_request_offer_selections_request_offer_unique'`
    );
    expect(unique).toHaveLength(1);
    expect(unique[0].def).toContain("UNIQUE (sale_request_id, offer_id)");
  });

  /**
   * FASE 4.4.1 — as chaves candidatas compostas.
   *
   * Elas são o ALVO das FKs que provam pertencimento. Sem elas o PostgreSQL
   * recusa a própria criação da FK ("there is no unique constraint matching
   * given keys"), então este teste é, na prática, um teste de que a ORDEM da
   * migration está certa — as UNIQUE precisam nascer antes das FKs.
   */
  it("cria as chaves candidatas compostas de sale_request_offers", async () => {
    const { rows } = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'sale_request_offers'::regclass
          AND contype = 'u'
        ORDER BY conname`
    );

    const byName = Object.fromEntries(rows.map((row) => [row.conname, row.def]));

    expect(byName.sale_request_offers_id_request_unique).toBe(
      "UNIQUE (id, sale_request_id)"
    );
    expect(byName.sale_request_offers_id_request_advertiser_unique).toBe(
      "UNIQUE (id, sale_request_id, advertiser_id)"
    );

    // FASE 4.7 — a TERCEIRA chave candidata, com a rodada.
    //
    // É o alvo da FK de 4 colunas da seleção: sem ela, uma seleção poderia
    // declarar a rodada 2 apontando para uma oferta da rodada 1.
    expect(byName.sale_request_offers_id_request_advertiser_round_unique).toBe(
      "UNIQUE (id, sale_request_id, advertiser_id, round_id)"
    );

    // Exatamente TRÊS — nem uma a menos (invariante sem alvo), nem uma a mais
    // (índice único sem FK que o use é custo de escrita sem contrapartida).
    expect(rows).toHaveLength(3);
  });

  it("a FK de sale_requests é COMPOSTA, e sem MATCH FULL", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'sale_requests_selected_offer_fk'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].def).toContain("FOREIGN KEY (selected_offer_id, id)");
    expect(rows[0].def).toContain("sale_request_offers(id, sale_request_id)");

    // `MATCH FULL` exigiria que TODAS as colunas fossem nulas ou nenhuma. Como
    // `id` nunca é nulo, toda solicitação sem seleção seria rejeitada — e a
    // migration morreria no primeiro banco com dados.
    expect(rows[0].def).not.toMatch(/MATCH FULL/i);

    // Sem ON DELETE: apagar a oferta selecionada tem de FALHAR.
    expect(rows[0].def).not.toMatch(/ON DELETE/i);
  });

  /**
   * A FK simples de `offer_id` foi REMOVIDA na 4.4.1.
   *
   * Ela seria estritamente mais fraca que a tripla e verificaria de novo o que a
   * tripla já verifica — custo de escrita sem invariante nova. Este teste impede
   * que ela volte "por segurança".
   */
  it("a trilha só referencia offers pelas FKs COMPOSTAS", async () => {
    const { rows } = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'sale_request_offer_selections'::regclass
          AND contype = 'f'
          AND confrelid = 'sale_request_offers'::regclass`
    );

    // FASE 4.7 — DUAS FKs compostas agora, e nenhuma simples.
    //
    // A tripla da 4.4.1 prova solicitação + loja; a de 4 colunas acrescenta a
    // RODADA. As duas convivem porque provam coisas diferentes, e nenhuma delas
    // é `offer_id -> offers(id)` solta — que aceitaria a oferta de outro negócio.
    expect(rows).toHaveLength(2);

    const defs = rows.map((row) => row.def).join(" | ");
    expect(defs).toContain("(offer_id, sale_request_id, advertiser_id)");
    expect(defs).toContain("(offer_id, sale_request_id, advertiser_id, round_id)");

    // Nenhuma FK de coluna única sobre `offer_id`.
    for (const row of rows) {
      expect(row.def, row.conname).not.toMatch(/FOREIGN KEY \(offer_id\) REFERENCES/);
    }
  });

  it("o CHECK de status aceita offer_selected e recusa vocabulário inventado", async () => {
    const id = await insertSaleRequest();

    // Casa QUALQUER UM dos dois CHECKs: um status inventado viola o de status e
    // o de coerência (não entra em nenhuma lista da partição da 058), e a ordem
    // de avaliação entre CHECKs da mesma tabela não é garantida.
    await expect(
      pool.query(`UPDATE sale_requests SET status = 'sold' WHERE id = $1`, [id])
    ).rejects.toThrow(
      /sale_requests_status_check|sale_requests_selected_offer_coherence_check/
    );
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
      //
      // A 058 criou tabelas que DEPENDEM de `sale_request_offer_selections`
      // (a inspeção prova contra ela que é a loja selecionada), então elas caem
      // junto. CASCADE porque `inspections` e `inspection_slots` se
      // referenciam mutuamente — nenhuma ordem de DROP simples resolve.
      await upgradePool.query(
        `DROP TABLE IF EXISTS sale_request_post_inspection_decisions,
                              sale_request_inspection_slots,
                              sale_request_inspections CASCADE`
      );
      await upgradePool.query(
        `DROP TABLE IF EXISTS sale_request_offer_selections CASCADE`
      );
      await upgradePool.query(`DELETE FROM schema_migrations WHERE filename LIKE '058%'`);
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
        // FASE 4.7 — o banco deste cenário já está na 060, então a coluna
        // `round_id` existe e é NOT NULL. A rodada 1 desta solicitação foi
        // criada pelo backfill? Não: a solicitação acabou de ser inserida À MÃO,
        // depois da migration. O fixture cria a rodada como a publicação real
        // faria.
        const { rows: roundRows } = await upgradePool.query(
          `INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
           VALUES ($1, 1, NULL) RETURNING id`,
          [rows[0].id]
        );
        await upgradePool.query(
          `INSERT INTO sale_request_offers (sale_request_id, round_id, dealer_user_id, advertiser_id, amount)
           VALUES ($1, $2, $3, $4, 48000.00)`,
          [rows[0].id, roundRows[0].id, userRows[0].id, advRows[0].id]
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

      // 6. FASE 4.4.1 — as constraints ENDURECIDAS entraram no banco povoado.
      //
      //    Este é o passo que mais podia falhar: as duas UNIQUE compostas são
      //    criadas sobre uma `sale_request_offers` que JÁ TEM LINHAS, e a FK
      //    composta de `sale_requests` é validada contra linhas legadas cujo
      //    `selected_offer_id` é NULL. Se a FK tivesse sido escrita com
      //    `MATCH FULL`, é exatamente aqui que a migration morreria — e só aqui,
      //    porque um banco vazio não tem linha para violar nada.
      const { rows: hardened } = await upgradePool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conname IN (
            'sale_request_offers_id_request_unique',
            'sale_request_offers_id_request_advertiser_unique',
            'sale_requests_selected_offer_fk',
            'sale_request_offer_selections_offer_request_advertiser_fk'
          )
          ORDER BY conname`
      );

      expect(hardened.map((row) => row.conname)).toEqual([
        "sale_request_offer_selections_offer_request_advertiser_fk",
        "sale_request_offers_id_request_advertiser_unique",
        "sale_request_offers_id_request_unique",
        "sale_requests_selected_offer_fk",
      ]);

      const byName = Object.fromEntries(hardened.map((row) => [row.conname, row.def]));

      // A FK de `sale_requests` é COMPOSTA — e a asserção casa o par inteiro,
      // não só o nome: renomear é inofensivo, voltar para a forma simples não é.
      expect(byName.sale_requests_selected_offer_fk).toContain("(selected_offer_id, id)");
      expect(byName.sale_requests_selected_offer_fk).toContain(
        "sale_request_offers(id, sale_request_id)"
      );
      // E NÃO tem MATCH FULL: com ele, toda linha sem seleção seria rejeitada.
      expect(byName.sale_requests_selected_offer_fk).not.toMatch(/MATCH FULL/i);

      expect(
        byName.sale_request_offer_selections_offer_request_advertiser_fk
      ).toContain("(offer_id, sale_request_id, advertiser_id)");

      // 7. NENHUMA FK da trilha usa CASCADE — a razão de ser da 4.4.1.
      const { rows: trailFks } = await upgradePool.query(
        `SELECT conname, confdeltype
           FROM pg_constraint
          WHERE conrelid = 'sale_request_offer_selections'::regclass
            AND contype = 'f'`
      );
      expect(trailFks.length).toBeGreaterThan(0);
      for (const fk of trailFks) {
        // 'a' = NO ACTION. 'c' seria CASCADE, 'n' SET NULL, 'r' RESTRICT.
        expect(fk.confdeltype, `${fk.conname} não é NO ACTION`).toBe("a");
      }
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
// FASE 4.4.1 — A INTEGRIDADE VEM DO BANCO, NÃO DO SERVICE
// ============================================================================
/**
 * Todos os testes desta seção falam SQL direto. Nenhum passa pelo service — e é
 * esse o ponto.
 *
 * A 4.4 provou que o service recusa os estados inválidos. Isso é necessário e
 * não é suficiente: um script de manutenção, um `UPDATE` manual num console de
 * produção ou um endpoint futuro que esqueça a checagem passam por baixo de
 * qualquer validação em JavaScript. Este repositório já registrou esse modo de
 * falha — filtros de fase anterior sem varredura dos consumidores, `countQuery`
 * sem os JOINs do `whereClause` — e as duas vezes o sintoma foi silencioso.
 *
 * O que se prova aqui é diferente do que a suíte da 4.4 prova: não que o sistema
 * recusa, mas que o estado inválido é INEXPRIMÍVEL. A diferença aparece no
 * código de erro — `23503`, foreign key violation, vindo do PostgreSQL.
 *
 * As duas camadas continuam existindo, e de propósito (§12 da 4.4.1): o service
 * devolve erro semântico legível (`SALE_REQUEST_OFFER_NOT_FOUND`, 404), o banco
 * torna o estado impossível. Nenhuma substitui a outra.
 */

/** Executa SQL cru e devolve o código de erro do PostgreSQL, ou `null` se passou. */
async function pgErrorCode(sql, params = []) {
  try {
    await pool.query(sql, params);
    return null;
  } catch (error) {
    return error?.code ?? "unknown";
  }
}

/** Uma solicitação com uma proposta, pelos caminhos reais. Devolve os dois ids. */
/**
 * A rodada 1 da solicitação.
 *
 * FASE 4.7 — `sale_request_offer_selections.round_id` é NOT NULL. Os INSERTs
 * CRUS deste arquivo (que existem para provar o que o BANCO recusa) precisam
 * dela, senão morrem com 23502 (not-null) antes de a FK composta ser avaliada —
 * e o teste passaria pelo motivo errado.
 */
async function roundIdOf(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT id::text AS id FROM sale_request_rounds
      WHERE sale_request_id = $1 AND round_number = 1`,
    [saleRequestId]
  );
  return rows[0]?.id ?? null;
}

async function seedRequestWithOffer(dealerIndex = 0, amount = "62000") {
  const saleRequestId = await insertSaleRequest();
  await propose(dealerIndex, saleRequestId, amount);
  const offerId = await currentOfferId(saleRequestId, dealerIndex);
  const roundId = await roundIdOf(saleRequestId);
  return { saleRequestId, offerId, roundId };
}

describe.sequential("integração — 4.4.1: a oferta selecionada PERTENCE à solicitação", () => {
  /**
   * §13 CASO A — o estado corrente.
   *
   * Com a FK SIMPLES da primeira versão da 057, este `UPDATE` era aceito: a
   * oferta existe, e era só isso que a constraint sabia perguntar. A solicitação
   * A ficaria `offer_selected` apontando para um lance feito na solicitação B —
   * um negócio que nunca houve, gravado como se tivesse havido.
   */
  it("CASO A: sale_requests não aceita selected_offer_id de OUTRA solicitação", async () => {
    const a = await seedRequestWithOffer(0, "62000");
    const b = await seedRequestWithOffer(1, "70000");

    const code = await pgErrorCode(
      `UPDATE sale_requests
          SET status = 'offer_selected',
              selected_offer_id = $2,
              selected_offer_at = NOW()
        WHERE id = $1`,
      [a.saleRequestId, b.offerId]
    );

    expect(code).toBe("23503");

    // E o estado não mudou: a transação inteira do UPDATE foi abortada.
    const row = await readRequest(a.saleRequestId);
    expect(row.status).toBe("receiving_offers");
    expect(row.selected_offer_id).toBeNull();
  });

  /**
   * §13 CASO B — a trilha.
   *
   * Com FKs por coluna, cada peça desta linha era válida (a solicitação A
   * existe, a oferta existe, a loja existe) e o conjunto era ficção. É o modo de
   * falha clássico de chave estrangeira por coluna.
   */
  it("CASO B: a trilha não aceita offer_id de OUTRA solicitação", async () => {
    const a = await seedRequestWithOffer(0, "62000");
    const b = await seedRequestWithOffer(1, "70000");

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 70000.00)`,
      [a.saleRequestId, a.roundId, b.offerId, world.advertiserIds[1], world.ownerId]
    );

    expect(code).toBe("23503");
    expect(await readSelections(a.saleRequestId)).toHaveLength(0);
  });

  /** §13 CASO C — a combinação correta continua passando. */
  it("CASO C: a combinação COERENTE é aceita nas duas tabelas", async () => {
    const { saleRequestId, offerId, roundId } = await seedRequestWithOffer(0, "62000");

    const insertCode = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 62000.00)`,
      [saleRequestId, roundId, offerId, world.advertiserIds[0], world.ownerId]
    );
    expect(insertCode).toBeNull();

    const updateCode = await pgErrorCode(
      `UPDATE sale_requests
          SET status = 'offer_selected', selected_offer_id = $2, selected_offer_at = NOW()
        WHERE id = $1`,
      [saleRequestId, offerId]
    );
    expect(updateCode).toBeNull();

    const row = await readRequest(saleRequestId);
    expect(row.status).toBe("offer_selected");
    expect(row.selected_offer_id).toBe(offerId);
  });

  /**
   * A nuance de MATCH SIMPLE, explicitada.
   *
   * A FK de `sale_requests` é composta e uma das colunas é nullable. Se alguém
   * "endurecer" isso para `MATCH FULL` no futuro, TODA linha sem seleção passa a
   * ser rejeitada — `id` nunca é NULL, então o par nunca seria "todo nulo" — e a
   * migration falha no primeiro banco com dados. Este teste trava o
   * comportamento certo.
   */
  it("MATCH SIMPLE: linha SEM seleção é aceita, apesar da FK composta", async () => {
    const code = await pgErrorCode(
      `INSERT INTO sale_requests (
         owner_user_id, city_id, brand, brand_slug, model, model_slug,
         fipe_model_description, year, mileage, transmission, fuel_type,
         declared_condition, status
       )
       VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo 1.0', 2019, 60000,
               'manual', 'flex', 'bom', 'receiving_offers')`,
      [world.ownerId, world.cityId]
    );

    expect(code).toBeNull();
  });
});

// ============================================================================
describe.sequential("integração — 4.4.1: o advertiser da trilha bate com a oferta", () => {
  /**
   * §14 — `advertiser_id` na trilha é DESNORMALIZADO, e desnormalização diverge.
   *
   * Uma trilha dizendo "a loja X ganhou" sobre um lance da loja Y é um erro de
   * auditoria que ninguém detectaria — a auditoria é justamente quem olharia
   * aqui. A FK tripla é o que torna a divergência impossível em vez de
   * improvável.
   */
  it("advertiser DIFERENTE do da oferta é recusado", async () => {
    const { saleRequestId, offerId, roundId } = await seedRequestWithOffer(0, "62000");

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 62000.00)`,
      // A oferta é da loja 0; a trilha tentaria registrar a loja 1.
      [saleRequestId, roundId, offerId, world.advertiserIds[1], world.ownerId]
    );

    expect(code).toBe("23503");
    expect(await readSelections(saleRequestId)).toHaveLength(0);
  });

  it("advertiser CORRETO é aceito", async () => {
    const { saleRequestId, offerId, roundId } = await seedRequestWithOffer(0, "62000");

    const code = await pgErrorCode(
      `INSERT INTO sale_request_offer_selections
         (sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot)
       VALUES ($1, $2, $3, $4, $5, 62000.00)`,
      [saleRequestId, roundId, offerId, world.advertiserIds[0], world.ownerId]
    );

    expect(code).toBeNull();
    expect(await readSelections(saleRequestId)).toHaveLength(1);
  });
});

// ============================================================================
describe.sequential("integração — 4.4.1: a trilha NÃO some por cascade", () => {
  /**
   * §8/§15 — a razão de ser desta fase.
   *
   * A primeira versão da 057 usava `ON DELETE CASCADE` nas quatro FKs da trilha.
   * O argumento era sobre RENDERIZAÇÃO ("um evento sobre uma solicitação apagada
   * não pode ser descrito por tela nenhuma") — e esta tabela não existe para ser
   * renderizada. Ela existe para responder "o que aconteceu?" quando alguém
   * contesta um negócio.
   *
   * CASCADE numa trilha auditável é uma contradição: o registro desapareceria em
   * silêncio, sem log e sem erro, exatamente no momento em que seria consultado.
   *
   * Os quatro testes abaixo não exigem NOME de constraint. O que importa é o
   * efeito: o DELETE falha, e a linha continua lá. Qual FK legítima bloqueou
   * primeiro é detalhe de implementação do PostgreSQL.
   */
  let scenario;

  beforeEach(async () => {
    const { saleRequestId, offerId } = await seedRequestWithOffer(0, "62000");
    await select(saleRequestId, offerId);
    scenario = { saleRequestId, offerId };

    // Pré-condição: a trilha existe antes de cada tentativa de destruição.
    expect(await readSelections(saleRequestId)).toHaveLength(1);
  });

  it("DELETE da OFERTA selecionada é rejeitado, e a trilha sobrevive", async () => {
    const code = await pgErrorCode(`DELETE FROM sale_request_offers WHERE id = $1`, [
      scenario.offerId,
    ]);

    expect(code).toBe("23503");
    expect(await readSelections(scenario.saleRequestId)).toHaveLength(1);
  });

  it("DELETE da SOLICITAÇÃO é rejeitado, e a trilha sobrevive", async () => {
    const code = await pgErrorCode(`DELETE FROM sale_requests WHERE id = $1`, [
      scenario.saleRequestId,
    ]);

    expect(code).toBe("23503");
    expect(await readSelections(scenario.saleRequestId)).toHaveLength(1);
  });

  it("DELETE do ADVERTISER é rejeitado, e a trilha sobrevive", async () => {
    const code = await pgErrorCode(`DELETE FROM advertisers WHERE id = $1`, [
      world.advertiserIds[0],
    ]);

    expect(code).toBe("23503");
    expect(await readSelections(scenario.saleRequestId)).toHaveLength(1);
  });

  /**
   * O usuário que DECIDIU.
   *
   * `users` é referenciado por muita coisa com CASCADE (`sale_requests.owner_user_id`,
   * `sale_request_offers.dealer_user_id`). A cascata tenta propagar e esbarra na
   * trilha — que é exatamente o que se quer: apagar a conta de quem decidiu não
   * pode apagar o registro da decisão em silêncio.
   */
  it("DELETE do USUÁRIO que selecionou é rejeitado, e a trilha sobrevive", async () => {
    const code = await pgErrorCode(`DELETE FROM users WHERE id = $1`, [world.ownerId]);

    expect(code).toBe("23503");
    expect(await readSelections(scenario.saleRequestId)).toHaveLength(1);
  });

  it("DELETE do usuário LOJISTA é rejeitado, e a trilha sobrevive", async () => {
    const code = await pgErrorCode(`DELETE FROM users WHERE id = $1`, [world.dealerIds[0]]);

    expect(code).toBe("23503");
    expect(await readSelections(scenario.saleRequestId)).toHaveLength(1);
  });

  /**
   * O contraste que dá sentido aos cinco testes acima: sem seleção, o CASCADE
   * histórico continua funcionando normalmente. O endurecimento não travou o
   * banco inteiro — ele travou exatamente o que precisa ser preservado.
   */
  it("sem seleção, apagar a solicitação continua funcionando (o CASCADE de offers vale)", async () => {
    // Acima do piso de R$ 60.000 que `insertSaleRequest` semeia — a regra da
    // 4.3.3 continua valendo, e o fixture tem de respeitá-la.
    const { saleRequestId } = await seedRequestWithOffer(1, "63000");

    const code = await pgErrorCode(`DELETE FROM sale_requests WHERE id = $1`, [saleRequestId]);

    expect(code).toBeNull();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM sale_request_offers WHERE sale_request_id = $1`,
      [saleRequestId]
    );
    expect(rows[0].total).toBe(0);
  });
});

// ============================================================================
describe.sequential("integração — 4.4.1: o caminho feliz e as igualdades", () => {
  /**
   * §17 — depois de endurecer, o fluxo real continua funcionando ponta a ponta,
   * e as quatro igualdades que a integridade referencial agora garante são
   * verificadas explicitamente.
   *
   * Este teste seria redundante com os da 4.4 se olhasse só o resultado. Ele
   * olha para as JUNÇÕES: é o que prova que as constraints novas descrevem o
   * mesmo mundo que o service produz — e não um mundo mais estreito que
   * recusaria o caminho legítimo.
   */
  it("duas lojas, seleção da MENOR, e as quatro igualdades fecham", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "65000");
    await propose(1, saleRequestId, "67000");

    const smaller = await currentOfferId(saleRequestId, 0);
    const outcome = await select(saleRequestId, smaller);
    expect(outcome.ok).toBe(true);

    const { rows } = await pool.query(
      `SELECT
         sr.id::text                     AS request_id,
         sr.selected_offer_id::text      AS request_selected_offer,
         sel.offer_id::text              AS trail_offer,
         sel.sale_request_id::text       AS trail_request,
         sel.advertiser_id::text         AS trail_advertiser,
         o.sale_request_id::text         AS offer_request,
         o.advertiser_id::text           AS offer_advertiser,
         o.amount::text                  AS offer_amount,
         sel.amount_snapshot::text       AS trail_amount
       FROM sale_requests sr
       JOIN sale_request_offer_selections sel ON sel.sale_request_id = sr.id
       JOIN sale_request_offers o ON o.id = sr.selected_offer_id
       WHERE sr.id = $1`,
      [saleRequestId]
    );

    expect(rows).toHaveLength(1);
    const r = rows[0];

    // 1. o estado aponta para a mesma oferta que a trilha registrou
    expect(r.request_selected_offer).toBe(r.trail_offer);
    // 2. a trilha é da mesma solicitação
    expect(r.trail_request).toBe(r.request_id);
    // 3. a oferta é da mesma solicitação
    expect(r.offer_request).toBe(r.request_id);
    // 4. o advertiser da trilha é o da oferta
    expect(r.trail_advertiser).toBe(r.offer_advertiser);

    // E a MENOR venceu — o hardening não transformou a maior em regra.
    expect(r.offer_amount).toBe("65000.00");
    expect(r.trail_amount).toBe("65000.00");
  });

  it("a notificação continua sendo criada na mesma transação", async () => {
    const { saleRequestId, offerId } = await seedRequestWithOffer(0, "62000");
    await select(saleRequestId, offerId);

    const notifications = await readNotifications(saleRequestId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient_user_id).toBe(world.dealerIds[0]);
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
   * ────────────────────────────────────────────────────────────────────────
   * A REDE DE SEGURANÇA MUDOU DE LUGAR NA FASE 4.7
   * ────────────────────────────────────────────────────────────────────────
   * Até a 4.6, quem expunha a violação era `UNIQUE (sale_request_id)` na trilha:
   * sem lock, a segunda transação estourava com erro de constraint.
   *
   * A 4.7 removeu essa UNIQUE — e teve de remover. Depois de "não houve acordo"
   * o proprietário aceita OUTRA oferta, e uma segunda seleção na mesma
   * solicitação passou a ser o caminho NORMAL do produto. Manter a constraint
   * seria proibir a funcionalidade central da fase.
   *
   * O que protege agora é o `WHERE status = ANY(selecionáveis)` do próprio
   * `UPDATE`, e este teste passou a mutar exatamente isso: remove o
   * `FOR UPDATE` e MANTÉM o guard de status, como o service real faz. A prova
   * que ele produz é mais forte que a anterior — não é "o banco arbitra com um
   * 500", é "exatamente uma transição vence, mesmo sem lock, porque o próprio
   * UPDATE re-avalia o estado".
   *
   * As duas transações ainda passam da LEITURA (é a corrida), e é isso que
   * mantém o cenário discriminante.
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

        // FASE 4.7 — `round_id` entra aqui porque a coluna e NOT NULL. Vem da
        // PROPRIA oferta: e assim que o service o resolve, e copia-lo daqui
        // mantem a mutacao fiel ao caminho real (o que esta sendo removido e o
        // LOCK, nao a rodada).
        const { rows: offerRows } = await client.query(
          `SELECT advertiser_id, amount, round_id FROM sale_request_offers WHERE id = $1`,
          [offerId]
        );

        await client.query(
          `INSERT INTO sale_request_offer_selections (
             sale_request_id, round_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            offerRows[0].round_id,
            offerId,
            offerRows[0].advertiser_id,
            world.ownerId,
            offerRows[0].amount,
          ]
        );
        // O GUARD DE ESTADO PERMANECE — o que esta mutação remove é o LOCK.
        //
        // Em READ COMMITTED a segunda transação BLOQUEIA aqui (a primeira já
        // travou a linha ao atualizá-la), e ao acordar RE-AVALIA o `WHERE`:
        // encontra `offer_selected`, que não está na lista de selecionáveis, e
        // não casa linha nenhuma.
        const updated = await client.query(
          `UPDATE sale_requests
           SET status = 'offer_selected', selected_offer_id = $2, selected_offer_at = NOW()
           WHERE id = $1
             AND status = ANY(ARRAY['receiving_offers', 'handoff_failed']::text[])`,
          [id, offerId]
        );

        if ((updated.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK");
          return { passedTheCheck: true, committed: false, lostTheRace: true };
        }

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

    // E EXATAMENTE UMA venceu — mesmo sem lock. O `WHERE` do UPDATE é a
    // barreira final, e ele sozinho serializa a transição.
    const committed = [a, b].filter((outcome) => outcome.committed);
    expect(committed).toHaveLength(1);

    // A perdedora não estourou: ela simplesmente não casou linha. É a diferença
    // entre um 409 legível e um 500 de constraint — e é o comportamento certo.
    const lost = [a, b].find((outcome) => !outcome.committed);
    expect(lost.lostTheRace).toBe(true);

    // O estado final é coerente: UMA seleção, e o ponteiro apontando para ela.
    const selections = await readSelections(id);
    expect(selections).toHaveLength(1);
    const request = await readRequest(id);
    expect(request.status).toBe("offer_selected");
    expect(String(request.selected_offer_id)).toBe(String(selections[0].offer_id));
  });
});
