// O PISO DO PROPRIETÁRIO — publicação, regra de aceitação e legado (Fase 4.3.3).
//
// Este arquivo cobre as duas pontas do campo `minimum_accepted_price`:
//
//   PUBLICAÇÃO — a pessoa física declara o valor mínimo que aceita. Obrigatório
//   em toda publicação nova, e NUNCA comparado com a FIPE pelo servidor: os 15%
//   recomendados são orientação da tela, não regra de backend.
//
//   PROPOSTA — enquanto não há proposta, o piso é a barreira e o operador é
//   `>=`; a partir da primeira proposta a barreira passa a ser a maior atual e o
//   operador vira `>`. As duas trocam de lugar exatamente uma vez na vida da
//   solicitação, e é essa troca que o arquivo prende.
//
// A publicação usa o SERVICE do dono; a proposta, o ROUTER do lojista. Os dois
// sobre o mesmo fake-db, para que o valor gravado num lado seja o mesmo lido no
// outro — um teste de service isolado provaria a regra sem provar que ela está
// no caminho da request.

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";
import { EVALUATION_BODY, EVALUATION_ROW } from "./evaluation-fixture.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (callback) => callback({ query: (sql, params) => fakeQuery(sql, params) }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  const handler = (req, res, next) => {
    const asUser = req.headers["x-test-user"];
    if (!asUser) return res.status(401).json({ error: "unauth" });
    req.user = {
      id: String(asUser),
      role: "user",
      plan: "free",
      account_type: String(req.headers["x-test-account"] || "CPF"),
    };
    return next();
  };
  return { authMiddleware: handler, default: handler };
});

const service = await import("../../src/modules/sale-requests/sale-requests.service.js");
const dealerRoutes = (
  await import("../../src/modules/sale-requests/sale-requests.dealer.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");
const { SALE_OPPORTUNITY_CODE } = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.constants.js"
);
const { SALE_REQUEST_DEALER_DISCOUNT, SALE_REQUEST_RECOMMENDED_RATIO } = await import(
  "../../src/modules/sale-requests/sale-requests.constants.js"
);

const BASE = "/api/account/opportunities/sale-requests";
const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };

const OWNER = { id: "7", account_type: "CPF" };
const DEALER_A = "20";
const DEALER_B = "21";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(BASE, dealerRoutes);
  app.use(errorHandler);
  return app;
}

function seedDealer(userId, id) {
  db.advertisers.push({
    id,
    user_id: userId,
    city_id: ATIBAIA.id,
    status: "active",
    name: `Loja ${id}`,
  });
  return id;
}

function bodyFor(overrides = {}) {
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
    minimum_accepted_price: "62500.00",
    ...EVALUATION_BODY,
    images: Array.from(
      { length: 4 },
      (_, index) => `sale-requests/${OWNER.id}/sess/2026/08/uuid-${index}.webp`
    ),
    ...overrides,
  };
}

/** Solicitação já persistida — o caminho para semear o caso LEGADO. */
function seedRequest(overrides = {}) {
  const id = db.nextRequestId;
  db.nextRequestId += 1;

  const row = {
    id,
    owner_user_id: OWNER.id,
    city_id: ATIBAIA.id,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: "005340-0",
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    minimum_accepted_price: "62500.00",
    ...EVALUATION_ROW,
    status: "receiving_offers",
    created_at: new Date(NOW - 60000).toISOString(),
    updated_at: new Date(NOW - 60000).toISOString(),
    ...overrides,
  };

  db.saleRequests.push(row);
  return row;
}

function offer(id, amount, { user = DEALER_A } = {}) {
  return request(buildApp())
    .post(`${BASE}/${id}/offers`)
    .set("x-test-user", user)
    .set("x-test-account", "CNPJ")
    .send({ amount });
}

/** Provedor FIPE de alta confiança — o único caso que vira coluna. */
function fipeHigh(value = 75000) {
  return vi.fn().mockResolvedValue({
    ok: true,
    value,
    fipe_code: "005340-6",
    fipe_source: "parallelum",
    fipe_snapshot_at: "2026-08-01T00:00:00.000Z",
    confidence: "high",
    failure_reason: null,
    used_client_hint: false,
  });
}

