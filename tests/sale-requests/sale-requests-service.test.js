// Regras do domínio de solicitações de venda, contra o fake-db.
//
// O que este arquivo prova: autorização por tipo de conta, fail-closed de
// cidade, o teto de solicitações abertas, a ausência de PII no DTO, o IDOR de
// leitura/cancelamento e o comportamento do snapshot FIPE.
//
// O que ele NÃO prova, e nem tenta: serialização sob concorrência. O fake tem
// uma "conexão" só e um array de estado — dois cliques simultâneos nunca
// disputam nada aqui. O teto de 3 sob corrida real tem teste próprio em
// tests/integration/sale-requests-concurrency.integration.test.js.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";

/** SQL emitido, na ordem. Alimenta a prova de ALCANCE do lock. */
const queryCalls = [];

function record(sql, params) {
  queryCalls.push(String(sql).replace(/\s+/g, " ").trim());
  return fakeQuery(sql, params);
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => record(sql, params),
  pool: { query: (sql, params) => record(sql, params) },
  // Mesma semântica de `fakeWithTransaction`, mas com o executor que REGISTRA:
  // sem isso as queries de dentro da transação (lock, contagem, INSERTs) não
  // apareceriam em `queryCalls` e a prova de alcance do lock seria vazia.
  withTransaction: (callback) => callback({ query: (sql, params) => record(sql, params) }),
  default: { query: (sql, params) => record(sql, params) },
}));

const service = await import("../../src/modules/sale-requests/sale-requests.service.js");
const { SALE_REQUEST_ACTIVE_LIMIT } = await import(
  "../../src/modules/sale-requests/sale-requests.constants.js"
);

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };

const OWNER = { id: "7", account_type: "CPF" };
const PENDING = { id: "8", account_type: "pending" };
const DEALER = { id: "9", account_type: "CNPJ" };

function keysFor(count, owner = OWNER.id, session = "sess") {
  return Array.from(
    { length: count },
    (_, index) => `sale-requests/${owner}/${session}/2026/08/uuid-${index}.webp`
  );
}

function bodyFor(overrides = {}, owner = OWNER.id) {
  return {
    city_id: ATIBAIA.id,
    brand: "VW - VolksWagen",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2020",
    mileage: "45000",
    transmission: "Automático",
    fuel_type: "Flex",
    declared_condition: "bom",
    known_issues: null,
    images: keysFor(4, owner),
    ...overrides,
  };
}

/** Solicitação já persistida, sem passar pelo service. */
function seedRequest(overrides = {}) {
  const id = db.nextRequestId;
  db.nextRequestId += 1;
  const createdAt = new Date(NOW - id * 1000).toISOString();

  db.saleRequests.push({
    id,
    owner_user_id: OWNER.id,
    city_id: ATIBAIA.id,
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
    status: "receiving_offers",
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  });

  return id;
}

/** Snapshot FIPE de alta confiança — o único que vira valor gravado. */
function fipeHigh() {
  return vi.fn().mockResolvedValue({
    ok: true,
    value: 92450,
    fipe_code: "005340-6",
    fipe_source: "parallelum",
    fipe_snapshot_at: "2026-08-16T12:00:00.000Z",
    confidence: "high",
    failure_reason: null,
    used_client_hint: false,
  });
}

/** Sem FIPE: qualquer coisa que não seja `ok` + `high`. */
function fipeNone(extra = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    value: null,
    fipe_code: null,
    fipe_source: null,
    fipe_snapshot_at: "2026-08-16T12:00:00.000Z",
    confidence: "none",
    failure_reason: "no_codes_no_hint",
    used_client_hint: false,
    ...extra,
  });
}

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    users: [{ id: OWNER.id }, { id: PENDING.id }, { id: DEALER.id }],
  });
  fakeClock.now = () => NOW;
});

