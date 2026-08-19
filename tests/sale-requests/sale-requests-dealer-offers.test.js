// Propostas preliminares — a regra de disputa, o que ela recusa e o que ela
// NUNCA revela.
//
// O router real é montado num app Express de verdade. Aqui se prova a REGRA e o
// ALCANCE dela; a SERIALIZAÇÃO sob concorrência real tem arquivo próprio contra
// PostgreSQL (tests/integration/sale-request-offers-concurrency...), porque um
// fake com um array e uma "conexão" só não disputa nada — e um service SEM
// transação nenhuma passaria em todos os casos deste arquivo.
//
// Essa fronteira é declarada de propósito. Um teste que fingisse provar o lock
// aqui daria confiança falsa exatamente no ponto onde há dinheiro em jogo.

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";
import { EVALUATION_ROW } from "./evaluation-fixture.js";

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

const dealerRoutes = (
  await import("../../src/modules/sale-requests/sale-requests.dealer.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

const BASE = "/api/account/opportunities/sale-requests";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(BASE, dealerRoutes);
  app.use(errorHandler);
  return app;
}

const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const OWNER_ID = "7";
const DEALER_A = "20";
const DEALER_B = "21";
const PF_ID = "8";
const STORE_A = 100;
const STORE_B = 200;

function seedDealer({ userId, cityId = ATIBAIA.id, id, status = "active", name = null }) {
  db.advertisers.push({
    id,
    user_id: userId,
    city_id: cityId,
    status,
    name: name ?? `Loja ${id}`,
  });
  return id;
}

let seq = 0;

function seedRequest(overrides = {}) {
  const id = db.nextRequestId;
  db.nextRequestId += 1;
  seq += 1;

  const row = {
    id,
    owner_user_id: OWNER_ID,
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
    ...EVALUATION_ROW,
    status: "receiving_offers",
    created_at: new Date(NOW - seq * 60000).toISOString(),
    updated_at: new Date(NOW - seq * 60000).toISOString(),
    ...overrides,
  };

  db.saleRequests.push(row);
  return row;
}

function offer(app, { user = DEALER_A, id, body, advertiserId = null }) {
  const query = advertiserId == null ? "" : `?advertiser_id=${advertiserId}`;
  return request(app)
    .post(`${BASE}/${id}/offers${query}`)
    .set("x-test-user", user)
    .set("x-test-account", "CNPJ")
    .send(body);
}

function detail(app, { user = DEALER_A, id }) {
  return request(app)
    .get(`${BASE}/${id}`)
    .set("x-test-user", user)
    .set("x-test-account", "CNPJ");
}

beforeEach(() => {
  resetDb({ cities: [ATIBAIA, BRAGANCA], nextRequestId: 1, nextImageId: 1, nextOfferId: 1 });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, cityId: ATIBAIA.id });
  seedDealer({ userId: DEALER_B, id: STORE_B, cityId: ATIBAIA.id });
});

// ============================================================================
describe("primeira proposta", () => {
  it("é aceita e devolve 201 com a proposta e o líder atual", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(201);
    expect(response.body.offer.amount).toBe("50000.00");
    expect(response.body.current_highest_offer).toBe("50000.00");
    expect(response.body.my_offer).toBe("50000.00");
    expect(response.body.is_leading).toBe(true);
  });

  it("não precisa superar nada — não existe líder ainda", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "1" } });
    expect(response.status).toBe(201);
  });

  it("aceita observação opcional", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000", note: "Sujeito a avaliação presencial." },
    });

    expect(response.status).toBe(201);
    expect(response.body.offer.note).toBe("Sujeito a avaliação presencial.");
  });

  it("observação vazia vira null — um campo opcional tem UM jeito de estar ausente", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000", note: "   " } });
    expect(response.body.offer.note).toBeNull();
  });

  it("a resposta é privada e não cacheável", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});