/** Provedor fora do ar: publicação segue, coluna FIPE fica NULL. */
function fipeDown() {
  return vi.fn().mockRejectedValue(new Error("ECONNRESET"));
}

function rowOf(created) {
  return db.saleRequests.find((item) => String(item.id) === String(created.sale_request.id));
}

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    users: [{ id: OWNER.id }, { id: DEALER_A }, { id: DEALER_B }],
    nextRequestId: 1,
    nextImageId: 1,
    nextOfferId: 1,
  });
  fakeClock.now = () => NOW;
  seedDealer(DEALER_A, 100);
  seedDealer(DEALER_B, 101);
});

// ============================================================================
describe("publicação — o piso é obrigatório e é do proprietário", () => {
  it("sem valor mínimo, a publicação é recusada com erro de campo", async () => {
    await expect(
      service.createSaleRequest(OWNER, bodyFor({ minimum_accepted_price: undefined }), {
        resolveFipeReference: fipeHigh(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    // E nada foi gravado: a recusa acontece ANTES de qualquer escrita.
    expect(db.saleRequests).toHaveLength(0);
  });

  it("zero é recusado — 'sem piso' não pode ser escrito como R$ 0,00", async () => {
    // `validateMoney` aceita zero (é resposta válida para saldo devedor e
    // multa). Como PISO, zero significaria "aceito qualquer proposta" com
    // aparência de declaração, e apareceria no card do lojista como R$ 0,00.
    await expect(
      service.createSaleRequest(OWNER, bodyFor({ minimum_accepted_price: "0" }), {
        resolveFipeReference: fipeHigh(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("valor negativo é recusado", async () => {
    await expect(
      service.createSaleRequest(OWNER, bodyFor({ minimum_accepted_price: "-100.00" }), {
        resolveFipeReference: fipeHigh(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("os centavos sobrevivem à publicação", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "62499.99" }),
      { resolveFipeReference: fipeHigh() }
    );

    expect(rowOf(created).minimum_accepted_price).toBe("62499.99");
    expect(created.sale_request.minimum_accepted_price).toBe("62499.99");
  });

  it("texto com máscara é recusado — o valor chega normalizado ou não chega", async () => {
    await expect(
      service.createSaleRequest(OWNER, bodyFor({ minimum_accepted_price: "R$ 62.500,00" }), {
        resolveFipeReference: fipeHigh(),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ============================================================================
describe("os 15% são RECOMENDAÇÃO — o servidor não os aplica", () => {
  // FIPE de 75.000 → faixa recomendada até 63.750.
  const FIPE = 75000;
  const RECOMMENDED_MAX = FIPE * SALE_REQUEST_RECOMMENDED_RATIO; // 63.750

  it("a constante do desconto é 15%, e o teto derivado é 85%", () => {
    expect(SALE_REQUEST_DEALER_DISCOUNT).toBe(0.15);
    expect(SALE_REQUEST_RECOMMENDED_RATIO).toBe(0.85);
    expect(RECOMMENDED_MAX).toBe(63750);
  });

  it("abaixo da faixa recomendada publica", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "60000.00" }),
      { resolveFipeReference: fipeHigh(FIPE) }
    );
    expect(rowOf(created).minimum_accepted_price).toBe("60000.00");
  });

  it("exatamente na faixa recomendada publica", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "63750.00" }),
      { resolveFipeReference: fipeHigh(FIPE) }
    );
    expect(rowOf(created).minimum_accepted_price).toBe("63750.00");
  });

  it("ACIMA da faixa recomendada TAMBÉM publica — o aviso é da tela, não do servidor", async () => {
    // Este é o teste que impede alguém de "endurecer" a recomendação num `if`.
    // Publicar colado na FIPE é um caminho legítimo: quem quer valor de mercado
    // recebe na tela a orientação de usar o anúncio convencional, e decide.
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "74000.00" }),
      { resolveFipeReference: fipeHigh(FIPE) }
    );

    expect(rowOf(created).minimum_accepted_price).toBe("74000.00");
    expect(rowOf(created).status).toBe("receiving_offers");
  });

  it("piso ACIMA da própria FIPE também publica", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "90000.00" }),
      { resolveFipeReference: fipeHigh(FIPE) }
    );
    expect(rowOf(created).minimum_accepted_price).toBe("90000.00");
  });
});

// ============================================================================
describe("FIPE indisponível não impede a publicação", () => {
  it("provedor fora do ar: FIPE fica NULL e o piso é gravado normalmente", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "58000.00" }),
      { resolveFipeReference: fipeDown() }
    );

    const row = rowOf(created);
    expect(row.fipe_reference_value).toBeNull();
    expect(row.minimum_accepted_price).toBe("58000.00");

    // O piso NÃO é derivado da FIPE. Sem FIPE não há faixa recomendada — e não
    // há piso inventado tampouco: continua sendo o número que a pessoa digitou.
    expect(row.status).toBe("receiving_offers");
  });

  it("o cliente não fabrica FIPE para mover a recomendação", async () => {
    const resolve = fipeHigh(75000);
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ fipe_reference_value: "300000.00", fipe_value: 300000 }),
      { resolveFipeReference: resolve }
    );

    expect(rowOf(created).fipe_reference_value).toBe("75000.00");
    expect(resolve.mock.calls[0][0]).not.toHaveProperty("client_hint_value");
  });
});

