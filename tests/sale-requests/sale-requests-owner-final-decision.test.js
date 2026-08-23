// A DECISÃO DO PROPRIETÁRIO sobre a proposta final — a regra, o que ela recusa
// e o que ela nunca revela (Fase 4.6).
//
// Os dois routers reais são montados em apps Express de verdade, e as duas
// pontas aparecem no mesmo arquivo: a decisão do proprietário só é interessante
// junto com o que a loja passa a ver por causa dela.
//
// ────────────────────────────────────────────────────────────────────────────
// A FRONTEIRA DESTE ARQUIVO, DECLARADA
// ────────────────────────────────────────────────────────────────────────────
// Aqui se prova a REGRA e o ALCANCE dela.
//
// O que NÃO se prova aqui, e tem arquivo próprio contra PostgreSQL real
// (tests/integration/sale-request-owner-final-decision.integration.test.js):
//
//   §17  `accepted` × `rejected` simultâneos — o fake tem um array e uma
//        "conexão" só, e um service SEM transação nenhuma passaria em todos os
//        casos deste arquivo;
//   §34  os CHECKs de status e de coerência da seleção;
//   §35  a FK composta de 5 colunas que prova o snapshot NO BANCO. O fake não a
//        reproduz de propósito — um fake que imitasse a constraint estaria
//        concordando consigo mesmo;
//   §19  o rollback da notificação derrubando a decisão inteira.

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
const { SALE_REQUEST_STATUS, SALE_REQUEST_SELECTED_STATUSES } = await import(
  "../../src/modules/sale-requests/sale-requests.constants.js"
);

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

const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const OWNER_ID = "7";
const OTHER_OWNER_ID = "9";
const DEALER_A = "20";
const DEALER_B = "21";
const STORE_A = 100;
const STORE_B = 200;

/** O par de números que atravessa o arquivo: preliminar R$ 65.000, final R$ 60.000. */
const PRELIMINARY = "65000.00";
const FINAL = "60000.00";

let seq = 0;