describe("quem pode publicar", () => {
  it("conta CPF publica", async () => {
    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });
    expect(result.sale_request.id).toBeDefined();
    expect(result.sale_request.status).toBe("receiving_offers");
  });

  it("conta pending publica", async () => {
    // Exigir CPF verificado adicionaria atrito num cadastro que hoje não pede
    // documento — e o produto precisa de vendedores.
    const result = await service.createSaleRequest(PENDING, bodyFor({}, PENDING.id), {
      resolveFipeReference: fipeNone(),
    });
    expect(result.sale_request.id).toBeDefined();
  });

  it("conta CNPJ recebe 403 com código próprio", async () => {
    await expect(
      service.createSaleRequest(DEALER, bodyFor({}, DEALER.id), {
        resolveFipeReference: fipeNone(),
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      details: { code: "SALE_REQUEST_OWNER_ONLY" },
    });
  });

  it("sessão sem id é 401", async () => {
    await expect(
      service.createSaleRequest({ id: "", account_type: "CPF" }, bodyFor(), {
        resolveFipeReference: fipeNone(),
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("id zero é recusado antes de virar violação de FK", async () => {
    await expect(
      service.createSaleRequest({ id: "0", account_type: "CPF" }, bodyFor(), {
        resolveFipeReference: fipeNone(),
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("cidade — fail closed, sem fallback", () => {
  it("cidade inexistente é 400 e nada é persistido", async () => {
    await expect(
      service.createSaleRequest(OWNER, bodyFor({ city_id: 999 }), {
        resolveFipeReference: fipeNone(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(db.saleRequests).toHaveLength(0);
  });

  it("a cidade gravada é a ESCOLHIDA, nunca inferida", async () => {
    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });
    expect(result.sale_request.city).toEqual({
      name: "Atibaia",
      state: "SP",
      slug: "atibaia-sp",
    });
  });
});

describe("teto de solicitações abertas", () => {
  it("permite publicar com zero abertas", async () => {
    await service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() });
    expect(db.saleRequests).toHaveLength(1);
  });

  it(`recusa a partir de ${SALE_REQUEST_ACTIVE_LIMIT} abertas, com 409 e código próprio`, async () => {
    for (let i = 0; i < SALE_REQUEST_ACTIVE_LIMIT; i += 1) seedRequest();

    await expect(
      service.createSaleRequest(OWNER, bodyFor({ images: keysFor(4, OWNER.id, "outra") }), {
        resolveFipeReference: fipeNone(),
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { code: "SALE_REQUEST_ACTIVE_LIMIT_REACHED" },
    });

    expect(db.saleRequests).toHaveLength(SALE_REQUEST_ACTIVE_LIMIT);
  });

  it("solicitação CANCELADA não ocupa vaga", async () => {
    // Quem cancelou e quer republicar não pode ficar preso pelo próprio
    // histórico.
    for (let i = 0; i < SALE_REQUEST_ACTIVE_LIMIT; i += 1) {
      seedRequest({ status: "cancelled" });
    }

    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });
    expect(result.sale_request.id).toBeDefined();
  });

  it("o teto é POR USUÁRIO — as de outra pessoa não contam", async () => {
    for (let i = 0; i < SALE_REQUEST_ACTIVE_LIMIT; i += 1) {
      seedRequest({ owner_user_id: "999" });
    }

    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });
    expect(result.sale_request.id).toBeDefined();
  });

  it("a conta é travada ANTES da contagem e do INSERT", async () => {
    // ALCANCE, não serialização. O fake não isola nada, mas pode provar que o
    // service EMITIU o `FOR UPDATE` na conta certa e o emitiu primeiro. Sem esse
    // pedido, a corrida real não teria ponto de serialização nenhum — e o teste
    // de integração falharia longe daqui, com "4 solicitações onde o teto é 3".
    queryCalls.length = 0;

    await service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() });

    const lockAt = queryCalls.findIndex((sql) =>
      /^SELECT id FROM users WHERE id = \$1 FOR UPDATE$/i.test(sql)
    );
    const countAt = queryCalls.findIndex((sql) =>
      /COUNT\(\*\)::int AS total FROM sale_requests/i.test(sql)
    );
    const insertAt = queryCalls.findIndex((sql) => /^INSERT INTO sale_requests/i.test(sql));

    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(countAt);
    expect(countAt).toBeLessThan(insertAt);
  });

  it("a chamada externa da FIPE acontece FORA da transação", async () => {
    // Dentro dela, a latência de um provedor de terceiros viraria tempo de lock
    // na linha do usuário.
    queryCalls.length = 0;
    let lockedWhenFipeRan = null;

    const resolve = vi.fn().mockImplementation(async () => {
      lockedWhenFipeRan = queryCalls.some((sql) => /FOR UPDATE/i.test(sql));
      return { ok: false, confidence: "none", fipe_snapshot_at: "2026-08-16T12:00:00.000Z" };
    });

    await service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: resolve });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(lockedWhenFipeRan).toBe(false);
  });

  it("usuário inexistente no banco é 401, não 500", async () => {
    db.users = [];
    await expect(
      service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("FIPE — o servidor é a autoridade", () => {
  it("grava o snapshot quando a confiança é alta", async () => {
    const resolve = fipeHigh();
    const result = await service.createSaleRequest(
      OWNER,
      bodyFor({ fipe_brand_code: "59", fipe_model_code: "5940", fipe_year_code: "2020-1" }),
      { resolveFipeReference: resolve }
    );

    expect(result.sale_request.fipe_reference_value).toBe("92450.00");
    expect(result.sale_request.fipe_code).toBe("005340-6");
    expect(result.sale_request.fipe_reference_at).toBeInstanceOf(Date);
  });

  it("NUNCA repassa o valor enviado pelo cliente como hint", async () => {
    const resolve = fipeHigh();
    await service.createSaleRequest(
      OWNER,
      bodyFor({ fipe_value: 999999, fipe_reference_value: 999999 }),
      { resolveFipeReference: resolve }
    );

    // Se `client_hint_value` fosse repassado, um vendedor poderia publicar uma
    // referência fabricada com aparência de valor oficial.
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0][0]).not.toHaveProperty("client_hint_value");
  });

  it("grava NULL quando a confiança não é alta", async () => {
    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });

    expect(result.sale_request.fipe_reference_value).toBeNull();
    expect(result.sale_request.fipe_code).toBeNull();
    expect(result.sale_request.fipe_reference_at).toBeNull();
  });

  it("ignora snapshot ok com confiança baixa (client hint)", async () => {
    const resolve = vi.fn().mockResolvedValue({
      ok: true,
      value: 50000,
      fipe_code: "x",
      confidence: "low",
      fipe_snapshot_at: "2026-08-16T12:00:00.000Z",
    });

    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: resolve,
    });
    expect(result.sale_request.fipe_reference_value).toBeNull();
  });

  it("provedor fora do ar NÃO derruba a publicação", async () => {
    // FIPE é âncora, não requisito. Derrubar a publicação porque um provedor
    // externo caiu trocaria um problema pequeno por um grande.
    const resolve = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: resolve,
    });

    expect(result.sale_request.id).toBeDefined();
    expect(result.sale_request.fipe_reference_value).toBeNull();
  });
});

describe("fotos", () => {
  it("persiste a galeria na ordem, com a capa em sort_order 0", async () => {
    await service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() });

    expect(db.saleRequestImages).toHaveLength(4);
    expect(db.saleRequestImages.map((image) => image.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it("a URL é DERIVADA da storage_key — a tabela nunca guarda URL", async () => {
    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });

    expect(result.sale_request.images).toHaveLength(4);
    for (const url of result.sale_request.images) {
      expect(url).toContain("/api/vehicle-images?key=");
      expect(url).toContain("sale-requests");
    }
    // Nenhuma coluna de URL foi escrita.
    for (const image of db.saleRequestImages) {
      expect(image).not.toHaveProperty("image_url");
      expect(image).not.toHaveProperty("is_cover");
    }
  });

  it("chave já usada por outra solicitação derruba a criação", async () => {
    await service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() });

    // Mesmas chaves de novo: o UNIQUE global recusa.
    await expect(
      service.createSaleRequest(OWNER, bodyFor(), { resolveFipeReference: fipeNone() })
    ).rejects.toThrow();
  });
});

