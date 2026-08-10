/**
 * Regressão da publicação: o fluxo de anúncio SEMPRE fornece cidade explícita.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE TESTE, E POR QUE ELE NÃO MOCKA O MEIO DO CAMINHO
 * ────────────────────────────────────────────────────────────────────────────
 * A Fase 0.1 tornou `resolveCityIdForNewAdvertiser` fail-closed: sem `cityId`
 * válido, ninguém cria anunciante. Isso só é seguro se o caminho legítimo de
 * publicação realmente passar a cidade — e "realmente" aqui não pode ser
 * verificado por leitura de código nem por um mock que responde o que o teste
 * quer ouvir.
 *
 * Por isso a cadeia roda de verdade:
 *
 *     ensurePublishEligibility
 *        → ensureAdvertiserForPublishing
 *           → ensureAdvertiserForUser
 *              → resolveCityIdForNewAdvertiser  (o guard novo)
 *                 → INSERT INTO advertisers
 *
 * Só o Postgres e a leitura de conta são substituídos. O teste afirma sobre o
 * SQL efetivamente emitido: qual cidade foi consultada e qual `city_id` entrou
 * no INSERT. Se alguém parar de propagar a cidade em qualquer elo dessa
 * corrente, isto fica vermelho — inclusive se o elo quebrado for silencioso.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Toda query emitida (pool + client da transação), na ordem. */
let executedQueries = [];
const EXISTING_CITY_ID = 42;

function record(sql, params) {
  executedQueries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
}

async function fakeQuery(sql, params) {
  record(sql, params);

  if (/FROM cities WHERE id = \$1/i.test(sql)) {
    const id = Number(params?.[0]);
    return { rows: id === EXISTING_CITY_ID ? [{ id }] : [] };
  }
  if (/information_schema\.columns/i.test(sql)) {
    // Colunas mínimas para o INSERT montar (inclui city_id, o que importa aqui).
    return {
      rows: [
        { column_name: "user_id" },
        { column_name: "city_id" },
        { column_name: "name" },
        { column_name: "slug" },
        { column_name: "email" },
        { column_name: "plan" },
        { column_name: "status" },
        { column_name: "verified" },
        { column_name: "city" },
      ],
    };
  }
  if (/SELECT id, user_id FROM advertisers/i.test(sql)) {
    return { rows: [] }; // ainda não existe → segue para criação
  }
  if (/INSERT INTO advertisers/i.test(sql)) {
    return { rows: [{ id: "adv-1", user_id: "u-1" }] };
  }
  if (/pg_advisory_xact_lock/i.test(sql)) {
    return { rows: [] };
  }
  if (/FROM users/i.test(sql)) {
    return { rows: [{ id: "u-1", city: "Atibaia - SP", name: "Fulano" }] };
  }
  return { rows: [] };
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn(fakeQuery) },
  withTransaction: vi.fn(async (cb) => cb({ query: fakeQuery, raw: {} })),
}));

vi.mock("../../src/modules/account/account.user.read.js", () => ({
  getAccountUser: vi.fn(async () => ({
    id: "u-1",
    name: "Loja Teste",
    email: "loja@test.local",
    type: "CNPJ",
    cnpj_verified: true,
    document_verified: true,
    raw_plan: "free",
  })),
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getAccountUser: vi.fn(async () => ({
    id: "u-1",
    name: "Loja Teste",
    email: "loja@test.local",
    type: "CNPJ",
    cnpj_verified: true,
    document_verified: true,
    raw_plan: "free",
  })),
  resolvePublishEligibility: vi.fn(async () => ({
    allowed: true,
    reason: "Limite disponivel no plano atual",
    suggested_plan_type: null,
  })),
}));

const { ensurePublishEligibility } = await import(
  "../../src/modules/ads/ads.publish.eligibility.service.js"
);

beforeEach(() => {
  executedQueries = [];
});

function find(pattern) {
  return executedQueries.filter((q) => pattern.test(q.sql));
}

