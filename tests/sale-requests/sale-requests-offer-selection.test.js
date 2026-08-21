// A ESCOLHA do proprietário — a regra, o que ela recusa e o que ela nunca
// revela (Fase 4.4).
//
// Os dois routers reais são montados em apps Express de verdade: o do DONO (que
// lista as propostas e seleciona) e o do LOJISTA (que perde ou ganha acesso
// depois da decisão). Provar as duas pontas no mesmo arquivo é deliberado — a
// regra desta fase é sobre o que acontece com AMBOS, e um teste que só olhasse
// para o dono não veria a metade que envolve terceiros.
//
// ────────────────────────────────────────────────────────────────────────────
// A FRONTEIRA DESTE ARQUIVO, DECLARADA
// ────────────────────────────────────────────────────────────────────────────
// Aqui se prova a REGRA e o ALCANCE dela. A SERIALIZAÇÃO sob concorrência real
// (§12, §13, §14), a atomicidade da notificação (§22) e o rollback têm arquivo
// próprio contra PostgreSQL de verdade
// (tests/integration/sale-request-offer-selection.integration.test.js), porque
// um fake com um array e uma "conexão" só não disputa nada — um service SEM
// transação nenhuma passaria em todos os casos deste arquivo.
//
// Fingir provar o lock aqui daria confiança falsa exatamente no ponto onde há
// dinheiro em jogo e a decisão é irreversível.

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

const ownerRoutes = (await import("../../src/modules/sale-requests/sale-requests.routes.js"))
  .default;
const dealerRoutes = (
  await import("../../src/modules/sale-requests/sale-requests.dealer.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

const OWNER_BASE = "/api/account/sale-requests";
const DEALER_BASE = "/api/account/opportunities/sale-requests";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(OWNER_BASE, ownerRoutes);
  app.use(DEALER_BASE, dealerRoutes);
  app.use(errorHandler);
  return app;
}

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const OWNER_ID = "7";
const OTHER_OWNER_ID = "9";
const DEALER_A = "20";
const DEALER_B = "21";
const STORE_A = 100;
const STORE_B = 200;

let seq = 0;

function seedDealer({ userId, id, cityId = ATIBAIA.id, name, status = "active" }) {
  db.advertisers.push({ id, user_id: userId, city_id: cityId, status, name });
  return id;
}

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
    minimum_accepted_price: "60000.00",
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...EVALUATION_ROW,
    status: "receiving_offers",
    selected_offer_id: null,
    selected_offer_at: null,
    created_at: new Date(NOW - seq * 60000).toISOString(),
    updated_at: new Date(NOW - seq * 60000).toISOString(),
    ...overrides,
  };

  db.saleRequests.push(row);
  return row;
}

/**
 * Insere um LANCE direto no banco de mentira.
 *
 * `minutesAgo` controla a ordem temporal, que é o que define a proposta ATUAL de
 * uma loja. Escrever isso à mão (em vez de deixar o relógio decidir) é o que
 * permite montar o cenário do §9: uma loja com duas ofertas, e a antiga
 * apontando para um valor que já não vale.
 */
function seedOffer({
  saleRequestId,
  advertiserId,
  dealerUserId,
  amount,
  minutesAgo = 0,
  note = "observação interna da loja",
}) {
  const id = db.nextOfferId;
  db.nextOfferId += 1;

  const row = {
    id,
    sale_request_id: saleRequestId,
    dealer_user_id: dealerUserId,
    advertiser_id: advertiserId,
    amount,
    note,
    created_at: new Date(NOW - minutesAgo * 60000).toISOString(),
  };

  db.saleRequestOffers.push(row);
  return row;
}

function getDetail(app, { user = OWNER_ID, id }) {
  return request(app).get(`${OWNER_BASE}/${id}`).set("x-test-user", user);
}