function seedDealer({ userId, id, cityId = ATIBAIA.id, name, address = "Rua das Lojas, 120" }) {
  db.advertisers.push({ id, user_id: userId, city_id: cityId, status: "active", name, address });
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
    minimum_accepted_price: "62500.00",
    year: 2020,
    mileage: 62000,
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

function seedOffer({ saleRequestId, advertiserId, dealerUserId, amount }) {
  const id = db.nextOfferId;
  db.nextOfferId += 1;
  const row = {
    id,
    sale_request_id: saleRequestId,
    dealer_user_id: dealerUserId,
    advertiser_id: advertiserId,
    amount,
    note: null,
    created_at: new Date(NOW - 10 * 60000).toISOString(),
  };
  db.saleRequestOffers.push(row);
  return row;
}

/**
 * O cenário INTEIRO até `final_offer_submitted`, montado direto no fake.
 *
 * Não passa pelos endpoints da 4.3/4.4/4.5 de propósito: o que este arquivo
 * prova começa DEPOIS deles, e refazer quatro fases por teste tornaria cada
 * asserção refém de um defeito em qualquer uma delas. As relações são as reais —
 * a seleção existe, a inspeção existe e aponta para a loja escolhida, e a
 * decisão pós-inspeção aponta para as duas.
 *
 * O caminho completo pelos endpoints reais existe, e é o E2E somado à suíte de
 * PostgreSQL, onde o `seedWorld` roda os services de verdade.
 */
function seedFinalOffer({
  decisionType = "final_offer",
  finalAmount = FINAL,
  status = SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED,
} = {}) {
  const row = seedRequest();
  const offerA = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_A,
    dealerUserId: DEALER_A,
    amount: PRELIMINARY,
  });
  seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_B,
    dealerUserId: DEALER_B,
    amount: "67000.00",
  });

  row.selected_offer_id = offerA.id;
  row.selected_offer_at = new Date(NOW - 5 * 60000).toISOString();
  row.status = status;

  db.saleRequestOfferSelections.push({
    id: db.nextSelectionId++,
    sale_request_id: row.id,
    offer_id: offerA.id,
    advertiser_id: STORE_A,
    selected_by_user_id: OWNER_ID,
    amount_snapshot: PRELIMINARY,
    selected_at: row.selected_offer_at,
  });

  const inspection = {
    id: db.nextInspectionId++,
    sale_request_id: row.id,
    advertiser_id: STORE_A,
    schedule_status: "completed",
    schedule_round: 1,
    confirmed_slot_id: null,
    scheduled_at: new Date(NOW - 3 * 3600000).toISOString(),
    completed_at: new Date(NOW - 2 * 3600000).toISOString(),
    completed_by_user_id: DEALER_A,
    created_by_user_id: DEALER_A,
    observed_mileage: 64230,
    observed_condition: "regular",
    observed_tire_condition: "replace_now",
    observed_engine_condition: "ok",
    observed_gearbox_condition: "ok",
    observed_suspension_condition: "issue",
    observed_body_paint_status: "issues",
    observed_body_paint_issues: ["scratches", "dents"],
    inspection_notes: "Suspensão dianteira com ruído.",
    created_at: new Date(NOW - 4 * 3600000).toISOString(),
  };
  db.saleRequestInspections.push(inspection);

  const decision = {
    id: db.nextDecisionId++,
    sale_request_id: row.id,
    inspection_id: inspection.id,
    advertiser_id: STORE_A,
    selected_offer_id: offerA.id,
    decision_type: decisionType,
    preliminary_amount_snapshot: PRELIMINARY,
    final_amount: decisionType === "final_offer" ? finalAmount : null,
    adjustment_reason: decisionType === "final_offer" ? "tires" : "mechanical",
    adjustment_note: null,
    // A nota OPERACIONAL da loja. Está no fixture justamente para que os testes
    // de privacidade tenham o que procurar — se ela não existisse aqui, "não
    // vazou" seria uma afirmação sobre o nada.
    internal_note: "Margem apertada, avisar o gerente antes de fechar.",
    decided_by_user_id: DEALER_A,
    created_at: new Date(NOW - 1 * 3600000).toISOString(),
  };
  db.saleRequestDecisions.push(decision);

  return { row, offerA, inspection, decision };
}

/** O mesmo cenário, mas parando ANTES da proposta final. */
function seedInspectionCompleted() {
  const row = seedRequest();
  const offerA = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_A,
    dealerUserId: DEALER_A,
    amount: PRELIMINARY,
  });

  row.selected_offer_id = offerA.id;
  row.selected_offer_at = new Date(NOW - 5 * 60000).toISOString();
  row.status = SALE_REQUEST_STATUS.INSPECTION_COMPLETED;

  db.saleRequestOfferSelections.push({
    id: db.nextSelectionId++,
    sale_request_id: row.id,
    offer_id: offerA.id,
    advertiser_id: STORE_A,
    selected_by_user_id: OWNER_ID,
    amount_snapshot: PRELIMINARY,
    selected_at: row.selected_offer_at,
  });

  db.saleRequestInspections.push({
    id: db.nextInspectionId++,
    sale_request_id: row.id,
    advertiser_id: STORE_A,
    schedule_status: "completed",
    schedule_round: 1,
    confirmed_slot_id: null,
    scheduled_at: new Date(NOW - 3 * 3600000).toISOString(),
    completed_at: new Date(NOW - 2 * 3600000).toISOString(),
    completed_by_user_id: DEALER_A,
    created_by_user_id: DEALER_A,
    observed_mileage: 64230,
    observed_condition: "regular",
    observed_tire_condition: "replace_now",
    observed_engine_condition: "ok",
    observed_gearbox_condition: "ok",
    observed_suspension_condition: "issue",
    observed_body_paint_status: "issues",
    observed_body_paint_issues: ["scratches"],
    inspection_notes: null,
    created_at: new Date(NOW - 4 * 3600000).toISOString(),
  });

  return { row, offerA };
}

// ── helpers de request ──────────────────────────────────────────────────────

const asDealer = (req, user) => req.set("x-test-user", user).set("x-test-account", "CNPJ");

