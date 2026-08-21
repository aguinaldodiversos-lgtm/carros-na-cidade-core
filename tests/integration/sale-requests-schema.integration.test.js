import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
// A allowlist da APLICAÇÃO, importada para ser confrontada com a do BANCO.
// Reescrever a lista aqui faria o teste concordar consigo mesmo em vez de
// provar que as duas pontas dizem a mesma coisa.
import { BODY_PAINT_ISSUES } from "../../src/modules/sale-requests/sale-requests.constants.js";

/**
 * O ESQUEMA das migrations 052/053 contra PostgreSQL de verdade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO NÃO PODE SER TESTE UNITÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O fake-db é um array em memória. Ele pode até imitar o `UNIQUE` de
 * `storage_key` (e imita), mas não imita CHECK constraint, FK, CASCADE nem
 * DEFAULT — e sobretudo não pega o erro mais comum de migration, que é a que
 * simplesmente não roda. Um CHECK escrito errado passa por toda a suíte unitária
 * e só aparece em produção, no primeiro INSERT que ele deveria ter recusado.
 *
 * Aqui cada garantia da migration é exercitada pelo próprio PostgreSQL.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-requests-schema.integration.test.js
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
const dbName = `salereqschema_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_images, sale_requests, users, cities RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@schema.test', 'x', 'Dono', 'cpf') RETURNING id`
  );

  return { cityId: cityRows[0].id, ownerId: ownerRows[0].id };
}

let world;

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await adminPool
    .query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
    .catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`).catch(() => {});
  await adminPool.end().catch(() => {});
});

/** INSERT mínimo válido; `overrides` troca colunas para exercitar cada CHECK. */
async function insertRequest(overrides = {}) {
  const row = {
    owner_user_id: world.ownerId,
    city_id: world.cityId,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: null,
    fipe_reference_value: null,
    fipe_reference_at: null,
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...overrides,
  };

  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, fipe_code, fipe_reference_value, fipe_reference_at,
       year, mileage, transmission, fuel_type, declared_condition, known_issues
       ${overrides.status !== undefined ? ", status" : ""}
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       ${overrides.status !== undefined ? ", $17" : ""})
     RETURNING id, status, created_at, updated_at`,
    [
      row.owner_user_id,
      row.city_id,
      row.brand,
      row.brand_slug,
      row.model,
      row.model_slug,
      row.fipe_model_description,
      row.fipe_code,
      row.fipe_reference_value,
      row.fipe_reference_at,
      row.year,
      row.mileage,
      row.transmission,
      row.fuel_type,
      row.declared_condition,
      row.known_issues,
      ...(overrides.status !== undefined ? [row.status] : []),
    ]
  );

  return rows[0];
}

describe.sequential("migration 052 — sale_requests", () => {
  it("a tabela existe com as colunas previstas e SEM as proibidas", async () => {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'`
    );
    const byName = new Map(rows.map((row) => [row.column_name, row]));

    for (const column of [
      "id",
      "owner_user_id",
      "city_id",
      "brand",
      "brand_slug",
      "model",
      "model_slug",
      "fipe_model_description",
      "fipe_code",
      "fipe_reference_value",
      "fipe_reference_at",
      "year",
      "mileage",
      "transmission",
      "fuel_type",
      "declared_condition",
      "known_issues",
      "status",
      "created_at",
      "updated_at",
    ]) {
      expect(byName.has(column), `coluna ausente: ${column}`).toBe(true);
    }

    // O que a Fase 4.1 decidiu NÃO criar. `plate` é o item de LGPD (§17);
    // os outros são estado que ainda não tem quem escreva.
    for (const forbidden of [
      "plate",
      "plate_hash",
      "expires_at",
      "current_highest_bid",
      "selected_bid_id",
    ]) {
      expect(byName.has(forbidden), `coluna proibida presente: ${forbidden}`).toBe(false);
    }

    // Obrigatoriedade que o produto depende: sem cidade não há distribuição.
    expect(byName.get("city_id").is_nullable).toBe("NO");
    expect(byName.get("owner_user_id").is_nullable).toBe("NO");
    expect(byName.get("fipe_model_description").is_nullable).toBe("NO");
    // FIPE é âncora opcional — nunca inventada.
    expect(byName.get("fipe_reference_value").is_nullable).toBe("YES");
    expect(byName.get("known_issues").is_nullable).toBe("YES");
  });

  it("nasce em receiving_offers por DEFAULT", async () => {
    const row = await insertRequest();
    expect(row.status).toBe("receiving_offers");
  });

  it("aceita apenas os DOIS status desta fase", async () => {
    await expect(insertRequest({ status: "cancelled" })).resolves.toBeTruthy();

    // Estado sem writer não existe: `selected` e `completed` entram nas fases
    // 4.4/4.5, com migration própria.
    for (const status of ["selected", "completed", "receiving", "qualquer"]) {
      await expect(insertRequest({ status })).rejects.toThrow(/sale_requests_status_check/);
    }
  });

  it("CHECK de ano recusa fora da faixa", async () => {
    await expect(insertRequest({ year: 1949 })).rejects.toThrow(/sale_requests_year_check/);
    await expect(insertRequest({ year: 2101 })).rejects.toThrow(/sale_requests_year_check/);
    await expect(insertRequest({ year: 1950 })).resolves.toBeTruthy();
  });

  it("CHECK de quilometragem aceita zero e recusa negativo", async () => {
    await expect(insertRequest({ mileage: 0 })).resolves.toBeTruthy();
    await expect(insertRequest({ mileage: -1 })).rejects.toThrow(/sale_requests_mileage_check/);
  });

  it("CHECK de condição recusa valor fora do vocabulário", async () => {
    for (const condition of ["excelente", "bom", "regular", "precisa_reparos"]) {
      await expect(insertRequest({ declared_condition: condition })).resolves.toBeTruthy();
    }
    await expect(insertRequest({ declared_condition: "ótimo" })).rejects.toThrow(
      /declared_condition_check/
    );
  });

  it("CHECK de valor FIPE aceita NULL mas recusa zero e negativo", async () => {
    // NULL = "não resolvida". Zero seria "resolvida como nada" — dado errado
    // disfarçado de dado.
    await expect(insertRequest({ fipe_reference_value: null })).resolves.toBeTruthy();
    await expect(insertRequest({ fipe_reference_value: "1.00" })).resolves.toBeTruthy();
    await expect(insertRequest({ fipe_reference_value: "0.00" })).rejects.toThrow(
      /fipe_reference_value_check/
    );
    await expect(insertRequest({ fipe_reference_value: "-1.00" })).rejects.toThrow(
      /fipe_reference_value_check/
    );
  });

  it("FK do dono existe e faz CASCADE", async () => {
    await expect(insertRequest({ owner_user_id: 999999 })).rejects.toThrow(
      /violates foreign key constraint/
    );

    await insertRequest();
    await pool.query(`DELETE FROM users WHERE id = $1`, [world.ownerId]);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM sale_requests`);
    expect(rows[0].n).toBe(0);
  });

  it("FK da cidade existe e RECUSA a remoção do catálogo", async () => {
    await expect(insertRequest({ city_id: 999999 })).rejects.toThrow(
      /violates foreign key constraint/
    );

    await insertRequest();

    // Sem ON DELETE: apagar cidade em uso é recusado pelo banco. CASCADE
    // destruiria solicitações de gente real por uma limpeza de catálogo.
    await expect(pool.query(`DELETE FROM cities WHERE id = $1`, [world.cityId])).rejects.toThrow(
      /violates foreign key constraint/
    );
  });

  it("os dois índices previstos existem, e o da cidade é PARCIAL", async () => {
    const { rows } = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'sale_requests'`
    );
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));

    expect(byName.has("sale_requests_owner_created_idx")).toBe(true);
    expect(byName.has("sale_requests_city_open_idx")).toBe(true);
    // Parcial: solicitação cancelada nunca aparece para lojista, então não
    // precisa ocupar o índice que a Fase 4.2 vai usar.
    expect(byName.get("sale_requests_city_open_idx")).toMatch(/WHERE \(?status = 'receiving_offers'/);
  });
});

