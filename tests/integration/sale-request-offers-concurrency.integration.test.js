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
 * A REGRA DA MAIOR OFERTA sob CONCORRÊNCIA REAL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ────────────────────────────────────────────────────────────────────────────
 * O teste unitário roda contra um array em memória com uma "conexão" só: duas
 * propostas simultâneas nunca disputam nada lá, e um service SEM transação
 * nenhuma passaria em todos aqueles casos. O bug que este arquivo caça é
 * exatamente o que o fake não consegue ver:
 *
 *     líder atual: 50.000
 *     A lê 50.000 → grava 51.000
 *     B lê 50.000 → grava 50.500     (mesma janela; B nunca viu os 51.000)
 *
 * As duas linhas ficam gravadas e a regra "precisa superar a maior atual" fica
 * violada NO BANCO, sem erro em lugar nenhum. É uma corrida silenciosa: o log
 * fica limpo, e o defeito só aparece quando alguém compara os números — que
 * neste produto significa um lojista descobrindo que perdeu para um valor menor
 * que o dele.
 *
 * Nenhum índice único protege contra isso, e nenhum poderia: as duas propostas
 * são de LOJAS DIFERENTES com VALORES DIFERENTES, então as duas linhas são
 * legítimas do ponto de vista de qualquer chave. Só o `SELECT ... FOR UPDATE` na
 * solicitação serializa a leitura do líder.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O SERVICE DE VERDADE, NÃO UMA RÉPLICA EM SQL
 * ────────────────────────────────────────────────────────────────────────────
 * O teste importa `createSaleOffer` e o executa contra este banco. Escrever o
 * BEGIN/SELECT/INSERT à mão aqui provaria que o PostgreSQL sabe travar linha —
 * que ninguém duvida — e continuaria passando no dia em que alguém removesse a
 * transação do service. É a diferença entre testar a regra e testar o ALCANCE
 * dela.
 *
 * Para isso o `DATABASE_URL` é apontado para o banco temporário ANTES do
 * primeiro import de `db.js` (o pool é construído no carregamento do módulo).
 * Por isso os imports do service são dinâmicos e ficam depois do setup.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TESTE POR MUTAÇÃO — A ÚLTIMA SEÇÃO DESTE ARQUIVO
 * ────────────────────────────────────────────────────────────────────────────
 * Um teste de concorrência que passa pode estar passando por sorte de
 * escalonamento, e não porque o lock existe. A última seção prova o contrário:
 * ela executa, à mão, a MESMA sequência SEM `FOR UPDATE`, e exige que a violação
 * apareça. Se ela não aparecer, o cenário não é discriminante e os testes acima
 * não valem nada — e o próprio teste diz isso, em vez de fingir sucesso.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-offers-concurrency.integration.test.js
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
const dbName = `saleofferconc_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

// --- setup: banco temporário + service apontado para ele --------------------

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

// ORDEM CRÍTICA: o pool de `db.js` é construído no load do módulo, a partir de
// `env.DATABASE_URL`. Apontar depois do import não teria efeito nenhum.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";

const offersService = await import(
  "../../src/modules/sale-requests/sale-requests.offers.service.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

let world;

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_offers, sale_request_images, sale_requests, advertisers, users, cities
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
     VALUES ('owner@offer.test', 'x', 'Dono', 'cpf') RETURNING id`
  );

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('a@offer.test', 'x', 'Loja A', 'cnpj'),
            ('b@offer.test', 'x', 'Loja B', 'cnpj'),
            ('c@offer.test', 'x', 'Loja C', 'cnpj'),
            ('d@offer.test', 'x', 'Loja D', 'cnpj')
     RETURNING id`
  );

  const advertiserIds = [];
  for (const [index, dealer] of dealerRows.entries()) {
    const { rows } = await pool.query(
      `INSERT INTO advertisers (user_id, name, city_id, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [dealer.id, `Loja ${index}`, cityId]
    );
    advertiserIds.push(rows[0].id);
  }

  return {
    cityId,
    otherCityId,
    ownerId: String(ownerRows[0].id),
    dealerIds: dealerRows.map((row) => String(row.id)),
    advertiserIds,
  };
}