// ============================================================================
describe("valor inválido", () => {
  it.each([
    ["ausente", {}],
    ["vazio", { amount: "" }],
    ["zero", { amount: "0" }],
    ["negativo", { amount: "-1000" }],
    ["texto", { amount: "cinquenta mil" }],
    ["com máscara pt-BR", { amount: "50.000,00" }],
    ["com símbolo", { amount: "R$ 50000" }],
    ["três casas decimais", { amount: "50000.123" }],
    ["acima do teto", { amount: "99999999" }],
  ])("%s é recusado com 400", async (_label, body) => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body });

    expect(response.status).toBe(400);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_INVALID_AMOUNT");
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("observação longa demais é recusada", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000", note: "x".repeat(501) },
    });

    expect(response.status).toBe(400);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_INVALID_NOTE");
  });

  it("valor inválido NÃO chega a travar a solicitação", async () => {
    const row = seedRequest();
    await offer(buildApp(), { id: row.id, body: { amount: "abc" } });
    // Nenhuma linha criada, nenhum efeito colateral.
    expect(db.saleRequestOffers).toHaveLength(0);
  });
});

// ============================================================================
describe("a regra da maior oferta", () => {
  it("igual ao líder é RECUSADO — precisa superar, não empatar", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_OFFER_NOT_LEADING");
  });

  it("abaixo do líder é recusado", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_B, id: row.id, body: { amount: "49000" } });
    expect(response.status).toBe(409);
  });

  it("a recusa devolve o valor líder ATUALIZADO, para a tela não mandar recarregar", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_B, id: row.id, body: { amount: "49000" } });
    expect(response.body?.details?.current_highest_offer).toBe("50000.00");
  });

  it("um centavo acima do líder já passa — o corte é exato", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000.00" } });

    const response = await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000.01" } });
    expect(response.status).toBe(201);
    expect(response.body.current_highest_offer).toBe("50000.01");
  });

  it("acima do líder é aceito e assume a liderança", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_B, id: row.id, body: { amount: "51000" } });

    expect(response.status).toBe(201);
    expect(response.body.current_highest_offer).toBe("51000.00");
    expect(response.body.is_leading).toBe(true);
  });

  it("proposta recusada NÃO grava linha — o histórico só tem lances válidos", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "49000" } });

    expect(db.saleRequestOffers).toHaveLength(1);
  });
});

// ============================================================================
describe("a mesma loja aumentando", () => {
  it("pode aumentar a própria proposta", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { id: row.id, body: { amount: "52000" } });

    expect(response.status).toBe(201);
    expect(response.body.my_offer).toBe("52000.00");
  });

  it("pode aumentar mesmo já liderando — a UX avisa, o servidor não bloqueia", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const detailBefore = await detail(app, { id: row.id });
    expect(detailBefore.body.sale_opportunity.is_leading).toBe(true);

    const response = await offer(app, { id: row.id, body: { amount: "53000" } });
    expect(response.status).toBe(201);
  });

  it("NÃO pode repetir o mesmo valor — é o que barra o clique duplo", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(409);
    expect(db.saleRequestOffers).toHaveLength(1);
  });

  it("cada aumento é uma LINHA NOVA — o histórico não é destruído", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });
    await offer(app, { id: row.id, body: { amount: "52000" } });
    await offer(app, { id: row.id, body: { amount: "55000" } });

    expect(db.saleRequestOffers).toHaveLength(3);
    expect(db.saleRequestOffers.map((item) => item.amount)).toEqual([
      "50000.00",
      "52000.00",
      "55000.00",
    ]);
  });
});

// ============================================================================
describe("o ator vem do servidor, nunca do corpo", () => {
  it("`dealer_user_id` gravado é o do token, mesmo se o corpo mandar outro", async () => {
    const row = seedRequest();
    await offer(buildApp(), {
      user: DEALER_A,
      id: row.id,
      body: { amount: "50000", dealer_user_id: DEALER_B, advertiser_id: STORE_B },
    });

    expect(db.saleRequestOffers[0].dealer_user_id).toBe(DEALER_A);
  });

  it("`advertiser_id` gravado é o resolvido pela loja, não o do corpo", async () => {
    const row = seedRequest();
    await offer(buildApp(), {
      user: DEALER_A,
      id: row.id,
      body: { amount: "50000", advertiser_id: STORE_B },
    });

    expect(String(db.saleRequestOffers[0].advertiser_id)).toBe(String(STORE_A));
  });

  it("`sale_request_id` vem da URL, não do corpo", async () => {
    const target = seedRequest();
    const other = seedRequest();

    await offer(buildApp(), {
      id: target.id,
      body: { amount: "50000", sale_request_id: other.id },
    });

    expect(String(db.saleRequestOffers[0].sale_request_id)).toBe(String(target.id));
  });

  it("os DOIS atores são gravados — conta e loja, nunca um só", async () => {
    const row = seedRequest();
    await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(db.saleRequestOffers[0].dealer_user_id).toBeTruthy();
    expect(db.saleRequestOffers[0].advertiser_id).toBeTruthy();
  });
});