// ============================================================================
describe("primeira proposta — a barreira é o PISO, e o operador é >=", () => {
  it("um centavo abaixo do piso é recusado, com código próprio e o alvo junto", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    const response = await offer(row.id, "62499.99");

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe(SALE_OPPORTUNITY_CODE.OFFER_BELOW_MINIMUM);
    // O alvo viaja junto: mandar corrigir sem dizer quanto falta obrigaria o
    // lojista a recarregar a página para descobrir.
    expect(response.body?.details?.minimum_accepted_price).toBe("62500.00");
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("EXATAMENTE o piso é aceito — é o valor que o proprietário disse que aceita", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    const response = await offer(row.id, "62500.00");

    expect(response.status).toBe(201);
    expect(db.saleRequestOffers).toHaveLength(1);
    expect(db.saleRequestOffers[0].amount).toBe("62500.00");
  });

  it("acima do piso é aceito", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });
    expect((await offer(row.id, "63000.00")).status).toBe(201);
  });

  it("a recusa por piso NÃO usa o código de 'não supera a maior proposta'", async () => {
    // Os dois erros descrevem barreiras diferentes: o piso é imóvel e conhecido
    // de antemão; a maior proposta sobe a cada lance. Colapsá-los faria a tela
    // dizer "supere a maior proposta atual" numa solicitação sem proposta
    // nenhuma.
    const row = seedRequest({ minimum_accepted_price: "62500.00" });
    const response = await offer(row.id, "10000.00");

    expect(response.body?.details?.code).not.toBe(SALE_OPPORTUNITY_CODE.OFFER_NOT_LEADING);
    expect(response.body?.details?.code).toBe(SALE_OPPORTUNITY_CODE.OFFER_BELOW_MINIMUM);
  });
});

