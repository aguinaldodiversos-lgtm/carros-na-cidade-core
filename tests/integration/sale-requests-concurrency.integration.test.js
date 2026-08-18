import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import { EVALUATION_BODY } from "../sale-requests/evaluation-fixture.js";

/**
 * O teto de 3 solicitações abertas sob CONCORRÊNCIA REAL — o P0 da Fase 4.1.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ────────────────────────────────────────────────────────────────────────────
 * O teste unitário roda contra um array em memória com uma "conexão" só: duas
 * publicações simultâneas nunca disputam nada lá, e um service SEM transação
 * nenhuma passaria em todos aqueles casos. O bug que este arquivo caça é
 * exatamente o que o fake não consegue ver:
 *
 *     SELECT count  → 2
 *     SELECT count  → 2     (outro request, mesma janela)
 *     INSERT ×2     → QUATRO solicitações onde o teto é três
 *
 * Nenhuma constraint do banco protege contra isso: as duas linhas são
 * legítimas do ponto de vista de qualquer chave. Só o `SELECT ... FOR UPDATE`
 * na linha do USUÁRIO serializa a contagem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O LOCK É NA LINHA DO USUÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O invariante é "quantas ABERTAS esta conta tem". No instante da criação ainda
 * não existe a linha nova que serviria de mutex, e travar as linhas existentes
 * não cobriria o usuário com ZERO solicitações — não há o que travar, e dois
 * requests passariam os dois. A conta é a entidade que sempre existe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O SERVICE DE VERDADE, NÃO UMA RÉPLICA EM SQL
 * ────────────────────────────────────────────────────────────────────────────
 * O teste importa `createSaleRequest` e o executa contra este banco. Escrever o
 * BEGIN/SELECT/INSERT à mão aqui provaria que o PostgreSQL sabe travar linha —
 * que ninguém duvida — e continuaria passando no dia em que alguém removesse a
 * transação do service. É a diferença entre testar a regra e testar o ALCANCE
 * dela.
 *
 * Para isso o `DATABASE_URL` é apontado para o banco temporário ANTES do
 * primeiro import de `db.js` (o pool é construído no carregamento do módulo).
 * Por isso o import do service é dinâmico e fica depois do setup.
 *
 * A FIPE não é chamada: sem `fipe_*_code` no corpo, `resolveFipeReference`
 * devolve `no_codes_no_hint` sem tocar a rede.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-requests-concurrency.integration.test.js
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
const dbName = `salereqconc_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

const service = await import("../../src/modules/sale-requests/sale-requests.service.js");
const { SALE_REQUEST_ACTIVE_LIMIT } = await import(
  "../../src/modules/sale-requests/sale-requests.constants.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

let world;

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_images, sale_requests, users, cities RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@conc.test', 'x', 'Dono', 'cpf') RETURNING id`
  );
  const { rows: otherRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('other@conc.test', 'x', 'Outro', 'cpf') RETURNING id`
  );

  return {
    cityId: cityRows[0].id,
    ownerId: String(ownerRows[0].id),
    otherId: String(otherRows[0].id),
  };
}

/**
 * Corpo válido com chaves de foto ÚNICAS por chamada.
 *
 * `storage_key` é UNIQUE GLOBAL: se as duas chamadas concorrentes usassem as
 * mesmas chaves, a segunda falharia por violação de constraint e o teste
 * "provaria" o limite sem nunca tê-lo exercitado.
 */
function bodyFor(ownerId, tag, overrides = {}) {
  return {
    city_id: world.cityId,
    brand: "VW - VolksWagen",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2020",
    mileage: "45000",
    transmission: "Automático",
    fuel_type: "Flex",
    declared_condition: "bom",
    // A ficha de avaliação é obrigatória para solicitação NOVA. Sem ela o
    // service recusa antes de chegar à transação — e todo teste de concorrência
    // deste arquivo "passaria" sem nunca ter exercitado o lock.
    ...EVALUATION_BODY,
    images: Array.from(
      { length: 4 },
      (_, index) => `sale-requests/${ownerId}/${tag}/2026/08/uuid-${index}.webp`
    ),
    ...overrides,
  };
}

function ownerUser(id) {
  return { id, account_type: "CPF" };
}