function select(app, { user = OWNER_ID, id, offerId }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/select-offer`)
    .set("x-test-user", user)
    .send(offerId === undefined ? {} : { offer_id: offerId });
}

function cancel(app, { user = OWNER_ID, id }) {
  return request(app).post(`${OWNER_BASE}/${id}/cancel`).set("x-test-user", user);
}

function dealerDetail(app, { user = DEALER_A, id, advertiserId = null }) {
  const query = advertiserId == null ? "" : `?advertiser_id=${advertiserId}`;
  return request(app)
    .get(`${DEALER_BASE}/${id}${query}`)
    .set("x-test-user", user)
    .set("x-test-account", "CNPJ");
}

function dealerOffer(app, { user = DEALER_A, id, amount }) {
  return request(app)
    .post(`${DEALER_BASE}/${id}/offers`)
    .set("x-test-user", user)
    .set("x-test-account", "CNPJ")
    .send({ amount });
}

/**
 * O cenário padrão: duas lojas disputando, a B na frente.
 *
 * A loja A tem DUAS propostas (62.500 e depois 65.000) de propósito — é o que
 * torna os testes de "uma linha por loja" e de "oferta obsoleta" possíveis sem
 * montar o histórico de novo em cada caso.
 */
function seedDispute() {
  const row = seedRequest();

  const aOld = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_A,
    dealerUserId: DEALER_A,
    amount: "62500.00",
    minutesAgo: 30,
  });
  const aCurrent = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_A,
    dealerUserId: DEALER_A,
    amount: "65000.00",
    minutesAgo: 10,
  });
  const bCurrent = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_B,
    dealerUserId: DEALER_B,
    amount: "67000.00",
    minutesAgo: 5,
  });

  return { row, aOld, aCurrent, bCurrent };
}

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    nextRequestId: 1,
    nextImageId: 1,
    nextOfferId: 1,
    nextSelectionId: 1,
    nextNotificationId: 1,
  });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
  seedDealer({ userId: DEALER_B, id: STORE_B, name: "Prime Veículos" });
});

// ============================================================================
describe("a lista de propostas ATUAIS do proprietário", () => {
  it("mostra UMA linha por loja — o histórico não duplica ninguém", async () => {
    const { row } = seedDispute();

    const response = await getDetail(buildApp(), { id: row.id });

    expect(response.status).toBe(200);
    // Três LANCES no banco, DUAS lojas na tela.
    expect(db.saleRequestOffers).toHaveLength(3);
    expect(response.body.proposals).toHaveLength(2);
  });

  it("a linha de cada loja é a proposta MAIS RECENTE dela", async () => {
    const { row, aCurrent } = seedDispute();

    const response = await getDetail(buildApp(), { id: row.id });
    const storeA = response.body.proposals.find(
      (item) => item.store_name === "Auto Center Atibaia"
    );

    expect(String(storeA.id)).toBe(String(aCurrent.id));
    expect(storeA.amount).toBe("65000.00");
  });

  it("o histórico completo PERMANECE no banco — a tela é que resume", async () => {
    const { row } = seedDispute();
    await getDetail(buildApp(), { id: row.id });

    const stored = db.saleRequestOffers.filter((offer) => offer.sale_request_id === row.id);
    expect(stored.map((offer) => offer.amount)).toEqual([
      "62500.00",
      "65000.00",
      "67000.00",
    ]);
  });

  it("ordena por valor DESC — a maior primeiro, e marcada", async () => {
    const { row } = seedDispute();

    const { body } = await getDetail(buildApp(), { id: row.id });

    expect(body.proposals.map((item) => item.amount)).toEqual(["67000.00", "65000.00"]);
    expect(body.proposals[0].is_highest).toBe(true);
    expect(body.proposals[1].is_highest).toBe(false);
  });

  it("traz nome comercial e cidade/UF da loja", async () => {
    const { row } = seedDispute();

    const { body } = await getDetail(buildApp(), { id: row.id });

    expect(body.proposals[0].store_name).toBe("Prime Veículos");
    expect(body.proposals[0].store_city).toBe("Atibaia - SP");
  });

  it("loja sem nome não vira cartão anônimo nem expõe id interno", async () => {
    seedDealer({ userId: "22", id: 300, name: "   " });
    const row = seedRequest();
    seedOffer({
      saleRequestId: row.id,
      advertiserId: 300,
      dealerUserId: "22",
      amount: "61000.00",
    });

    const { body } = await getDetail(buildApp(), { id: row.id });

    expect(body.proposals[0].store_name).toBe("Loja parceira");
    expect(JSON.stringify(body.proposals[0])).not.toContain("300");
  });

  it("solicitação sem proposta devolve lista VAZIA, não erro", async () => {
    const row = seedRequest();

    const response = await getDetail(buildApp(), { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.proposals).toEqual([]);
    expect(response.body.selected_offer).toBeNull();
  });
});

// ============================================================================
describe("privacidade da lista (§3, §25)", () => {
  it("NÃO expõe advertiser_id, dealer_user_id nem a note da proposta", async () => {
    const { row } = seedDispute();

    const { body } = await getDetail(buildApp(), { id: row.id });
    const serialized = JSON.stringify(body.proposals);

    expect(serialized).not.toContain("advertiser_id");
    expect(serialized).not.toContain("dealer_user_id");
    expect(serialized).not.toContain("note");
    expect(serialized).not.toContain("observação interna da loja");
  });

  it("as CHAVES de cada proposta são exatamente a allowlist", async () => {
    const { row } = seedDispute();

    const { body } = await getDetail(buildApp(), { id: row.id });

    // Igualdade de conjunto, e não `toContain`: uma coluna nova que alguém
    // acrescente à query no futuro faz este teste falhar, em vez de vazar em
    // silêncio.
    expect(Object.keys(body.proposals[0]).sort()).toEqual(
      ["amount", "created_at", "id", "is_highest", "store_city", "store_name"].sort()
    );
  });

  it("a solicitação de OUTRA pessoa é 404 — nem a lista, nem a existência", async () => {
    const { row } = seedDispute();

    const response = await getDetail(buildApp(), { user: OTHER_OWNER_ID, id: row.id });

    expect(response.status).toBe(404);
  });
});

// ============================================================================
describe("selecionar uma proposta", () => {
  it("aceita a MAIOR e muda o status para offer_selected", async () => {
    const { row, bCurrent } = seedDispute();

    const response = await select(buildApp(), { id: row.id, offerId: bCurrent.id });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(response.body.selected.amount).toBe("67000.00");
    expect(db.saleRequests[0].status).toBe("offer_selected");
  });

  /**
   * §28 — O TESTE CRÍTICO.
   *
   * Se algum dia alguém "melhorar" o produto recusando a proposta menor, é este
   * teste que cai. Ele não está aqui por completude: está aqui porque a regra
   * "qualquer proposta pode ser escolhida" é a diferença entre um leilão
   * assistido e um leilão automático, e essa diferença é invisível em qualquer
   * outro teste desta suíte.
   */
  it("aceita a MENOR proposta — selecionar não é aceitar o maior lance", async () => {
    const { row, aCurrent } = seedDispute();

    const response = await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(response.status).toBe(200);
    expect(response.body.selected.amount).toBe("65000.00");
    expect(response.body.selected.store_name).toBe("Auto Center Atibaia");
    // E a maior (67.000, da Prime) continua no banco, intocada: escolher não
    // apaga nem recusa nada.
    expect(db.saleRequestOffers.some((offer) => offer.amount === "67000.00")).toBe(true);
  });

  it("grava o ESTADO apontando para a OFERTA EXATA, com data", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    const stored = db.saleRequests[0];
    expect(String(stored.selected_offer_id)).toBe(String(aCurrent.id));
    expect(stored.selected_offer_at).toBeTruthy();
  });

  it("registra a trilha append-only com o valor CONGELADO", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(db.saleRequestOfferSelections).toHaveLength(1);
    const [event] = db.saleRequestOfferSelections;
    expect(String(event.sale_request_id)).toBe(String(row.id));
    expect(String(event.offer_id)).toBe(String(aCurrent.id));
    expect(String(event.advertiser_id)).toBe(String(STORE_A));
    expect(String(event.selected_by_user_id)).toBe(OWNER_ID);
    expect(event.amount_snapshot).toBe("65000.00");
  });

  it("o detalhe passa a mostrar a escolhida e NENHUMA proposta perdedora", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const { body } = await getDetail(app, { id: row.id });

    expect(body.sale_request.status).toBe("offer_selected");
    expect(body.selected_offer.amount).toBe("65000.00");
    expect(body.proposals).toEqual([]);
  });
});

// ============================================================================
describe("o que a seleção RECUSA", () => {
  it("proposta de OUTRA solicitação é recusada", async () => {
    const { row } = seedDispute();
    const other = seedRequest();
    const foreign = seedOffer({
      saleRequestId: other.id,
      advertiserId: STORE_B,
      dealerUserId: DEALER_B,
      amount: "80000.00",
    });

    const response = await select(buildApp(), { id: row.id, offerId: foreign.id });

    expect(response.status).toBe(404);
    expect(response.body.details?.code).toBe("SALE_REQUEST_OFFER_NOT_FOUND");
    expect(db.saleRequests[0].status).toBe("receiving_offers");
    expect(db.saleRequestOfferSelections).toHaveLength(0);
  });

  it("proposta inexistente é recusada", async () => {
    const { row } = seedDispute();

    const response = await select(buildApp(), { id: row.id, offerId: 99999 });

    expect(response.status).toBe(404);
    expect(response.body.details?.code).toBe("SALE_REQUEST_OFFER_NOT_FOUND");
  });

  /**
   * §9 — a proposta OBSOLETA.
   *
   * O proprietário está com a tela aberta desde antes de a loja A aumentar.
   * Selecionar a oferta antiga congelaria R$ 62.500 quando a loja já está em
   * R$ 65.000 — ele escolheria menos dinheiro sem ter escolhido isso.
   */
  it("oferta OBSOLETA da mesma loja é recusada com 409 e o valor atual", async () => {
    const { row, aOld } = seedDispute();

    const response = await select(buildApp(), { id: row.id, offerId: aOld.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_OFFER_STALE");
    expect(response.body.details?.current_amount).toBe("65000.00");
    expect(db.saleRequests[0].status).toBe("receiving_offers");
    expect(db.saleRequestOfferSelections).toHaveLength(0);
  });

  it("dono ERRADO é 404 e não grava nada", async () => {
    const { row, bCurrent } = seedDispute();

    const response = await select(buildApp(), {
      user: OTHER_OWNER_ID,
      id: row.id,
      offerId: bCurrent.id,
    });

    expect(response.status).toBe(404);
    expect(db.saleRequests[0].status).toBe("receiving_offers");
    expect(db.saleRequestOfferSelections).toHaveLength(0);
  });

  it("solicitação CANCELADA recusa a seleção", async () => {
    const { row, bCurrent } = seedDispute();
    db.saleRequests[0].status = "cancelled";

    const response = await select(buildApp(), { id: row.id, offerId: bCurrent.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_SELECTION_CLOSED");
    expect(db.saleRequestOfferSelections).toHaveLength(0);
  });

  it("`offer_id` ausente é 400 de campo, e não 404 de recurso", async () => {
    const { row } = seedDispute();

    const response = await select(buildApp(), { id: row.id });

    expect(response.status).toBe(400);
    expect(response.body.details?.field).toBe("offer_id");
  });

  it("`offer_id` com prefixo numérico NÃO é lido pelo prefixo", async () => {
    const { row, aCurrent } = seedDispute();

    // "2abc" jamais pode agir sobre a proposta 2.
    const response = await select(buildApp(), { id: row.id, offerId: `${aCurrent.id}abc` });

    expect(response.status).toBe(400);
    expect(db.saleRequestOfferSelections).toHaveLength(0);
  });
});

// ============================================================================
describe("idempotência e transição única (§8, §11)", () => {
  it("repetir a MESMA seleção é 200 e não duplica nada", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    const first = await select(app, { id: row.id, offerId: aCurrent.id });
    const retry = await select(app, { id: row.id, offerId: aCurrent.id });

    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(true);

    expect(retry.status).toBe(200);
    expect(retry.body.changed).toBe(false);
    expect(retry.body.selected.amount).toBe("65000.00");

    expect(db.saleRequestOfferSelections).toHaveLength(1);
    expect(db.userNotifications).toHaveLength(1);
  });

  it("selecionar OUTRA proposta depois é 409 — a decisão é irreversível", async () => {
    const { row, aCurrent, bCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const second = await select(app, { id: row.id, offerId: bCurrent.id });

    expect(second.status).toBe(409);
    expect(second.body.details?.code).toBe("SALE_REQUEST_ALREADY_SELECTED");

    // O estado NÃO mudou de loja, e a trilha continua com um evento só.
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(aCurrent.id));
    expect(db.saleRequestOfferSelections).toHaveLength(1);
  });
});

// ============================================================================
describe("a notificação da loja escolhida (§21)", () => {
  it("vai para o dealer_user_id da oferta selecionada, e só para ele", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(db.userNotifications).toHaveLength(1);
    const [notification] = db.userNotifications;
    expect(String(notification.recipient_user_id)).toBe(DEALER_A);
    expect(notification.event_type).toBe("sale_request.bid_selected");
  });

  it("NÃO notifica os concorrentes", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(
      db.userNotifications.some((item) => String(item.recipient_user_id) === DEALER_B)
    ).toBe(false);
  });

  it("usa chave idempotente determinística por (solicitação, oferta)", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(db.userNotifications[0].idempotency_key).toBe(
      `sale-request:${row.id}:offer-selected:${aCurrent.id}`
    );
  });

  it("o texto NÃO promete venda concluída nem carrega contato da PF", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    const serialized = JSON.stringify(db.userNotifications[0]).toLowerCase();
    for (const forbidden of [
      "venda concluída",
      "negócio fechado",
      "pagamento",
      "whatsapp",
      "telefone",
      "e-mail",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("aponta para a tela da oportunidade na área do lojista", async () => {
    const { row, aCurrent } = seedDispute();

    await select(buildApp(), { id: row.id, offerId: aCurrent.id });

    expect(db.userNotifications[0].action_path).toBe(
      `/dashboard-loja/oportunidades/veiculos/${row.id}`
    );
  });
});

// ============================================================================
describe("depois da seleção, a disputa acabou (§15)", () => {
  it("NENHUM lojista consegue enviar nova proposta", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const rejected = await dealerOffer(app, { user: DEALER_B, id: row.id, amount: "80000" });

    expect(rejected.status).toBe(409);
    expect(rejected.body.details?.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");
  });

  it("nem mesmo a loja SELECIONADA pode aumentar pela rota de disputa", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const rejected = await dealerOffer(app, { user: DEALER_A, id: row.id, amount: "90000" });

    expect(rejected.status).toBe(409);
    expect(rejected.body.details?.code).toBe("SALE_OPPORTUNITY_OFFER_CLOSED");
    // Nada de novo foi gravado: continuam os três lances do cenário.
    expect(db.saleRequestOffers).toHaveLength(3);
  });
});

// ============================================================================
describe("o lojista SELECIONADO e os demais (§19, §20)", () => {
  it("a loja escolhida continua abrindo a oportunidade, em modo selecionado", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const response = await dealerDetail(app, { user: DEALER_A, id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.sale_opportunity.is_selected).toBe(true);
    expect(response.body.sale_opportunity.selected_amount).toBe("65000.00");
    expect(response.body.sale_opportunity.status).toBe("offer_selected");
  });

  it("a loja PERDEDORA recebe 404 — o mesmo 404 de sempre", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const response = await dealerDetail(app, { user: DEALER_B, id: row.id });

    expect(response.status).toBe(404);
    // Nada no corpo diz "selecionada", "outra loja" ou qualquer coisa sobre o
    // desfecho: descobrir isso já seria informação sobre um negócio alheio.
    expect(JSON.stringify(response.body)).not.toMatch(/select|proposta|loja/i);
  });

  it("a loja escolhida NÃO recebe contato do proprietário", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const { body } = await dealerDetail(app, { user: DEALER_A, id: row.id });

    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      "seller",
      "owner_user_id",
      "whatsapp",
      "phone",
      "email",
      "document",
      "cpf",
      "address",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("enquanto a disputa está aberta, is_selected é false para todos", async () => {
    const { row } = seedDispute();
    const app = buildApp();

    for (const user of [DEALER_A, DEALER_B]) {
      const { body } = await dealerDetail(app, { user, id: row.id });
      expect(body.sale_opportunity.is_selected).toBe(false);
      expect(body.sale_opportunity.selected_amount).toBeNull();
    }
  });
});

// ============================================================================
describe("cancelamento depois da seleção (§14)", () => {
  it("é recusado com 409 — e NÃO muda o status silenciosamente", async () => {
    const { row, aCurrent } = seedDispute();
    const app = buildApp();

    await select(app, { id: row.id, offerId: aCurrent.id });
    const response = await cancel(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
    expect(db.saleRequests[0].status).toBe("offer_selected");
  });

  it("cancelar ANTES da seleção continua funcionando, e o retry segue idempotente", async () => {
    const { row } = seedDispute();
    const app = buildApp();

    const first = await cancel(app, { id: row.id });
    const retry = await cancel(app, { id: row.id });

    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(true);
    expect(retry.status).toBe(200);
    expect(retry.body.changed).toBe(false);
    expect(db.saleRequests[0].status).toBe("cancelled");
  });
});