function respond(app, { user = OWNER_ID, id, body }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/final-offer-decision`)
    .set("x-test-user", user)
    .send(body === undefined ? {} : body);
}

function ownerDetail(app, { user = OWNER_ID, id }) {
  return request(app).get(`${OWNER_BASE}/${id}`).set("x-test-user", user);
}

function dealerDetail(app, { user = DEALER_A, id }) {
  return asDealer(request(app).get(`${DEALER_BASE}/${id}`), user);
}

function cancel(app, { user = OWNER_ID, id }) {
  return request(app).post(`${OWNER_BASE}/${id}/cancel`).set("x-test-user", user).send();
}

const ownerDecisionsOf = (id) =>
  db.saleRequestOwnerDecisions.filter((d) => String(d.sale_request_id) === String(id));

const notificationsOf = (id) =>
  db.userNotifications.filter((n) => String(n.entity_id) === String(id));

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    nextRequestId: 1,
    nextImageId: 1,
    nextOfferId: 1,
    nextSelectionId: 1,
    nextNotificationId: 1,
    nextInspectionId: 1,
    nextSlotId: 1,
    nextDecisionId: 1,
    nextOwnerDecisionId: 1,
  });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
  seedDealer({ userId: DEALER_B, id: STORE_B, name: "Prime Veículos" });
});

// ============================================================================
describe("aceite (§14)", () => {
  it("o proprietário aceita e a solicitação vai para final_offer_accepted", async () => {
    const { row } = seedFinalOffer();
    const response = await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(response.body.owner_final_decision.type).toBe("accepted");
    expect(db.saleRequests[0].status).toBe("final_offer_accepted");
  });

  it("grava UMA linha na trilha, com o valor da proposta final", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    const trail = ownerDecisionsOf(row.id);
    expect(trail).toHaveLength(1);
    expect(trail[0].decision_type).toBe("accepted");
    expect(trail[0].final_amount_snapshot).toBe(FINAL);
    expect(trail[0].advertiser_id).toBe(STORE_A);
    expect(trail[0].decided_by_user_id).toBe(OWNER_ID);
  });

  /**
   * §7 — a trilha é um EVENTO, e evento não tem estado nem revisão.
   *
   * A ausência é a asserção: `updated_at`, `deleted_at` e `status` numa linha de
   * trilha são o convite para "corrigir" uma decisão já tomada, e o valor de uma
   * trilha é justamente não poder ser corrigida.
   */
  it("a linha da trilha não tem updated_at, deleted_at nem status", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    const [entry] = ownerDecisionsOf(row.id);
    expect(entry).not.toHaveProperty("updated_at");
    expect(entry).not.toHaveProperty("deleted_at");
    expect(entry).not.toHaveProperty("status");
  });

  it("o tipo de origem gravado é final_offer — escrito pelo repositório, não pelo corpo", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), {
      id: row.id,
      // Mesmo com o cliente tentando declarar outra coisa.
      body: { decision: "accepted", post_inspection_decision_type: "no_offer" },
    });

    expect(ownerDecisionsOf(row.id)[0].post_inspection_decision_type).toBe("final_offer");
  });
});

// ============================================================================
describe("recusa (§15)", () => {
  it("o proprietário recusa e a solicitação vai para final_offer_rejected", async () => {
    const { row } = seedFinalOffer();
    const response = await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(response.body.owner_final_decision.type).toBe("rejected");
    expect(db.saleRequests[0].status).toBe("final_offer_rejected");
  });

  /** §15 — recusar não exige justificativa. Nenhuma. */
  it("recusa SEM motivo é aceita, e nenhum campo de motivo é exigido", async () => {
    const { row } = seedFinalOffer();
    const response = await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    expect(response.status).toBe(200);
    expect(ownerDecisionsOf(row.id)).toHaveLength(1);
  });

  /**
   * §15 — a recusa não apaga nada, e não reabre nada.
   *
   * É o teste que impede a "melhoria" mais provável desta fase: alguém decide
   * que recusar deveria devolver a solicitação para a disputa, e apaga a seleção
   * para conseguir. As três trilhas continuam onde estavam.
   */
  it("recusar preserva seleção, inspeção e proposta final — e NÃO reabre a disputa", async () => {
    const { row, inspection, decision } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    expect(db.saleRequestOfferSelections).toHaveLength(1);
    expect(db.saleRequestInspections.find((i) => i.id === inspection.id)).toBeTruthy();
    expect(db.saleRequestDecisions.find((d) => d.id === decision.id)).toBeTruthy();

    const after = db.saleRequests[0];
    expect(after.status).toBe("final_offer_rejected");
    expect(after.status).not.toBe("receiving_offers");
    // A seleção continua apontada — o CHECK da 059 exige, e a tela depende.
    expect(after.selected_offer_id).toBeTruthy();
    expect(after.selected_offer_at).toBeTruthy();
  });

  /** A proposta final continua exatamente como a loja a gravou. */
  it("a proposta final permanece IMUTÁVEL depois da recusa", async () => {
    const { row, decision } = seedFinalOffer();
    const before = { ...decision };

    await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    expect(db.saleRequestDecisions.find((d) => d.id === decision.id)).toEqual(before);
  });
});

// ============================================================================
describe("autorização (§12)", () => {
  it("OUTRA pessoa física recebe 404 — indistinguível de inexistente", async () => {
    const { row } = seedFinalOffer();
    const response = await respond(buildApp(), {
      user: OTHER_OWNER_ID,
      id: row.id,
      body: { decision: "accepted" },
    });

    expect(response.status).toBe(404);
    // Corpo enxuto: sem mensagem, sem campo, sem id. Quem sonda ids não aprende
    // se a solicitação existe.
    expect(response.body).toEqual({ success: false, error: "not_found" });
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
    expect(db.saleRequests[0].status).toBe("final_offer_submitted");
  });

  it("o LOJISTA não decide por esta rota — nem o selecionado", async () => {
    const { row } = seedFinalOffer();
    const response = await request(buildApp())
      .post(`${OWNER_BASE}/${row.id}/final-offer-decision`)
      .set("x-test-user", DEALER_A)
      .set("x-test-account", "CNPJ")
      .send({ decision: "accepted" });

    // A rota é do dono: o `owner_user_id` do WHERE não casa com a conta da loja.
    expect(response.status).toBe(404);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
  });

  /**
   * §12 — `owner_user_id` do corpo é ignorado, e não "validado".
   *
   * A diferença importa: uma validação pode ser afrouxada por engano; a ausência
   * do código que leria o campo não pode.
   */
  it("owner_user_id enviado no corpo não muda nada", async () => {
    const { row } = seedFinalOffer();
    const response = await respond(buildApp(), {
      user: OTHER_OWNER_ID,
      id: row.id,
      body: { decision: "accepted", owner_user_id: OWNER_ID },
    });

    expect(response.status).toBe(404);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
  });

  it("sem sessão é 401", async () => {
    const { row } = seedFinalOffer();
    const response = await request(buildApp())
      .post(`${OWNER_BASE}/${row.id}/final-offer-decision`)
      .send({ decision: "accepted" });

    expect(response.status).toBe(401);
  });
});

// ============================================================================
describe("o valor NUNCA vem do cliente (§8, §35)", () => {
  it("aceitar sem enviar valor nenhum grava o valor da proposta final", async () => {
    const { row } = seedFinalOffer({ finalAmount: "60000.00" });
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(ownerDecisionsOf(row.id)[0].final_amount_snapshot).toBe("60000.00");
  });

  /**
   * O teste crítico do §35: o navegador manda `final_amount: 1`.
   *
   * Idealmente o campo nem é lido — e não é: não existe código neste caminho que
   * o leia. A asserção prova o resultado observável dessa ausência.
   */
  it("final_amount forjado no corpo é INERTE", async () => {
    const { row } = seedFinalOffer({ finalAmount: "60000.00" });
    const response = await respond(buildApp(), {
      id: row.id,
      body: {
        decision: "accepted",
        final_amount: 1,
        preliminary_amount: 1,
        advertiser_id: STORE_B,
      },
    });

    expect(response.status).toBe(200);

    const [entry] = ownerDecisionsOf(row.id);
    expect(entry.final_amount_snapshot).toBe("60000.00");
    // E a loja gravada é a SELECIONADA, não a que o corpo tentou indicar.
    expect(entry.advertiser_id).toBe(STORE_A);
    expect(response.body.owner_final_decision.final_amount).toBe("60000.00");
  });
});

// ============================================================================
describe("pré-condições (§13)", () => {
  it("final_offer_declined NÃO pode ser aceito — não há proposta", async () => {
    const { row } = seedFinalOffer({
      decisionType: "no_offer",
      status: SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED,
    });

    const response = await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("OWNER_FINAL_DECISION_INVALID_STATE");
    // E a mensagem diz O QUE aconteceu, em vez de "estado inválido".
    expect(response.body.message).toMatch(/sem apresentar proposta final/i);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
    expect(db.saleRequests[0].status).toBe("final_offer_declined");
  });

  it("final_offer_declined também não pode ser RECUSADO", async () => {
    const { row } = seedFinalOffer({
      decisionType: "no_offer",
      status: SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED,
    });

    const response = await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    expect(response.status).toBe(409);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
  });

  it("inspection_completed SEM proposta final não pode ser decidido", async () => {
    const { row } = seedInspectionCompleted();
    const response = await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/ainda não tem uma proposta final/i);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
  });

  it("receiving_offers não pode ser decidido", async () => {
    const row = seedRequest();
    const response = await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(response.status).toBe(409);
    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
  });

  it("cancelled não pode ser decidido, e a mensagem diz isso", async () => {
    const row = seedRequest({ status: "cancelled" });
    const response = await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/cancelada/i);
  });

  it("decision ausente ou fora do vocabulário é 400", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();

    for (const body of [{}, { decision: "" }, { decision: "talvez" }, { decision: "accept" }]) {
      const response = await respond(app, { id: row.id, body });
      expect(response.status).toBe(400);
      expect(response.body.details?.code).toBe("OWNER_FINAL_DECISION_INVALID");
    }

    expect(ownerDecisionsOf(row.id)).toHaveLength(0);
    expect(db.saleRequests[0].status).toBe("final_offer_submitted");
  });
});

// ============================================================================
describe("idempotência e decisão oposta (§16)", () => {
  it("repetir ACCEPTED devolve 200 com changed: false, sem segunda linha", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();

    const first = await respond(app, { id: row.id, body: { decision: "accepted" } });
    const second = await respond(app, { id: row.id, body: { decision: "accepted" } });

    expect(first.body.changed).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);
    expect(second.body.owner_final_decision.type).toBe("accepted");

    expect(ownerDecisionsOf(row.id)).toHaveLength(1);
    expect(notificationsOf(row.id)).toHaveLength(1);
  });

  it("repetir REJECTED devolve 200 com changed: false, sem segunda linha", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();

    await respond(app, { id: row.id, body: { decision: "rejected" } });
    const second = await respond(app, { id: row.id, body: { decision: "rejected" } });

    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);
    expect(ownerDecisionsOf(row.id)).toHaveLength(1);
    expect(notificationsOf(row.id)).toHaveLength(1);
  });

  it("accepted → rejected é 409, e nada muda", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();

    await respond(app, { id: row.id, body: { decision: "accepted" } });
    const opposite = await respond(app, { id: row.id, body: { decision: "rejected" } });

    expect(opposite.status).toBe(409);
    expect(opposite.body.details?.code).toBe("OWNER_FINAL_DECISION_ALREADY_DECIDED");

    expect(ownerDecisionsOf(row.id)).toHaveLength(1);
    expect(ownerDecisionsOf(row.id)[0].decision_type).toBe("accepted");
    expect(db.saleRequests[0].status).toBe("final_offer_accepted");
    expect(notificationsOf(row.id)).toHaveLength(1);
  });

  it("rejected → accepted é 409, e nada muda", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();

    await respond(app, { id: row.id, body: { decision: "rejected" } });
    const opposite = await respond(app, { id: row.id, body: { decision: "accepted" } });

    expect(opposite.status).toBe(409);
    expect(ownerDecisionsOf(row.id)).toHaveLength(1);
    expect(ownerDecisionsOf(row.id)[0].decision_type).toBe("rejected");
    expect(db.saleRequests[0].status).toBe("final_offer_rejected");
    expect(notificationsOf(row.id)).toHaveLength(1);
  });

  /**
   * §17, na parte que um fake CONSEGUE provar: o estado e a trilha concordam.
   *
   * A serialização sob concorrência real é do arquivo de PostgreSQL. O que se
   * prova aqui é a outra metade: os dois lados saem da MESMA entrada, então a
   * combinação cruzada não é "proibida" — é inexprimível.
   */
  it("estado e trilha nunca divergem, nos dois caminhos", async () => {
    const app = buildApp();
    const pairs = [
      ["accepted", "final_offer_accepted"],
      ["rejected", "final_offer_rejected"],
    ];

    for (const [decision, expected] of pairs) {
      const { row } = seedFinalOffer();
      await respond(app, { id: row.id, body: { decision } });

      const stored = db.saleRequests.find((r) => r.id === row.id);
      expect(stored.status).toBe(expected);
      expect(ownerDecisionsOf(row.id)[0].decision_type).toBe(decision);
    }
  });
});

// ============================================================================
describe("notificações (§19)", () => {
  it("o aceite avisa a LOJA SELECIONADA, e só ela", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    const sent = notificationsOf(row.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].recipient_user_id).toBe(DEALER_A);
    expect(sent[0].event_type).toBe("sale_request.final_offer_accepted");
    expect(sent[0].action_path).toBe(`/dashboard-loja/oportunidades/veiculos/${row.id}`);
  });

  it("a recusa avisa a loja selecionada com o evento próprio", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "rejected" } });

    const sent = notificationsOf(row.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].recipient_user_id).toBe(DEALER_A);
    expect(sent[0].event_type).toBe("sale_request.final_offer_rejected");
  });

  /** §19 — as lojas CONCORRENTES não são notificadas de nada. */
  it("a loja perdedora NÃO recebe notificação", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    const toLoser = db.userNotifications.filter((n) => String(n.recipient_user_id) === DEALER_B);
    expect(toLoser).toHaveLength(0);
  });

  /**
   * §19/§31 — o aviso não carrega dado pessoal.
   *
   * A varredura é sobre o objeto INTEIRO serializado, e não sobre campos
   * escolhidos a dedo: um campo novo que trouxesse contato passaria despercebido
   * por uma asserção campo a campo.
   */
  it("a notificação não carrega telefone, e-mail, CPF nem endereço", async () => {
    const { row } = seedFinalOffer();
    await respond(buildApp(), { id: row.id, body: { decision: "accepted" } });

    const raw = JSON.stringify(notificationsOf(row.id)[0]);
    expect(raw).not.toMatch(/whatsapp|telefone|phone|e-?mail|cpf|cnpj|endereç/i);
    // E o payload traz APENAS o valor — que a loja já conhece, porque o propôs.
    expect(notificationsOf(row.id)[0].payload).toEqual({ final_amount: FINAL });
  });

  /**
   * §41 — a notificação não afirma conclusão de venda.
   *
   * Um lojista que lesse "Venda concluída" no sino pararia de tratar o carro
   * como disponível, e é exatamente a leitura que este produto não pode induzir.
   */
  it("nenhum texto da notificação afirma venda concluída", async () => {
    const app = buildApp();
    for (const decision of ["accepted", "rejected"]) {
      const { row } = seedFinalOffer();
      await respond(app, { id: row.id, body: { decision } });

      const raw = JSON.stringify(notificationsOf(row.id));
      expect(raw).not.toMatch(
        /venda conclu|ve[íi]culo vendido|neg[óo]cio fechado|pagamento realizado|compra conclu|transfer[êe]ncia conclu/i
      );
    }
  });
});

// ============================================================================
describe("DTO do proprietário (§23, §24, §29)", () => {
  it("antes da decisão, owner_final_decision é null", async () => {
    const { row } = seedFinalOffer();
    const response = await ownerDetail(buildApp(), { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.owner_final_decision).toBeNull();
    // E a proposta final continua visível — é o que a tela mostra ao lado dos
    // botões.
    expect(response.body.final_decision.final_amount).toBe(FINAL);
  });

  it("depois do aceite, o detalhe traz type, final_amount e decided_at — e nada além", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "accepted" } });

    const response = await ownerDetail(app, { id: row.id });

    expect(response.body.sale_request.status).toBe("final_offer_accepted");
    expect(Object.keys(response.body.owner_final_decision).sort()).toEqual([
      "decided_at",
      "final_amount",
      "type",
    ]);
    expect(response.body.owner_final_decision.type).toBe("accepted");
    expect(response.body.owner_final_decision.final_amount).toBe(FINAL);
  });

  it("depois da recusa, o detalhe traz a recusa e mantém o histórico", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "rejected" } });

    const response = await ownerDetail(app, { id: row.id });

    expect(response.body.sale_request.status).toBe("final_offer_rejected");
    expect(response.body.owner_final_decision.type).toBe("rejected");
    // A proposta final e a inspeção continuam disponíveis para leitura.
    expect(response.body.final_decision.final_amount).toBe(FINAL);
    expect(response.body.inspection.observed.mileage).toBe(64230);
    // E a proposta selecionada continua sendo a âncora da comparação.
    expect(response.body.selected_offer).toBeTruthy();
  });

  /**
   * §24 — a lista de propostas antigas NÃO reaparece depois da recusa.
   *
   * Voltar a oferecê-las diria que elas ainda valem, e elas não valem: a disputa
   * acabou na 4.4 e esta fase não a reabre.
   */
  it("a lista de propostas continua vazia depois da recusa", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "rejected" } });

    const response = await ownerDetail(app, { id: row.id });
    expect(response.body.proposals).toEqual([]);
  });

  /** §31 — a nota interna da loja nunca atravessa a fronteira. */
  it("internal_note não aparece em nenhum lugar do DTO do proprietário", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "accepted" } });

    const raw = JSON.stringify(await ownerDetail(app, { id: row.id }).then((r) => r.body));
    expect(raw).not.toMatch(/internal_note|Margem apertada/i);
  });
});

// ============================================================================
describe("DTO do lojista (§25, §26, §30)", () => {
  it("a loja selecionada vê o ACEITE, sem o valor duplicado e sem contato", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "accepted" } });

    const response = await dealerDetail(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.sale_opportunity.owner_final_decision.type).toBe("accepted");
    // Duas chaves, e o valor NÃO está entre elas: a loja já o conhece por
    // `final_decision.final_amount`, que ela mesma preencheu.
    expect(Object.keys(response.body.sale_opportunity.owner_final_decision).sort()).toEqual([
      "decided_at",
      "type",
    ]);
    expect(response.body.sale_opportunity.final_decision.final_amount).toBe(FINAL);
  });

  it("a loja selecionada vê a RECUSA", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "rejected" } });

    const response = await dealerDetail(app, { id: row.id });
    expect(response.body.sale_opportunity.owner_final_decision.type).toBe("rejected");
  });

  /**
   * §40 — a loja selecionada continua enxergando a oportunidade DEPOIS da
   * decisão.
   *
   * É a regressão que a 4.5 já sofreu uma vez: uma igualdade de status que
   * envelheceu fez `is_selected` virar `false` e a tela da loja escolhida voltar
   * a exibir o formulário de proposta. Aqui a lista cresceu de novo.
   */
  it("is_selected continua true nos DOIS estados novos", async () => {
    const app = buildApp();

    for (const decision of ["accepted", "rejected"]) {
      const { row } = seedFinalOffer();
      await respond(app, { id: row.id, body: { decision } });

      const response = await dealerDetail(app, { id: row.id });
      expect(response.status).toBe(200);
      expect(response.body.sale_opportunity.is_selected).toBe(true);
      expect(response.body.sale_opportunity.selected_amount).toBe(PRELIMINARY);
    }
  });

  it("a loja PERDEDORA continua recebendo 404 depois da decisão", async () => {
    const app = buildApp();

    for (const decision of ["accepted", "rejected"]) {
      const { row } = seedFinalOffer();
      await respond(app, { id: row.id, body: { decision } });

      const response = await dealerDetail(app, { user: DEALER_B, id: row.id });
      expect(response.status).toBe(404);
    }
  });

  /** §30/§31 — nada do proprietário atravessa, em nenhum dos dois estados. */
  it("o DTO do lojista não carrega owner_user_id nem contato da PF", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "accepted" } });

    const raw = JSON.stringify(await dealerDetail(app, { id: row.id }).then((r) => r.body));
    expect(raw).not.toMatch(/owner_user_id|decided_by_user_id|whatsapp|telefone|cpf/i);
  });
});

// ============================================================================
describe("cancelamento depois da decisão (§28)", () => {
  /**
   * O guard usa `SALE_REQUEST_SELECTED_STATUSES`, e é por isso que ele cresceu
   * junto com a máquina. Uma igualdade com `OFFER_SELECTED` — a forma original,
   * consertada na 4.4.1 — voltaria a responder 200 aqui, dizendo "cancelada"
   * sobre uma solicitação cuja proposta acabou de ser aceita.
   */
  it("cancelar depois de ACEITAR é 409, e não um 200 falso", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "accepted" } });

    const response = await cancel(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
    expect(db.saleRequests[0].status).toBe("final_offer_accepted");
  });

  it("cancelar depois de RECUSAR também é 409", async () => {
    const { row } = seedFinalOffer();
    const app = buildApp();
    await respond(app, { id: row.id, body: { decision: "rejected" } });

    const response = await cancel(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(db.saleRequests[0].status).toBe("final_offer_rejected");
  });

  /**
   * §28/§40 — a varredura completa, e não só os dois estados novos.
   *
   * Percorre TODOS os estados pós-seleção. É o teste que a 4.5 provou ser
   * necessário: o defeito daquela fase não foi um estado esquecido, foi uma
   * LISTA que parou de acompanhar a máquina — e um teste que só olhasse para o
   * estado recém-criado teria passado enquanto os quatro anteriores quebravam.
   */
  it("nenhum estado pós-seleção volta para cancelled pelo fluxo antigo", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_SELECTED_STATUSES) {
      const { row } = seedFinalOffer({ status });
      const response = await cancel(app, { id: row.id });

      expect(response.status, `estado ${status}`).toBe(409);
      expect(db.saleRequests.find((r) => r.id === row.id).status).toBe(status);
    }
  });
});

// ============================================================================
describe("a máquina de estados não deixou ninguém para trás (§40)", () => {
  /**
   * A regressão que a 4.5 pagou duas vezes: uma igualdade que valia enquanto
   * existia apenas um estado posterior.
   *
   * A lista de estados COM seleção é a partição do CHECK da 059, e ela precisa
   * conter os dois estados novos. Sem isso, três defeitos silenciosos e
   * independentes aparecem de uma vez — cancelamento com 200 falso, tela do
   * proprietário sem a proposta selecionada, e 404 para a loja escolhida.
   */
  it("os dois estados novos estão em SALE_REQUEST_SELECTED_STATUSES", () => {
    expect(SALE_REQUEST_SELECTED_STATUSES).toContain("final_offer_accepted");
    expect(SALE_REQUEST_SELECTED_STATUSES).toContain("final_offer_rejected");
  });

  it("todo estado pós-seleção mantém a proposta selecionada e a inspeção no DTO do dono", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_SELECTED_STATUSES) {
      const { row } = seedFinalOffer({ status });
      const response = await ownerDetail(app, { id: row.id });

      expect(response.status, `estado ${status}`).toBe(200);
      expect(response.body.selected_offer, `estado ${status}`).toBeTruthy();
      expect(response.body.inspection, `estado ${status}`).toBeTruthy();
    }
  });

  it("todo estado pós-seleção mantém a loja selecionada com acesso à oportunidade", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_SELECTED_STATUSES) {
      const { row } = seedFinalOffer({ status });
      const response = await dealerDetail(app, { id: row.id });

      expect(response.status, `estado ${status}`).toBe(200);
      expect(response.body.sale_opportunity.is_selected, `estado ${status}`).toBe(true);
    }
  });
});