async function countOpen(ownerId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM sale_requests
     WHERE owner_user_id = $1 AND status = 'receiving_offers'`,
    [ownerId]
  );
  return rows[0].n;
}

/** Publica `count` solicitações em SÉRIE, pelo service real. */
async function publishSerially(ownerId, count) {
  for (let index = 0; index < count; index += 1) {
    await service.createSaleRequest(ownerUser(ownerId), bodyFor(ownerId, `seed-${index}`));
  }
}

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool
    .query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
    .catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`).catch(() => {});
  await adminPool.end().catch(() => {});
});

describe.sequential("teto de solicitações abertas — sequencial", () => {
  it("dono com 0 abertas consegue criar", async () => {
    const result = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "a")
    );

    expect(result.sale_request.id).toBeDefined();
    expect(result.sale_request.status).toBe("receiving_offers");
    expect(await countOpen(world.ownerId)).toBe(1);
  });

  it(`dono com ${SALE_REQUEST_ACTIVE_LIMIT} abertas recebe 409 com o código estável`, async () => {
    await publishSerially(world.ownerId, SALE_REQUEST_ACTIVE_LIMIT);

    await expect(
      service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, "extra"))
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { code: "SALE_REQUEST_ACTIVE_LIMIT_REACHED" },
    });

    expect(await countOpen(world.ownerId)).toBe(SALE_REQUEST_ACTIVE_LIMIT);
  });

  it("CANCELADA não conta para o teto", async () => {
    await publishSerially(world.ownerId, SALE_REQUEST_ACTIVE_LIMIT);

    const { rows } = await pool.query(
      `SELECT id FROM sale_requests WHERE owner_user_id = $1 ORDER BY id ASC LIMIT 1`,
      [world.ownerId]
    );
    await service.cancelMySaleRequest(world.ownerId, String(rows[0].id));

    expect(await countOpen(world.ownerId)).toBe(SALE_REQUEST_ACTIVE_LIMIT - 1);

    // A vaga liberada permite publicar de novo — quem cancelou não fica preso
    // pelo próprio histórico.
    await expect(
      service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, "reposicao"))
    ).resolves.toBeTruthy();

    expect(await countOpen(world.ownerId)).toBe(SALE_REQUEST_ACTIVE_LIMIT);
  });

  it("o teto é POR CONTA — outro usuário não é afetado", async () => {
    await publishSerially(world.ownerId, SALE_REQUEST_ACTIVE_LIMIT);

    await expect(
      service.createSaleRequest(ownerUser(world.otherId), bodyFor(world.otherId, "outro"))
    ).resolves.toBeTruthy();
  });
});

describe.sequential("P0 — o teto sob CORRIDA REAL", () => {
  /**
   * O cenário EXATO que a especificação da fase pede (§37): conta com 2 abertas,
   * duas chamadas concorrentes, uma vence e uma recebe 409.
   *
   * ────────────────────────────────────────────────────────────────────────
   * POR QUE EM RODADAS, E NÃO UMA VEZ SÓ
   * ────────────────────────────────────────────────────────────────────────
   * Uma execução única deste cenário NÃO é um detector confiável — foi medido:
   * com o `FOR UPDATE` removido do repositório, a versão de uma rodada passou,
   * enquanto a rajada de quatro falhou na hora. Com apenas duas transações, é
   * comum a primeira commitar antes de a segunda contar, e aí não há corrida
   * nenhuma para observar.
   *
   * Um teste de concorrência que só às vezes enxerga a concorrência é pior que
   * não ter teste: ele dá sinal verde por sorte. As rodadas repetem a janela até
   * o entrelaçamento acontecer, e a asserção é POR RODADA — um único vazamento
   * em qualquer uma delas reprova a fase.
   */
  it("duas publicações simultâneas com 2 abertas: uma vence, uma recebe 409, total exatamente 3", async () => {
    const ROUNDS = 12;

    for (let round = 0; round < ROUNDS; round += 1) {
      world = await seedWorld();
      await publishSerially(world.ownerId, SALE_REQUEST_ACTIVE_LIMIT - 1);
      expect(await countOpen(world.ownerId)).toBe(SALE_REQUEST_ACTIVE_LIMIT - 1);

      // Disparadas SEM await entre elas: as duas transações abrem antes de
      // qualquer uma commitar.
      const results = await Promise.allSettled([
        service.createSaleRequest(
          ownerUser(world.ownerId),
          bodyFor(world.ownerId, `corrida-${round}-a`)
        ),
        service.createSaleRequest(
          ownerUser(world.ownerId),
          bodyFor(world.ownerId, `corrida-${round}-b`)
        ),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled, `rodada ${round}`).toHaveLength(1);
      expect(rejected, `rodada ${round}`).toHaveLength(1);

      // A recusa precisa ser a do DOMÍNIO, não um deadlock nem uma violação de
      // constraint: o usuário tem de receber "cancele uma para publicar outra".
      expect(rejected[0].reason, `rodada ${round}`).toMatchObject({
        statusCode: 409,
        details: { code: "SALE_REQUEST_ACTIVE_LIMIT_REACHED" },
      });

      // A asserção que decide GO/NO-GO da fase.
      expect(await countOpen(world.ownerId), `rodada ${round}`).toBe(SALE_REQUEST_ACTIVE_LIMIT);
    }
  });

  it("quatro publicações simultâneas a partir de ZERO param exatamente no teto", async () => {
    const attempts = Array.from({ length: 4 }, (_, index) =>
      service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, `rajada-${index}`))
    );

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(SALE_REQUEST_ACTIVE_LIMIT);
    expect(rejected).toHaveLength(4 - SALE_REQUEST_ACTIVE_LIMIT);

    for (const failure of rejected) {
      expect(failure.reason).toMatchObject({
        details: { code: "SALE_REQUEST_ACTIVE_LIMIT_REACHED" },
      });
    }

    expect(await countOpen(world.ownerId)).toBe(SALE_REQUEST_ACTIVE_LIMIT);
  });

  it("contas DIFERENTES não se bloqueiam", async () => {
    // O lock é por linha de usuário, então dois donos publicando ao mesmo tempo
    // não formam fila. Se este teste travar, o lock está grosso demais.
    const results = await Promise.allSettled([
      service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, "par-a")),
      service.createSaleRequest(ownerUser(world.otherId), bodyFor(world.otherId, "par-b")),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await countOpen(world.ownerId)).toBe(1);
    expect(await countOpen(world.otherId)).toBe(1);
  });
});