describe("publicação — a cidade do anúncio chega intacta até o INSERT", () => {
  it("cria o anunciante com o city_id do anúncio", async () => {
    const result = await ensurePublishEligibility(
      { id: "u-1" },
      { cityId: EXISTING_CITY_ID, requestId: "req-1" }
    );

    expect(result.advertiserId).toBe("adv-1");

    // A cidade validada foi EXATAMENTE a do anúncio.
    const cityLookups = find(/FROM cities WHERE id = \$1/i);
    expect(cityLookups).toHaveLength(1);
    expect(Number(cityLookups[0].params[0])).toBe(EXISTING_CITY_ID);

    // E é ela que entra na linha nova.
    const inserts = find(/INSERT INTO advertisers/i);
    expect(inserts).toHaveLength(1);
    const cityIdColumnIndex = inserts[0].sql
      .match(/INSERT INTO advertisers \(([^)]+)\)/i)[1]
      .split(",")
      .map((c) => c.trim())
      .indexOf("city_id");
    expect(cityIdColumnIndex).toBeGreaterThanOrEqual(0);
    expect(Number(inserts[0].params[cityIdColumnIndex])).toBe(EXISTING_CITY_ID);
  });

  it("string numérica vinda do payload também funciona", async () => {
    await expect(
      ensurePublishEligibility({ id: "u-1" }, { cityId: String(EXISTING_CITY_ID) })
    ).resolves.toMatchObject({ advertiserId: "adv-1" });
  });

  it("nenhum fallback territorial é acionado no caminho feliz", async () => {
    await ensurePublishEligibility({ id: "u-1" }, { cityId: EXISTING_CITY_ID });

    const blob = executedQueries.map((q) => q.sql).join(" | ");
    expect(blob).not.toMatch(/ILIKE/i);
    expect(blob).not.toMatch(/ORDER BY id ASC/i);
  });
});

describe("publicação — sem cidade válida não nasce anunciante", () => {
  it("cidade ausente → 400 e nenhum INSERT", async () => {
    await expect(ensurePublishEligibility({ id: "u-1" }, {})).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(find(/INSERT INTO advertisers/i)).toHaveLength(0);
  });

  it("cidade inexistente → 400 e nenhum INSERT (não substitui por outra)", async () => {
    await expect(ensurePublishEligibility({ id: "u-1" }, { cityId: 999999 })).rejects.toMatchObject(
      { statusCode: 400 }
    );

    expect(find(/INSERT INTO advertisers/i)).toHaveLength(0);
    const blob = executedQueries.map((q) => q.sql).join(" | ");
    expect(blob).not.toMatch(/ORDER BY id ASC|ILIKE/i);
  });

  it("sessão sem id → 401 antes de qualquer escrita", async () => {
    await expect(ensurePublishEligibility({}, { cityId: EXISTING_CITY_ID })).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(find(/INSERT INTO advertisers/i)).toHaveLength(0);
  });
});

describe("ensure continua idempotente — recall não exige cidade de novo", () => {
  it("anunciante já existente é devolvido sem consultar cidade", async () => {
    const { ensureAdvertiserForUser } = await import(
      "../../src/modules/advertisers/advertiser.ensure.service.js"
    );
    const db = await import("../../src/infrastructure/database/db.js");

    // Desta vez a linha JÁ existe.
    db.withTransaction.mockImplementationOnce(async (cb) =>
      cb({
        query: async (sql, params) => {
          record(sql, params);
          if (/SELECT id, user_id FROM advertisers/i.test(sql)) {
            return { rows: [{ id: "adv-existente", user_id: "u-1" }] };
          }
          return fakeQuery(sql, params);
        },
        raw: {},
      })
    );

    const adv = await ensureAdvertiserForUser("u-1", { source: "test" });

    expect(adv.id).toBe("adv-existente");
    // O ponto: não exigiu cidade nem foi buscá-la — a linha já existe.
    expect(find(/FROM cities WHERE id = \$1/i)).toHaveLength(0);
    expect(find(/INSERT INTO advertisers/i)).toHaveLength(0);
  });
});