// ============================================================================
describe("guardas de acesso e estado", () => {
  it("conta CPF recebe 403", async () => {
    const row = seedRequest();
    const response = await request(buildApp())
      .post(`${BASE}/${row.id}/offers`)
      .set("x-test-user", PF_ID)
      .set("x-test-account", "CPF")
      .send({ amount: "50000" });

    expect(response.status).toBe(403);
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("sem sessão recebe 401", async () => {
    const row = seedRequest();
    const response = await request(buildApp())
      .post(`${BASE}/${row.id}/offers`)
      .send({ amount: "50000" });

    expect(response.status).toBe(401);
  });

  it("solicitação CANCELADA recusa com 409 e motivo — não 404", async () => {
    const row = seedRequest({ status: "cancelled" });
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("cancelamento DEPOIS de propostas não apaga o histórico", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });

    row.status = "cancelled";
    const response = await offer(app, { id: row.id, body: { amount: "60000" } });

    expect(response.status).toBe(409);
    // A proposta anterior continua no banco.
    expect(db.saleRequestOffers).toHaveLength(1);
  });

  it("solicitação de OUTRA cidade é 404 — nunca 403 com motivo", async () => {
    const foreign = seedRequest({ city_id: BRAGANCA.id });
    const response = await offer(buildApp(), { id: foreign.id, body: { amount: "50000" } });

    expect(response.status).toBe(404);
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("id inexistente é 404", async () => {
    const response = await offer(buildApp(), { id: 9999, body: { amount: "50000" } });
    expect(response.status).toBe(404);
  });

  it("lojista sem loja resolvida é 403, e não chega a propor", async () => {
    db.advertisers = [];
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(403);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_UNRESOLVED");
  });
});

// ============================================================================
describe("a identidade do concorrente NUNCA aparece", () => {
  it("a resposta do POST não carrega nenhum identificador de loja", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_A, id: row.id, body: { amount: "51000" } });
    const raw = JSON.stringify(response.body);

    for (const field of ["advertiser_id", "dealer_user_id", "user_id", "store", "loja", "name"]) {
      expect(raw).not.toContain(`"${field}"`);
    }
  });

  it("a recusa também não revela quem lidera", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000" } });

    const response = await offer(app, { user: DEALER_A, id: row.id, body: { amount: "49000" } });
    const raw = JSON.stringify(response.body);

    expect(raw).toContain("50000.00");
    for (const field of ["advertiser_id", "dealer_user_id", "leader", "loja"]) {
      expect(raw).not.toContain(`"${field}"`);
    }
  });

  it("o detalhe mostra o VALOR líder e não quem o fez", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000" } });

    const response = await detail(app, { user: DEALER_A, id: row.id });
    const opportunity = response.body.sale_opportunity;

    expect(opportunity.current_highest_offer).toBe("50000.00");
    expect(opportunity.my_offer).toBeNull();
    expect(opportunity.is_leading).toBe(false);

    // A asserção é sobre as CHAVES do bloco de disputa, e não sobre procurar o
    // id da loja rival no JSON inteiro. Procurar o número é uma armadilha: o id
    // `200` casaria dentro de "T-Cross 200 TSI 1.0" e o teste falharia por um
    // motivo que não tem nada a ver com privacidade — e alguém o desligaria.
    //
    // O bloco tem exatamente quatro campos, todos derivados de valores. Um
    // quinto campo com identidade quebra esta lista.
    const disputeFields = Object.keys(opportunity).filter((key) =>
      ["current_highest_offer", "my_offer", "is_leading", "offers_count"].includes(key)
    );
    expect(disputeFields).toHaveLength(4);

    for (const key of Object.keys(opportunity)) {
      expect(key).not.toMatch(/advertiser|dealer|store|leader|winner/i);
    }
  });

  it("a palavra 'Confidencial' não existe na resposta — o VALOR não é segredo", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "50000" } });

    const response = await detail(app, { user: DEALER_A, id: row.id });
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("confidencial");
  });

  it("a NOTA de um concorrente não é exposta", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, {
      user: DEALER_B,
      id: row.id,
      body: { amount: "50000", note: "observação interna da loja B" },
    });

    const response = await detail(app, { user: DEALER_A, id: row.id });
    expect(JSON.stringify(response.body)).not.toContain("observação interna");
  });
});