describe.sequential("atomicidade de solicitação + galeria", () => {
  it("as 4 fotos são persistidas junto com a solicitação", async () => {
    const result = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "galeria")
    );

    const { rows } = await pool.query(
      `SELECT storage_key, sort_order FROM sale_request_images
       WHERE sale_request_id = $1 ORDER BY sort_order`,
      [result.sale_request.id]
    );

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2, 3]);
    for (const row of rows) {
      expect(row.storage_key.startsWith(`sale-requests/${world.ownerId}/`)).toBe(true);
    }
  });

  it("foto já usada derruba a solicitação INTEIRA — nada parcial sobrevive", async () => {
    await service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, "primeira"));
    const before = await countOpen(world.ownerId);

    // Mesmas chaves: o UNIQUE global recusa dentro da transação.
    await expect(
      service.createSaleRequest(ownerUser(world.ownerId), bodyFor(world.ownerId, "primeira"))
    ).rejects.toThrow();

    // ROLLBACK de verdade: nenhuma solicitação sem galeria ficou para trás.
    expect(await countOpen(world.ownerId)).toBe(before);

    const { rows } = await pool.query(
      `SELECT sr.id FROM sale_requests sr
       LEFT JOIN sale_request_images i ON i.sale_request_id = sr.id
       WHERE i.id IS NULL`
    );
    expect(rows).toHaveLength(0);
  });

  it("cidade inexistente não deixa resíduo", async () => {
    await expect(
      service.createSaleRequest(ownerUser(world.ownerId), {
        ...bodyFor(world.ownerId, "cidade-ruim"),
        city_id: 999999,
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(await countOpen(world.ownerId)).toBe(0);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM sale_request_images`);
    expect(rows[0].n).toBe(0);
  });
});

describe.sequential("posse contra o banco real", () => {
  it("o dono não lê nem cancela solicitação alheia", async () => {
    const created = await service.createSaleRequest(
      ownerUser(world.otherId),
      bodyFor(world.otherId, "alheia")
    );
    const id = String(created.sale_request.id);

    await expect(service.getMySaleRequest(world.ownerId, id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.cancelMySaleRequest(world.ownerId, id)).rejects.toMatchObject({
      statusCode: 404,
    });

    const { rows } = await pool.query(`SELECT status FROM sale_requests WHERE id = $1`, [id]);
    expect(rows[0].status).toBe("receiving_offers");
  });

  it("o cancelamento é soft e o retry não muda nada", async () => {
    const created = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "cancelavel")
    );
    const id = String(created.sale_request.id);

    const first = await service.cancelMySaleRequest(world.ownerId, id);
    expect(first.changed).toBe(true);

    const { rows: afterFirst } = await pool.query(
      `SELECT status, updated_at FROM sale_requests WHERE id = $1`,
      [id]
    );

    const second = await service.cancelMySaleRequest(world.ownerId, id);
    expect(second.changed).toBe(false);

    const { rows: afterSecond } = await pool.query(
      `SELECT status, updated_at FROM sale_requests WHERE id = $1`,
      [id]
    );

    // A linha continua existindo (soft) e o retry nem reescreve `updated_at`.
    expect(afterSecond[0].status).toBe("cancelled");
    expect(afterSecond[0].updated_at.toISOString()).toBe(afterFirst[0].updated_at.toISOString());
  });
});

/**
 * ROUND-TRIP da ficha de avaliação: POST → banco → GET do detalhe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO NÃO É REDUNDANTE COM O TESTE UNITÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O teste unitário prova que os validadores normalizam e que o DTO monta as
 * chaves certas. Nenhum dos dois toca no PostgreSQL, e é justamente entre a
 * aplicação e o banco que moram os defeitos desta classe:
 *
 *   - um `$N` fora de ordem no INSERT grava o câmbio na coluna do motor, e todo
 *     teste unitário continua verde porque nenhum deles vê a query;
 *   - um array JS entregue ao driver sem `::jsonb` vira ARRAY do Postgres
 *     (`{a,b}`), não JSON — o CHECK de `jsonb_typeof` derruba a escrita, mas só
 *     em runtime;
 *   - `NUMERIC` volta do driver como STRING, e um teste que compare com número
 *     passaria com `==` e falharia com `toBe`.
 *
 * Aqui o dado faz o caminho inteiro e volta.
 */
describe("ficha de avaliação — round-trip com PostgreSQL", () => {
  it("persiste e devolve TODOS os campos da ficha", async () => {
    const created = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "ficha", {
        tire_condition: "half_life",

        financing_status: "yes",
        financing_balance: "18500.00",
        fines_status: "yes",
        fines_amount: "320.55",
        ipva_status: "installments",
        ipva_amount_due: "450.50",
        licensing_status: "pending",

        caution_report_status: "approved_with_notes",
        auction_history: "unknown",
        collision_history: "no",

        engine_condition: "issue",
        engine_notes: "trepida ao frear",
        gearbox_condition: "ok",
        suspension_condition: "unknown",

        body_paint_status: "issues",
        body_paint_issues: ["scratches", "dents"],
        body_paint_notes: "porta traseira direita",

        known_issues: "Revisões sempre na concessionária.",
      })
    );

    const id = created.sale_request.id;

    // Leitura pelo MESMO caminho que a tela do dono usa.
    const { sale_request: detail } = await service.getMySaleRequest(world.ownerId, String(id));

    expect(detail).toMatchObject({
      tire_condition: "half_life",
      financing_status: "yes",
      fines_status: "yes",
      ipva_status: "installments",
      licensing_status: "pending",
      caution_report_status: "approved_with_notes",
      auction_history: "unknown",
      collision_history: "no",
      engine_condition: "issue",
      engine_notes: "trepida ao frear",
      gearbox_condition: "ok",
      gearbox_notes: null,
      suspension_condition: "unknown",
      suspension_notes: null,
      body_paint_status: "issues",
      body_paint_notes: "porta traseira direita",
      known_issues: "Revisões sempre na concessionária.",
    });

    // NUMERIC volta como STRING com duas casas — o driver `pg` não converte
    // para float de propósito, e a tela formata a partir do texto.
    expect(detail.financing_balance).toBe("18500.00");
    expect(detail.fines_amount).toBe("320.55");
    expect(detail.ipva_amount_due).toBe("450.50");

    // JSONB volta como ARRAY de verdade, não como string.
    expect(Array.isArray(detail.body_paint_issues)).toBe(true);
    expect(detail.body_paint_issues).toEqual(["scratches", "dents"]);
  });

  it("normaliza os condicionais NO BANCO, não só no DTO", async () => {
    // O cliente manda valores que a resposta não justifica. O servidor grava
    // NULL — e a prova tem de vir da COLUNA, não do objeto devolvido: um DTO
    // que zerasse na serialização esconderia lixo persistido.
    //
    // NOTA sobre a assimetria deliberada: valor abandonado é LIMPADO em
    // silêncio (dinheiro, descrição mecânica, observação de lataria), porque é
    // resíduo de quem mudou de ideia com o campo já preenchido. Já
    // `body_paint_issues` marcado junto de "nenhum detalhe" é RECUSADO — essa
    // combinação a tela não consegue produzir (as caixas somem e são zeradas),
    // então ela só chega de um cliente malformado. Ver o teste dedicado a essa
    // recusa em `sale-requests-evaluation.test.js`.
    const created = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "normaliza", {
        financing_status: "no",
        financing_balance: "18500.00",
        fines_status: "no",
        fines_amount: "999.00",
        ipva_status: "paid",
        ipva_amount_due: "450.00",
        engine_condition: "ok",
        engine_notes: "texto que não deve sobreviver",
        body_paint_status: "none",
        body_paint_notes: "não deve sobreviver",
      })
    );

    const { rows } = await pool.query(
      `SELECT financing_balance, fines_amount, ipva_amount_due,
              engine_notes, body_paint_issues, body_paint_notes
       FROM sale_requests WHERE id = $1`,
      [created.sale_request.id]
    );

    expect(rows[0].financing_balance).toBeNull();
    expect(rows[0].fines_amount).toBeNull();
    expect(rows[0].ipva_amount_due).toBeNull();
    expect(rows[0].engine_notes).toBeNull();
    expect(rows[0].body_paint_notes).toBeNull();
    // Lista VAZIA (respondeu "nenhum detalhe"), não NULL (não perguntado).
    expect(rows[0].body_paint_issues).toEqual([]);
  });

  it("uma ficha inteira de 'não sei' é aceita", async () => {
    // O produto precisa aceitar quem não sabe responder: exigir certeza
    // afastaria justamente o vendedor que mais precisa da avaliação da loja.
    const unknownEverything = {
      tire_condition: "unknown",
      financing_status: "unknown",
      fines_status: "unknown",
      ipva_status: "unknown",
      licensing_status: "unknown",
      caution_report_status: "unknown",
      auction_history: "unknown",
      collision_history: "unknown",
      engine_condition: "unknown",
      gearbox_condition: "unknown",
      suspension_condition: "unknown",
      body_paint_status: "unknown",
    };

    const created = await service.createSaleRequest(
      ownerUser(world.ownerId),
      bodyFor(world.ownerId, "naosei", unknownEverything)
    );

    const { sale_request: detail } = await service.getMySaleRequest(
      world.ownerId,
      String(created.sale_request.id)
    );

    expect(detail.tire_condition).toBe("unknown");
    expect(detail.body_paint_issues).toEqual([]);
  });

  it("RECUSA a solicitação nova sem a ficha", async () => {
    // A obrigatoriedade vive na aplicação (a coluna é nullable por causa das
    // linhas legadas). Este teste é o que impede a regra de sumir sem ninguém
    // notar: sem ele, remover a validação faria linhas novas nascerem
    // indistinguíveis das antigas.
    const body = bodyFor(world.ownerId, "semficha");
    delete body.tire_condition;

    await expect(service.createSaleRequest(ownerUser(world.ownerId), body)).rejects.toThrow(
      /pneus/i
    );
  });

  it("linha LEGADA continua legível pelo detalhe, com a ficha em NULL", async () => {
    // Solicitação escrita como a versão anterior escrevia: só as colunas da
    // 052. É o cenário de todo registro que já existe em produção.
    const { rows } = await pool.query(
      `INSERT INTO sale_requests (
         owner_user_id, city_id, brand, brand_slug, model, model_slug,
         fipe_model_description, year, mileage, transmission, fuel_type,
         declared_condition
       )
       VALUES ($1,$2,'Volkswagen','volkswagen','T-Cross','t-cross',
               'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.',2019,60000,'manual','flex','regular')
       RETURNING id`,
      [world.ownerId, world.cityId]
    );

    const { sale_request: detail } = await service.getMySaleRequest(
      world.ownerId,
      String(rows[0].id)
    );

    // Abre normalmente...
    expect(detail.year).toBe(2019);
    expect(detail.declared_condition).toBe("regular");

    // ...e a ficha inteira é NULL — nunca "no", nunca "unknown". A diferença
    // entre "não foi perguntado" e "a pessoa respondeu que não" precisa
    // sobreviver à leitura.
    for (const field of [
      "tire_condition",
      "financing_status",
      "fines_status",
      "ipva_status",
      "licensing_status",
      "caution_report_status",
      "auction_history",
      "collision_history",
      "engine_condition",
      "gearbox_condition",
      "suspension_condition",
      "body_paint_status",
      "body_paint_issues",
    ]) {
      expect(detail[field], `${field} deveria ser null numa linha legada`).toBeNull();
    }
  });
});