describe.sequential("migration 053 — sale_request_images", () => {
  it("a tabela existe SEM image_url e SEM is_cover", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_request_images'`
    );
    const names = new Set(rows.map((row) => row.column_name));

    expect(names.has("storage_key")).toBe(true);
    expect(names.has("sort_order")).toBe(true);

    // Um fato, uma coluna: a URL é derivada e a capa é sort_order 0.
    expect(names.has("image_url")).toBe(false);
    expect(names.has("is_cover")).toBe(false);
  });

  it("storage_key é UNIQUE GLOBAL — não apenas por solicitação", async () => {
    const a = await insertRequest();
    const b = await insertRequest();
    const key = "sale-requests/1/sess/2026/08/uuid-0.webp";

    await pool.query(
      `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,0)`,
      [a.id, key]
    );

    // A MESMA chave numa OUTRA solicitação precisa falhar. Com um UNIQUE
    // composto (sale_request_id, storage_key) isto passaria — e o mesmo objeto
    // do R2 pertenceria a duas solicitações, possivelmente de donos diferentes.
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,0)`,
        [b.id, key]
      )
    ).rejects.toThrow(/sale_request_images_storage_key_key/);
  });

  it("CASCADE apaga a galeria junto com a solicitação", async () => {
    const request = await insertRequest();
    for (let i = 0; i < 4; i += 1) {
      await pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,$3)`,
        [request.id, `sale-requests/1/sess/2026/08/uuid-${i}.webp`, i]
      );
    }

    await pool.query(`DELETE FROM sale_requests WHERE id = $1`, [request.id]);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM sale_request_images`);
    expect(rows[0].n).toBe(0);
  });

  it("CHECK recusa sort_order negativo", async () => {
    const request = await insertRequest();
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,-1)`,
        [request.id, "sale-requests/1/sess/2026/08/neg.webp"]
      )
    ).rejects.toThrow(/sort_order_check/);
  });

  it("FK recusa solicitação inexistente", async () => {
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES (999999,'k',0)`
      )
    ).rejects.toThrow(/violates foreign key constraint/);
  });
});

describe.sequential("isolamento — o Produto 2 não toca o Produto 1 nem os anúncios", () => {
  it("nenhuma coluna nova apareceu em ads, users ou advertisers", async () => {
    // A Fase 4.1 não podia alterar essas tabelas (§40 da especificação). Se
    // alguém adicionar `ALTER TABLE ads` numa migration da fase, este teste cai.
    for (const [table, forbidden] of [
      ["ads", ["sale_request_id", "plate"]],
      ["users", ["sale_request_count"]],
      ["advertisers", ["sale_request_id"]],
    ]) {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const names = new Set(rows.map((row) => row.column_name));
      for (const column of forbidden) {
        expect(names.has(column), `${table}.${column} não deveria existir`).toBe(false);
      }
    }
  });

  it("o CHECK de ads.status continua com os 6 valores canônicos", async () => {
    // Reutilizar `ads` foi rejeitado justamente para não mexer aqui.
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'ads_status_check'`
    );
    expect(rows).toHaveLength(1);
    for (const status of ["active", "pending_review", "paused", "rejected", "blocked", "deleted"]) {
      expect(rows[0].def).toContain(status);
    }
    expect(rows[0].def).not.toContain("sale_request");
  });

  /**
   * O domínio tem EXATAMENTE as tabelas que as fases entregues criaram.
   *
   * A asserção é de igualdade de conjunto, e não uma lista de proibições, porque
   * a pergunta que ela responde é "alguém criou tabela de fase futura sem
   * caminho de escrita?" — o erro que as migrations 030 e 052 documentam. Uma
   * `sale_request_appointments`, `sale_request_payments` ou
   * `sale_request_final_offers` aparecendo aqui é exatamente o que este teste
   * existe para pegar.
   *
   * A lista cresceu com as fases que de fato entregaram writer:
   *
   *   4.1  `sale_requests`, `sale_request_images`;
   *   4.3  `sale_request_offers` — o histórico append-only de lances
   *        (migration 055). A asserção não foi atualizada naquela fase e este
   *        teste ficou vermelho desde então;
   *   4.4  `sale_request_offer_selections` — a trilha da escolha preliminar
   *        (migration 057).
   *
   * Continua NÃO existindo — e a igualdade acima é o que garante: agendamento,
   * inspeção, laudo, proposta final, aceite, venda concluída, pagamento,
   * comissão, escrow e prazo. Nenhum deles tem endpoint que os escreva.
   */
  it("o domínio tem exatamente as tabelas das fases entregues — nenhuma de fase futura", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'sale_request%'`
    );
    const names = new Set(rows.map((row) => row.table_name));

    expect(names).toEqual(
      new Set([
        "sale_requests",
        "sale_request_images",
        "sale_request_offers",
        "sale_request_offer_selections",
      ])
    );
  });
});

/**
 * MIGRATION 054 — ficha de avaliação, contra PostgreSQL de verdade.
 *
 * Os CHECKs desta migration são de duas classes, e as duas só podem ser
 * exercitadas por um banco:
 *
 *   ALLOWLIST — recusa vocabulário inventado por qualquer caminho que não passe
 *   pelos validadores (script de manutenção, SQL manual, módulo futuro).
 *
 *   COERÊNCIA CRUZADA — torna inexprimíveis os estados contraditórios. Um saldo
 *   devedor numa linha que declara "não tem financiamento" é um dado que
 *   ninguém sabe interpretar depois; é mais barato o banco recusá-lo do que uma
 *   fase futura ter de adivinhar qual das duas informações era a verdadeira.
 *
 * O fake-db não imita CHECK constraint nenhum. Um CHECK escrito errado passa
 * pela suíte unitária inteira e só aparece no primeiro INSERT que ele deveria
 * ter recusado — em produção.
 */
describe("migration 054 — ficha de avaliação", () => {
  /** INSERT com as colunas da ficha. Só as passadas em `fields` vão na query. */
  async function insertWithEvaluation(fields = {}) {
    const base = {
      owner_user_id: world.ownerId,
      city_id: world.cityId,
      brand: "Volkswagen",
      brand_slug: "volkswagen",
      model: "T-Cross",
      model_slug: "t-cross",
      fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
      year: 2020,
      mileage: 45000,
      transmission: "automatico",
      fuel_type: "flex",
      declared_condition: "bom",
      ...fields,
    };

    const columns = Object.keys(base);
    const values = columns.map((column) => base[column]);
    const placeholders = columns.map((_, index) => {
      // `body_paint_issues` viaja como TEXTO com cast — igual ao repositório.
      return columns[index] === "body_paint_issues" ? `$${index + 1}::jsonb` : `$${index + 1}`;
    });

    const { rows } = await pool.query(
      `INSERT INTO sale_requests (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING id`,
      values
    );
    return rows[0];
  }

  it("todas as colunas novas existem e são NULLABLE", async () => {
    // Nullable NÃO é frouxidão: é o que preserva a diferença entre "a versão
    // anterior do formulário não perguntou" (NULL) e "a pessoa respondeu que
    // não sabe" ('unknown'). Um DEFAULT aqui fundiria as duas para sempre.
    const expected = [
      "tire_condition",
      "financing_status",
      "financing_balance",
      "fines_status",
      "fines_amount",
      "ipva_status",
      "ipva_amount_due",
      "licensing_status",
      "caution_report_status",
      "auction_history",
      "collision_history",
      "engine_condition",
      "engine_notes",
      "gearbox_condition",
      "gearbox_notes",
      "suspension_condition",
      "suspension_notes",
      "body_paint_status",
      "body_paint_issues",
      "body_paint_notes",
    ];

    const { rows } = await pool.query(
      `SELECT column_name, is_nullable, column_default, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'
         AND column_name = ANY($1::text[])`,
      [expected]
    );

    expect(rows).toHaveLength(expected.length);
    for (const row of rows) {
      expect(row.is_nullable, `${row.column_name} deveria ser nullable`).toBe("YES");
      expect(row.column_default, `${row.column_name} não deveria ter default`).toBeNull();
    }
  });

  it("os valores monetários são NUMERIC(14,2), a convenção do projeto", async () => {
    // Nunca float: dinheiro em ponto flutuante binário acumula erro de
    // arredondamento na primeira soma.
    const { rows } = await pool.query(
      `SELECT column_name, data_type, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'
         AND column_name IN ('financing_balance', 'fines_amount', 'ipva_amount_due')`
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.data_type).toBe("numeric");
      expect(row.numeric_precision).toBe(14);
      expect(row.numeric_scale).toBe(2);
    }
  });

  it("a linha LEGADA (sem nenhuma coluna da ficha) continua sendo aceita", async () => {
    // É o cenário de todo registro que já existe em produção. Se esta inserção
    // falhasse, a migration teria quebrado dados de gente real.
    const row = await insertWithEvaluation();
    const { rows } = await pool.query(
      `SELECT tire_condition, financing_status, body_paint_issues FROM sale_requests WHERE id = $1`,
      [row.id]
    );

    expect(rows[0].tire_condition).toBeNull();
    expect(rows[0].financing_status).toBeNull();
    // NULL, e não `[]`: a lista vazia significaria "respondeu que não há
    // detalhe", que é uma declaração que ninguém fez nesta linha.
    expect(rows[0].body_paint_issues).toBeNull();
  });

  it("allowlist de pneus", async () => {
    for (const value of ["new", "good", "half_life", "replace_soon", "replace_now", "unknown"]) {
      await expect(insertWithEvaluation({ tire_condition: value })).resolves.toBeTruthy();
    }
    await expect(insertWithEvaluation({ tire_condition: "otimo" })).rejects.toThrow(
      /sale_requests_tire_condition_check/
    );
  });

  it("allowlists de três estados recusam boolean e texto livre", async () => {
    for (const column of ["financing_status", "fines_status", "auction_history", "collision_history"]) {
      for (const value of ["yes", "no", "unknown"]) {
        await expect(insertWithEvaluation({ [column]: value })).resolves.toBeTruthy();
      }
      await expect(insertWithEvaluation({ [column]: "true" })).rejects.toThrow(
        new RegExp(`sale_requests_${column}_check`)
      );
    }
  });

  it("allowlist de IPVA e licenciamento", async () => {
    for (const value of ["paid", "installments", "open", "unknown"]) {
      await expect(insertWithEvaluation({ ipva_status: value })).resolves.toBeTruthy();
    }
    await expect(insertWithEvaluation({ ipva_status: "atrasado" })).rejects.toThrow(
      /sale_requests_ipva_status_check/
    );

    for (const value of ["ok", "pending", "unknown"]) {
      await expect(insertWithEvaluation({ licensing_status: value })).resolves.toBeTruthy();
    }
    await expect(insertWithEvaluation({ licensing_status: "vencido" })).rejects.toThrow(
      /sale_requests_licensing_status_check/
    );
  });

  it("laudo cautelar: UM campo, e o estado impossível não existe", async () => {
    for (const value of [
      "not_available",
      "approved",
      "approved_with_notes",
      "rejected",
      "unknown",
    ]) {
      await expect(insertWithEvaluation({ caution_report_status: value })).resolves.toBeTruthy();
    }
    await expect(insertWithEvaluation({ caution_report_status: "pendente" })).rejects.toThrow(
      /sale_requests_caution_report_status_check/
    );

    // Não existe coluna separada de resultado — é o que torna
    // "não possui laudo + aprovado" inexprimível em vez de apenas proibido.
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'
         AND column_name LIKE 'caution%'`
    );
    expect(rows.map((row) => row.column_name)).toEqual(["caution_report_status"]);
  });

  it("COERÊNCIA: valor monetário exige a resposta que o justifica", async () => {
    await expect(
      insertWithEvaluation({ financing_status: "yes", financing_balance: "18500.00" })
    ).resolves.toBeTruthy();

    await expect(
      insertWithEvaluation({ financing_status: "no", financing_balance: "18500.00" })
    ).rejects.toThrow(/sale_requests_financing_balance_coherence/);

    await expect(
      insertWithEvaluation({ fines_status: "unknown", fines_amount: "10.00" })
    ).rejects.toThrow(/sale_requests_fines_amount_coherence/);

    for (const status of ["installments", "open"]) {
      await expect(
        insertWithEvaluation({ ipva_status: status, ipva_amount_due: "450.00" })
      ).resolves.toBeTruthy();
    }
    await expect(
      insertWithEvaluation({ ipva_status: "paid", ipva_amount_due: "450.00" })
    ).rejects.toThrow(/sale_requests_ipva_amount_coherence/);
  });

  it("COERÊNCIA: descrição mecânica exige 'issue'", async () => {
    for (const part of ["engine", "gearbox", "suspension"]) {
      await expect(
        insertWithEvaluation({ [`${part}_condition`]: "issue", [`${part}_notes`]: "barulho" })
      ).resolves.toBeTruthy();

      await expect(
        insertWithEvaluation({ [`${part}_condition`]: "ok", [`${part}_notes`]: "barulho" })
      ).rejects.toThrow(new RegExp(`sale_requests_${part}_notes_coherence`));
    }
  });

  it("COERÊNCIA: lataria é bicondicional", async () => {
    // "é issues" tem de ser EXATAMENTE "tem ao menos um detalhe". As duas
    // contradições possíveis caem no mesmo CHECK.
    await expect(
      insertWithEvaluation({
        body_paint_status: "issues",
        body_paint_issues: JSON.stringify(["scratches"]),
      })
    ).resolves.toBeTruthy();

    await expect(
      insertWithEvaluation({ body_paint_status: "none", body_paint_issues: JSON.stringify([]) })
    ).resolves.toBeTruthy();

    await expect(
      insertWithEvaluation({ body_paint_status: "issues", body_paint_issues: JSON.stringify([]) })
    ).rejects.toThrow(/sale_requests_body_paint_coherence/);

    await expect(
      insertWithEvaluation({
        body_paint_status: "none",
        body_paint_issues: JSON.stringify(["scratches"]),
      })
    ).rejects.toThrow(/sale_requests_body_paint_coherence/);
  });

  it("body_paint_issues só aceita ARRAY", async () => {
    // JSONB aceita objeto, número e string. Sem este CHECK,
    // `'"riscos"'::jsonb` entraria e `jsonb_array_length` explodiria na LEITURA
    // — longe de onde o dado errado entrou.
    //
    // Estado 'issues' de propósito: com ele a bicondicional PASSA (o escalar
    // conta como "tem detalhe"), então quem recusa é um dos dois CHECKs de
    // `body_paint_issues`. Com 'none' quem falharia primeiro seria a coerência,
    // e o teste não estaria exercitando o que diz exercitar.
    //
    // `'"riscos"'` viola OS DOIS (não é array E não está na allowlist), e o
    // PostgreSQL reporta o que avaliar primeiro. O teste aceita qualquer um dos
    // dois nomes em vez de fixar uma ordem que a documentação não promete — a
    // garantia que importa (ser violação, e não erro de tipo) é provada pelo
    // teste de SQLSTATE logo abaixo.
    await expect(
      insertWithEvaluation({ body_paint_status: "issues", body_paint_issues: '"riscos"' })
    ).rejects.toThrow(/sale_requests_body_paint_issues_(array|allowed)_check/);
  });

  it("valor não-array vira VIOLAÇÃO DE CONSTRAINT, nunca erro de tipo", async () => {
    // Regressão do defeito encontrado no release gate: a coerência usava
    // `jsonb_array_length`, que LANÇA em não-array. Como o PostgreSQL não
    // promete ordem entre CHECKs, um escalar podia morrer como erro de tipo
    // (22023) em vez de violação (23514) — e quem trata 23514 para virar
    // mensagem de campo devolveria 500 no lugar de 400.
    for (const [status, value] of [
      ["none", '"riscos"'],
      ["unknown", '{"a":1}'],
      ["issues", '"riscos"'],
      ["issues", '{"a":1}'],
    ]) {
      let code = null;
      try {
        await insertWithEvaluation({ body_paint_status: status, body_paint_issues: value });
      } catch (error) {
        code = error.code;
      }
      expect(code, `${status} + ${value} deveria violar constraint`).toBe("23514");
    }
  });

  /**
   * ALLOWLIST DOS ELEMENTOS — o banco, não só o validador.
   *
   * `validateBodyPaint` já recusa elemento inventado, mas ele só protege o
   * caminho HTTP. Antes deste CHECK, `body_paint_issues` era a única coluna de
   * vocabulário fechado da tabela cuja allowlist vivia apenas na aplicação:
   * um script de manutenção, uma correção manual em psql ou um módulo futuro
   * gravavam `["banana"]` sem nenhum obstáculo.
   *
   * Todas as outras colunas da ficha têm o CHECK escalar equivalente. Esta era
   * a exceção, e exceção em allowlist é por onde o dado ruim entra.
   */
  describe("allowlist dos ELEMENTOS de body_paint_issues", () => {
    /** Insere com estado coerente, para isolar a allowlist da bicondicional. */
    const withIssues = (issues) =>
      insertWithEvaluation({
        body_paint_status: "issues",
        body_paint_issues: typeof issues === "string" ? issues : JSON.stringify(issues),
      });

    it("aceita um elemento do catálogo", async () => {
      await expect(withIssues(["scratches"])).resolves.toBeTruthy();
    });

    it("aceita vários elementos do catálogo", async () => {
      await expect(withIssues(["scratches", "dents"])).resolves.toBeTruthy();
    });

    it("aceita o catálogo INTEIRO", async () => {
      await expect(
        withIssues(["scratches", "dents", "worn_paint", "repainted_parts", "collision_repair"])
      ).resolves.toBeTruthy();
    });

    it("RECUSA elemento inventado", async () => {
      await expect(withIssues(["banana"])).rejects.toThrow(
        /sale_requests_body_paint_issues_allowed_check/
      );
    });

    it("RECUSA elemento inventado MISTURADO com válidos", async () => {
      // Um elemento fora já basta: `<@` exige que TODOS estejam contidos.
      // É o caso que um filtro ingênuo (ex.: "o primeiro elemento é válido")
      // deixaria passar.
      await expect(withIssues(["scratches", "banana"])).rejects.toThrow(
        /sale_requests_body_paint_issues_allowed_check/
      );
    });

    it("RECUSA número no lugar do rótulo", async () => {
      await expect(withIssues([1, 2])).rejects.toThrow(
        /sale_requests_body_paint_issues_allowed_check/
      );
    });

    it("RECUSA objeto JSON", async () => {
      // Também viola os dois CHECKs — ver a nota do teste de ARRAY acima.
      await expect(withIssues('{"scratches": true}')).rejects.toThrow(
        /sale_requests_body_paint_issues_(array|allowed)_check/
      );
    });

    it("RECUSA string JSON", async () => {
      // Cuidado com a regra de contenção do `<@`: um ESCALAR é considerado
      // contido num array quando aparece como elemento, então
      // `'"scratches"'::jsonb <@ '[...]'::jsonb` é VERDADEIRO e a allowlist
      // sozinha deixaria passar. Quem recusa é o CHECK de `jsonb_typeof`.
      // Este teste existe para provar que a dupla cobre o caso — remover
      // qualquer um dos dois CHECKs o faria falhar.
      await expect(withIssues('"scratches"')).rejects.toThrow(
        /sale_requests_body_paint_issues_array_check/
      );
    });

    it("preserva a lista VAZIA de none/unknown", async () => {
      for (const status of ["none", "unknown"]) {
        await expect(
          insertWithEvaluation({ body_paint_status: status, body_paint_issues: "[]" })
        ).resolves.toBeTruthy();
      }
    });

    it("preserva NULL da linha legada", async () => {
      await expect(insertWithEvaluation()).resolves.toBeTruthy();
    });

    it("a allowlist do banco casa EXATAMENTE com a da aplicação", async () => {
      // Uma allowlist mais larga no banco deixaria passar o que a aplicação
      // recusa (dado inalcançável pela tela, mas gravável por script); mais
      // estreita derrubaria uma publicação legítima com erro de constraint em
      // vez de mensagem de campo. As duas pontas têm de ser a MESMA lista.
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'sale_requests_body_paint_issues_allowed_check'`
      );
      expect(rows).toHaveLength(1);

      for (const value of BODY_PAINT_ISSUES) {
        expect(rows[0].def, `${value} ausente no CHECK`).toContain(value);
      }
    });
  });

  it("o índice GIN de body_paint_issues existe", async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'sale_requests' AND indexname = 'sale_requests_body_paint_issues_gin'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("gin");
  });

  it("as constraints das migrations 052/053 continuam intactas", async () => {
    // A 054 é ADITIVA. Se ela tivesse recriado a tabela ou mexido num CHECK
    // antigo, este teste seria o que perceberia.
    const { rows } = await pool.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'sale_requests'::regclass AND contype = 'c'`
    );
    const names = new Set(rows.map((row) => row.conname));

    for (const original of [
      "sale_requests_status_check",
      "sale_requests_declared_condition_check",
      "sale_requests_year_check",
      "sale_requests_mileage_check",
      "sale_requests_fipe_reference_value_check",
    ]) {
      expect(names.has(original), `${original} sumiu`).toBe(true);
    }
  });

  it("continua sem placa e sem nenhuma coluna de dado pessoal", async () => {
    // A ficha cresceu vinte colunas e NENHUMA delas é sobre a pessoa. O
    // produto avalia o CARRO.
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'`
    );
    const names = new Set(rows.map((row) => row.column_name));

    for (const forbidden of [
      "plate",
      "placa",
      "renavam",
      "chassi",
      "vin",
      "document_number",
      "cpf",
      "phone",
      "whatsapp",
      "address",
      "bank",
      "bank_account",
    ]) {
      expect(names.has(forbidden), `${forbidden} não deveria existir`).toBe(false);
    }
  });
});