// ============================================================================
describe("o estado da disputa nas telas", () => {
  it("solicitação sem proposta mostra tudo zerado, e não campos ausentes", async () => {
    const row = seedRequest();
    const response = await detail(buildApp(), { id: row.id });
    const opportunity = response.body.sale_opportunity;

    expect(opportunity.current_highest_offer).toBeNull();
    expect(opportunity.my_offer).toBeNull();
    expect(opportunity.is_leading).toBe(false);
    expect(opportunity.offers_count).toBe(0);
  });

  it("`is_leading` é falso quando outra loja lidera", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_A, id: row.id, body: { amount: "50000" } });
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "51000" } });

    const forA = await detail(app, { user: DEALER_A, id: row.id });
    expect(forA.body.sale_opportunity.my_offer).toBe("50000.00");
    expect(forA.body.sale_opportunity.current_highest_offer).toBe("51000.00");
    expect(forA.body.sale_opportunity.is_leading).toBe(false);
  });

  it("`offers_count` conta as propostas sem dizer de quem são", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { user: DEALER_A, id: row.id, body: { amount: "50000" } });
    await offer(app, { user: DEALER_B, id: row.id, body: { amount: "51000" } });

    const response = await detail(app, { id: row.id });
    expect(response.body.sale_opportunity.offers_count).toBe(2);
  });

  it("o FEED carrega o mesmo estado por card, em lote", async () => {
    const app = buildApp();
    const withOffer = seedRequest();
    const without = seedRequest();
    await offer(app, { user: DEALER_B, id: withOffer.id, body: { amount: "50000" } });

    const response = await request(app)
      .get(BASE)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    const byId = new Map(response.body.items.map((item) => [String(item.id), item]));
    expect(byId.get(String(withOffer.id)).current_highest_offer).toBe("50000.00");
    expect(byId.get(String(withOffer.id)).my_offer).toBeNull();
    expect(byId.get(String(without.id)).current_highest_offer).toBeNull();
  });

  it("as métricas do cabeçalho particionam a cidade: com + sem = total", async () => {
    const app = buildApp();
    const first = seedRequest();
    seedRequest();
    seedRequest();
    await offer(app, { user: DEALER_A, id: first.id, body: { amount: "50000" } });

    const response = await request(app)
      .get(BASE)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    const { summary } = response.body;
    expect(summary.with_my_offer).toBe(1);
    expect(summary.without_my_offer).toBe(2);
    expect(summary.with_my_offer + summary.without_my_offer).toBe(summary.total);
  });

  it("vários lances da MESMA loja contam a solicitação uma vez só", async () => {
    const app = buildApp();
    const row = seedRequest();
    await offer(app, { id: row.id, body: { amount: "50000" } });
    await offer(app, { id: row.id, body: { amount: "51000" } });
    await offer(app, { id: row.id, body: { amount: "52000" } });

    const response = await request(app)
      .get(BASE)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ");

    expect(response.body.summary.with_my_offer).toBe(1);
  });
});

// ============================================================================
describe("ausência de prazo e de estados futuros", () => {
  it("nenhuma resposta carrega expiração ou cronômetro", async () => {
    const app = buildApp();
    const row = seedRequest();
    const created = await offer(app, { id: row.id, body: { amount: "50000" } });
    const shown = await detail(app, { id: row.id });

    const raw = JSON.stringify(created.body) + JSON.stringify(shown.body);
    for (const field of ["expires_at", "expires_in", "deadline", "countdown", "time_left"]) {
      expect(raw).not.toContain(field);
    }
  });

  it("a proposta não tem status — é um fato datado, não um objeto com ciclo de vida", async () => {
    const row = seedRequest();
    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(Object.keys(response.body.offer).sort()).toEqual(
      ["amount", "created_at", "id", "note"].sort()
    );
  });

  it("nenhum canal de contato aparece em resposta nenhuma", async () => {
    const app = buildApp();
    const row = seedRequest();
    const created = await offer(app, { id: row.id, body: { amount: "50000" } });
    const shown = await detail(app, { id: row.id });

    const raw = (JSON.stringify(created.body) + JSON.stringify(shown.body)).toLowerCase();
    for (const term of ["whatsapp", "wa.me", "telefone", "tel:", "mailto", "chat"]) {
      expect(raw).not.toContain(term);
    }
  });
});