describe("DTO do dono — sem PII, sem coluna interna", () => {
  it("não devolve owner_user_id nem nada de users", async () => {
    const result = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });

    const serialized = JSON.stringify(result.sale_request);
    for (const forbidden of [
      "owner_user_id",
      "email",
      "phone",
      "whatsapp",
      "document_number",
      "document_type",
      "password",
      "token",
      "address",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("expõe exatamente o conjunto de campos previsto", async () => {
    const { sale_request: dto } = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeNone(),
    });

    expect(Object.keys(dto).sort()).toEqual(
      [
        "brand",
        "brand_slug",
        "city",
        "created_at",
        "declared_condition",
        "fipe_code",
        "fipe_model_description",
        "fipe_reference_at",
        "fipe_reference_value",
        "fuel_type",
        "id",
        "images",
        "known_issues",
        "mileage",
        "model",
        "model_slug",
        "status",
        "transmission",
        "updated_at",
        "year",
      ].sort()
    );
  });
});

describe("leitura — posse dentro da query", () => {
  it("o dono lê a própria solicitação", async () => {
    const id = seedRequest();
    const result = await service.getMySaleRequest(OWNER.id, String(id));
    expect(result.sale_request.id).toBe(id);
  });

  it("solicitação de OUTRO usuário é 404, nunca 403", async () => {
    // 403 confirmaria a existência da linha para quem está sondando ids.
    const id = seedRequest({ owner_user_id: "999" });
    await expect(service.getMySaleRequest(OWNER.id, String(id))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("id inexistente é 404", async () => {
    await expect(service.getMySaleRequest(OWNER.id, "4242")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("a listagem traz só as do dono, mais recentes primeiro", async () => {
    const a = seedRequest();
    const b = seedRequest();
    seedRequest({ owner_user_id: "999" });

    const result = await service.listMySaleRequests(OWNER.id, {});
    expect(result.sale_requests.map((row) => row.id)).toEqual([a, b]);
  });

  it("a listagem inclui canceladas (histórico do dono)", async () => {
    seedRequest({ status: "cancelled" });
    const result = await service.listMySaleRequests(OWNER.id, {});
    expect(result.sale_requests).toHaveLength(1);
    expect(result.sale_requests[0].status).toBe("cancelled");
  });

  it("pagina por cursor sem repetir nem pular", async () => {
    const ids = [seedRequest(), seedRequest(), seedRequest()];

    const first = await service.listMySaleRequests(OWNER.id, { limit: 2 });
    expect(first.sale_requests).toHaveLength(2);
    expect(first.next_cursor).toBeTruthy();

    const second = await service.listMySaleRequests(OWNER.id, {
      limit: 2,
      cursor: first.next_cursor,
    });

    const seen = [...first.sale_requests, ...second.sale_requests].map((row) => row.id);
    expect(new Set(seen).size).toBe(ids.length);
    expect(second.next_cursor).toBeNull();
  });
});

describe("cancelamento", () => {
  it("é soft: muda status e mantém a linha", async () => {
    const id = seedRequest();
    const result = await service.cancelMySaleRequest(OWNER.id, String(id));

    expect(result.sale_request.status).toBe("cancelled");
    expect(result.changed).toBe(true);
    expect(db.saleRequests).toHaveLength(1);
  });

  it("o retry é idempotente — 200 com o mesmo estado, sem erro", async () => {
    const id = seedRequest();
    await service.cancelMySaleRequest(OWNER.id, String(id));

    const retry = await service.cancelMySaleRequest(OWNER.id, String(id));
    expect(retry.sale_request.status).toBe("cancelled");
    // `changed: false` distingue os casos sem transformar um retry em erro.
    expect(retry.changed).toBe(false);
  });

  it("não cancela solicitação de outra pessoa — 404", async () => {
    const id = seedRequest({ owner_user_id: "999" });
    await expect(service.cancelMySaleRequest(OWNER.id, String(id))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.saleRequests[0].status).toBe("receiving_offers");
  });
});