// ============================================================================
describe("propostas seguintes — a barreira vira a MAIOR ATUAL, e o operador vira >", () => {
  it("empatar com o piso depois da primeira proposta é recusado", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    expect((await offer(row.id, "62500.00")).status).toBe(201);

    // Alcançar o piso já não basta: existe líder, e ele precisa ser superado.
    const second = await offer(row.id, "62500.00", { user: DEALER_B });
    expect(second.status).toBe(409);
    expect(second.body?.details?.code).toBe(SALE_OPPORTUNITY_CODE.OFFER_NOT_LEADING);

    // Um centavo acima passa.
    expect((await offer(row.id, "62500.01", { user: DEALER_B })).status).toBe(201);
  });

  it("com líder em 64.000: 63.000 e 64.000 são recusados; 64.000,01 entra", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    expect((await offer(row.id, "64000.00")).status).toBe(201);

    // Acima do piso, mas abaixo do líder.
    const below = await offer(row.id, "63000.00", { user: DEALER_B });
    expect(below.status).toBe(409);
    expect(below.body?.details?.code).toBe(SALE_OPPORTUNITY_CODE.OFFER_NOT_LEADING);
    expect(below.body?.details?.current_highest_offer).toBe("64000.00");

    // Empate.
    expect((await offer(row.id, "64000.00", { user: DEALER_B })).status).toBe(409);

    // Um centavo acima.
    expect((await offer(row.id, "64000.01", { user: DEALER_B })).status).toBe(201);
  });

  it("a MESMA loja pode aumentar a própria proposta", async () => {
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    expect((await offer(row.id, "62500.00")).status).toBe(201);
    expect((await offer(row.id, "63500.00")).status).toBe(201);

    // Append-only: dois lances, nenhuma reescrita.
    expect(db.saleRequestOffers).toHaveLength(2);
    expect(db.saleRequestOffers.map((item) => item.amount)).toEqual(["62500.00", "63500.00"]);
  });
});

// ============================================================================
describe("legado — solicitação anterior à regra (piso NULL)", () => {
  it("sem proposta: mantém o comportamento histórico, sem piso inventado", async () => {
    const row = seedRequest({ minimum_accepted_price: null });

    // Um valor muito abaixo de qualquer piso plausível — e muito abaixo de 85%
    // da FIPE de 92.000 desta linha. Se alguém "derivasse" um piso para o
    // legado, esta proposta seria recusada.
    const response = await offer(row.id, "1000.00");

    expect(response.status).toBe(201);
    expect(db.saleRequestOffers[0].amount).toBe("1000.00");
  });

  it("com proposta: continua exigindo superar a maior atual", async () => {
    const row = seedRequest({ minimum_accepted_price: null });

    expect((await offer(row.id, "50000.00")).status).toBe(201);

    const second = await offer(row.id, "50000.00", { user: DEALER_B });
    expect(second.status).toBe(409);
    expect(second.body?.details?.code).toBe(SALE_OPPORTUNITY_CODE.OFFER_NOT_LEADING);
  });

  it("NULL não vira zero em lugar nenhum do caminho", async () => {
    const row = seedRequest({ minimum_accepted_price: null });
    const app = buildApp();

    const feed = await request(app)
      .get(BASE)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    const item = feed.body.items.find((entry) => String(entry.id) === String(row.id));
    expect(item.minimum_accepted_price).toBeNull();
    expect(item.minimum_accepted_price).not.toBe("0.00");
    expect(item.minimum_accepted_price).not.toBe(0);
  });
});

// ============================================================================
describe("o piso chega ao lojista pelo feed e pelo detalhe", () => {
  it("publicação → banco → feed → detalhe: o MESMO valor", async () => {
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ minimum_accepted_price: "62500.00" }),
      { resolveFipeReference: fipeHigh() }
    );
    const id = created.sale_request.id;

    expect(rowOf(created).minimum_accepted_price).toBe("62500.00");

    const app = buildApp();
    const feed = await request(app)
      .get(BASE)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    const item = feed.body.items.find((entry) => String(entry.id) === String(id));
    expect(item.minimum_accepted_price).toBe("62500.00");

    const detail = await request(app)
      .get(`${BASE}/${id}`)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    expect(detail.body.sale_opportunity.minimum_accepted_price).toBe("62500.00");
  });

  it("o piso NÃO é a FIPE nem a maior proposta — os três convivem com valores distintos", async () => {
    const row = seedRequest({
      minimum_accepted_price: "62500.00",
      fipe_reference_value: "72000.00",
    });
    expect((await offer(row.id, "65000.00")).status).toBe(201);

    const detail = await request(buildApp())
      .get(`${BASE}/${row.id}`)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    const dto = detail.body.sale_opportunity;
    expect(dto.minimum_accepted_price).toBe("62500.00");
    expect(dto.fipe_reference_value).toBe("72000.00");
    expect(dto.current_highest_offer).toBe("65000.00");
  });
});