// ============================================================================
describe("a LOJA que fez a proposta", () => {
  it("com uma loja só, o advertiser_id gravado é o dela", async () => {
    const row = seedRequest();
    await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(String(db.saleRequestOffers[0].advertiser_id)).toBe(String(STORE_A));
  });

  it("com DUAS lojas e nenhuma escolhida, a proposta é BLOQUEADA — não atribuída à toa", async () => {
    seedDealer({ userId: DEALER_A, id: 300, cityId: ATIBAIA.id });
    const row = seedRequest();

    const response = await offer(buildApp(), { id: row.id, body: { amount: "50000" } });

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED");
    // O ponto do gate: NADA foi gravado em nome de nenhuma das duas.
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("escolhendo a Loja A, a proposta fica registrada em nome da Loja A", async () => {
    seedDealer({ userId: DEALER_A, id: 300, cityId: ATIBAIA.id });
    const row = seedRequest();

    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000" },
      advertiserId: STORE_A,
    });

    expect(response.status).toBe(201);
    expect(String(db.saleRequestOffers[0].advertiser_id)).toBe(String(STORE_A));
  });

  it("escolhendo a Loja 300, a MESMA conta registra em nome da Loja 300", async () => {
    seedDealer({ userId: DEALER_A, id: 300, cityId: ATIBAIA.id });
    const row = seedRequest();

    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000" },
      advertiserId: 300,
    });

    expect(response.status).toBe(201);
    expect(String(db.saleRequestOffers[0].advertiser_id)).toBe("300");
    // A conta continua sendo a mesma pessoa: os dois atores são independentes.
    expect(db.saleRequestOffers[0].dealer_user_id).toBe(DEALER_A);
  });

  it("loja de OUTRO usuário é recusada, mesmo que exista e esteja ativa", async () => {
    const row = seedRequest();

    const response = await offer(buildApp(), {
      user: DEALER_A,
      id: row.id,
      body: { amount: "50000" },
      advertiserId: STORE_B,
    });

    expect(response.status).toBe(403);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_INVALID");
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("loja inexistente é recusada", async () => {
    const row = seedRequest();

    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000" },
      advertiserId: 999999,
    });

    expect(response.status).toBe(403);
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("loja da CIDADE ERRADA não alcança a solicitação — 404, e nada é gravado", async () => {
    // O lojista A ganha uma segunda loja, em Bragança. Ela é legítima e dele,
    // mas não atende Atibaia.
    seedDealer({ userId: DEALER_A, id: 400, cityId: BRAGANCA.id });
    const row = seedRequest({ city_id: ATIBAIA.id });

    const response = await offer(buildApp(), {
      id: row.id,
      body: { amount: "50000" },
      advertiserId: 400,
    });

    // 404 e não 403: para quem age pela loja de Bragança, um carro de Atibaia
    // não existe. Dizer "cidade errada" confirmaria a existência da solicitação.
    expect(response.status).toBe(404);
    expect(db.saleRequestOffers).toHaveLength(0);
  });

  it("advertiser_id no CORPO é ignorado — o contexto vem da query verificada", async () => {
    seedDealer({ userId: DEALER_A, id: 300, cityId: ATIBAIA.id });
    const row = seedRequest();

    const response = await offer(buildApp(), {
      id: row.id,
      // O corpo tenta uma loja; a query pede outra. Só a query é lida, e ela
      // ainda assim é confrontada com o conjunto do servidor.
      body: { amount: "50000", advertiser_id: STORE_B },
      advertiserId: 300,
    });

    expect(response.status).toBe(201);
    expect(String(db.saleRequestOffers[0].advertiser_id)).toBe("300");
  });

  it("duas lojas do MESMO usuário disputam de verdade: cada lance guarda a sua", async () => {
    seedDealer({ userId: DEALER_A, id: 300, cityId: ATIBAIA.id });
    const app = buildApp();
    const row = seedRequest();

    await offer(app, { id: row.id, body: { amount: "50000" }, advertiserId: STORE_A });
    await offer(app, { id: row.id, body: { amount: "52000" }, advertiserId: 300 });

    expect(db.saleRequestOffers.map((item) => String(item.advertiser_id))).toEqual([
      String(STORE_A),
      "300",
    ]);
  });
});