async function insertSaleRequest({ cityId, status = "receiving_offers" } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, year, mileage, transmission, fuel_type,
       declared_condition, status
     )
     VALUES ($1, $2, 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
             'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.', 2020, 45000, 'automatico', 'flex',
             'bom', $3)
     RETURNING id`,
    [world.ownerId, cityId ?? world.cityId, status]
  );
  return String(rows[0].id);
}

async function readOffers(saleRequestId) {
  const { rows } = await pool.query(
    `SELECT amount::text AS amount, advertiser_id, dealer_user_id
     FROM sale_request_offers
     WHERE sale_request_id = $1
     ORDER BY id ASC`,
    [saleRequestId]
  );
  return rows;
}

/** Executa uma proposta e devolve `{ ok }` ou `{ ok:false, status, code }`. */
async function propose(dealerIndex, saleRequestId, amount) {
  try {
    const result = await offersService.createSaleOffer(
      world.dealerIds[dealerIndex],
      saleRequestId,
      { amount: String(amount) }
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
describe.sequential("integração — a regra da maior oferta no PostgreSQL real", () => {
  it("a primeira proposta é aceita e vira a líder", async () => {
    const saleRequestId = await insertSaleRequest();
    const result = await propose(0, saleRequestId, "50000");

    expect(result.ok).toBe(true);
    expect(result.result.current_highest_offer).toBe("50000.00");
    expect(await readOffers(saleRequestId)).toHaveLength(1);
  });

  it("os DOIS atores são gravados: conta e loja", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    const [row] = await readOffers(saleRequestId);
    expect(String(row.dealer_user_id)).toBe(world.dealerIds[0]);
    expect(String(row.advertiser_id)).toBe(String(world.advertiserIds[0]));
  });

  it("abaixo e igual ao líder são recusados; acima é aceito", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    expect((await propose(1, saleRequestId, "49000")).ok).toBe(false);
    expect((await propose(1, saleRequestId, "50000")).ok).toBe(false);
    expect((await propose(1, saleRequestId, "50000.01")).ok).toBe(true);

    // Só a primeira e a última gravaram.
    expect(await readOffers(saleRequestId)).toHaveLength(2);
  });

  it("solicitação CANCELADA recusa com 409, e o histórico permanece", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    await pool.query(`UPDATE sale_requests SET status = 'cancelled' WHERE id = $1`, [
      saleRequestId,
    ]);

    const rejected = await propose(1, saleRequestId, "60000");
    expect(rejected.ok).toBe(false);
    expect(rejected.status).toBe(409);
    expect(rejected.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");

    // O cancelamento NÃO apaga proposta: é soft status, e a 055 não tem cascade
    // por status nenhum.
    expect(await readOffers(saleRequestId)).toHaveLength(1);
  });

  it("solicitação de OUTRA cidade é 404 — o lock já nasce escopado", async () => {
    const foreignId = await insertSaleRequest({ cityId: world.otherCityId });
    const rejected = await propose(0, foreignId, "50000");

    expect(rejected.ok).toBe(false);
    expect(rejected.status).toBe(404);
    expect(await readOffers(foreignId)).toHaveLength(0);
  });
});

// ============================================================================
describe.sequential("integração — concorrência real", () => {
  it("A(51.000) e B(50.500) SIMULTÂNEOS: exatamente uma passa, e é a maior", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    const [a, b] = await Promise.all([
      propose(1, saleRequestId, "51000"),
      propose(2, saleRequestId, "50500"),
    ]);

    const accepted = [a, b].filter((item) => item.ok);
    expect(accepted).toHaveLength(1);

    const rows = await readOffers(saleRequestId);
    expect(rows).toHaveLength(2);
    // A aceita É a de 51.000: 50.500 não supera 51.000 em ordem nenhuma de
    // execução, então o resultado é DETERMINÍSTICO mesmo com escalonamento livre.
    expect(rows[1].amount).toBe("51000.00");
  });

  it("o resultado é ESTÁVEL: cinco rodadas, sempre a maior vence", async () => {
    for (let round = 0; round < 5; round += 1) {
      const saleRequestId = await insertSaleRequest();
      await propose(0, saleRequestId, "50000");

      const [a, b] = await Promise.all([
        propose(1, saleRequestId, "51000"),
        propose(2, saleRequestId, "50500"),
      ]);

      expect([a, b].filter((item) => item.ok)).toHaveLength(1);
      const rows = await readOffers(saleRequestId);
      expect(rows.map((row) => row.amount)).toEqual(["50000.00", "51000.00"]);
    }
  });

  it("QUATRO lojas simultâneas com valores crescentes: o histórico nunca viola a regra", async () => {
    const saleRequestId = await insertSaleRequest();

    await Promise.all([
      propose(0, saleRequestId, "50000"),
      propose(1, saleRequestId, "51000"),
      propose(2, saleRequestId, "52000"),
      propose(3, saleRequestId, "53000"),
    ]);

    const rows = await readOffers(saleRequestId);

    // O INVARIANTE, e a única asserção que importa: na ordem de inserção, cada
    // proposta é ESTRITAMENTE maior que todas as anteriores. Quantas passaram
    // depende do escalonamento e não é o que está sob teste.
    const amounts = rows.map((row) => Number(row.amount));
    for (let index = 1; index < amounts.length; index += 1) {
      expect(amounts[index]).toBeGreaterThan(amounts[index - 1]);
    }
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it("duas propostas do MESMO valor simultâneas: só uma entra", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    const [a, b] = await Promise.all([
      propose(1, saleRequestId, "55000"),
      propose(2, saleRequestId, "55000"),
    ]);

    expect([a, b].filter((item) => item.ok)).toHaveLength(1);
    expect(await readOffers(saleRequestId)).toHaveLength(2);
  });

  it("clique duplo da MESMA loja com o mesmo valor grava UMA linha", async () => {
    const saleRequestId = await insertSaleRequest();

    const [a, b] = await Promise.all([
      propose(0, saleRequestId, "50000"),
      propose(0, saleRequestId, "50000"),
    ]);

    expect([a, b].filter((item) => item.ok)).toHaveLength(1);
    expect(await readOffers(saleRequestId)).toHaveLength(1);
  });

  it("solicitações DIFERENTES não se bloqueiam — o lock é por linha", async () => {
    const first = await insertSaleRequest();
    const second = await insertSaleRequest();

    const [a, b] = await Promise.all([
      propose(0, first, "50000"),
      propose(1, second, "40000"),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

// ============================================================================
describe.sequential("teste POR MUTAÇÃO — o cenário é discriminante?", () => {
  /**
   * A MESMA sequência do service, à mão, e SEM `FOR UPDATE`.
   *
   * Este bloco não testa o produto: testa o TESTE. Se a versão sem lock também
   * respeitar a regra, então o cenário acima não é discriminante — ele passaria
   * com ou sem a transação, e a suíte estaria dando confiança falsa exatamente
   * no ponto onde há dinheiro em disputa.
   *
   * Nada aqui usa código de produção, e nada aqui é commitado como mutação: a
   * versão sem lock existe SÓ dentro desta função.
   */
  async function proposeWithoutLock(saleRequestId, advertiserId, dealerUserId, amount, cityId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // A ÚNICA diferença para o service: sem `FOR UPDATE`.
      const { rows: srRows } = await client.query(
        `SELECT id, status FROM sale_requests WHERE id = $1 AND city_id = $2`,
        [saleRequestId, cityId]
      );
      if (!srRows[0] || srRows[0].status !== "receiving_offers") {
        await client.query("ROLLBACK");
        return { ok: false };
      }

      const { rows: highRows } = await client.query(
        `SELECT amount FROM sale_request_offers
         WHERE sale_request_id = $1 ORDER BY amount DESC, id DESC LIMIT 1`,
        [saleRequestId]
      );
      const highest = highRows[0]?.amount ?? null;

      // A janela: um respiro entre LER e ESCREVER. Sem ele as duas transações
      // podem simplesmente não se sobrepor, e a corrida não acontece — o que
      // faria a mutação "passar" por acidente e esconder o defeito.
      await new Promise((resolve) => setTimeout(resolve, 60));

      if (highest != null && Number(amount) <= Number(highest)) {
        await client.query("ROLLBACK");
        return { ok: false };
      }

      await client.query(
        `INSERT INTO sale_request_offers (sale_request_id, dealer_user_id, advertiser_id, amount)
         VALUES ($1, $2, $3, $4)`,
        [saleRequestId, dealerUserId, advertiserId, amount]
      );
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return { ok: false, error };
    } finally {
      client.release();
    }
  }

  it("SEM o lock, a corrida acontece: duas propostas passam e o histórico viola a regra", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    await Promise.all([
      proposeWithoutLock(
        saleRequestId,
        world.advertiserIds[1],
        world.dealerIds[1],
        "51000",
        world.cityId
      ),
      proposeWithoutLock(
        saleRequestId,
        world.advertiserIds[2],
        world.dealerIds[2],
        "50500",
        world.cityId
      ),
    ]);

    const rows = await readOffers(saleRequestId);
    const amounts = rows.map((row) => Number(row.amount));

    // O DEFEITO que o lock existe para impedir: uma proposta gravada DEPOIS de
    // outra maior. Se esta asserção falhar, o cenário não é discriminante e os
    // testes de concorrência acima não provam nada — é isso que a mensagem diz.
    const violates = amounts.some(
      (amount, index) => index > 0 && amount <= Math.max(...amounts.slice(0, index))
    );

    expect(
      violates,
      "a versão SEM lock respeitou a regra — o cenário não é discriminante, e os testes de concorrência acima estão dando confiança falsa"
    ).toBe(true);
  });

  it("COM o lock, exatamente o mesmo cenário respeita a regra", async () => {
    const saleRequestId = await insertSaleRequest();
    await propose(0, saleRequestId, "50000");

    await Promise.all([
      propose(1, saleRequestId, "51000"),
      propose(2, saleRequestId, "50500"),
    ]);

    const amounts = (await readOffers(saleRequestId)).map((row) => Number(row.amount));
    const violates = amounts.some(
      (amount, index) => index > 0 && amount <= Math.max(...amounts.slice(0, index))
    );

    expect(violates).toBe(false);
  });
});
