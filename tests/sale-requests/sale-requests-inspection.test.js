// A AVALIAÇÃO PRESENCIAL e a PROPOSTA FINAL — a regra, o que ela recusa e o que
// ela nunca revela (Fase 4.5).
//
// Os dois routers reais são montados em apps Express de verdade. As duas pontas
// aparecem no mesmo arquivo de propósito: a regra desta fase é sobre o que
// acontece com AMBAS, e um teste que só olhasse para a loja não veria a metade
// que envolve o proprietário.
//
// ────────────────────────────────────────────────────────────────────────────
// A FRONTEIRA DESTE ARQUIVO, DECLARADA
// ────────────────────────────────────────────────────────────────────────────
// Aqui se prova a REGRA e o ALCANCE dela. A SERIALIZAÇÃO sob concorrência real
// (§13, §37), a atomicidade da notificação e os CHECKs do banco têm arquivo
// próprio contra PostgreSQL de verdade
// (tests/integration/sale-request-inspection-final-offer.integration.test.js),
// porque um fake com um array e uma "conexão" só não disputa nada — um service
// SEM transação nenhuma passaria em todos os casos deste arquivo.

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

const NOW = Date.parse("2026-08-22T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const OWNER_ID = "7";
const OTHER_OWNER_ID = "9";
const DEALER_A = "20";
const DEALER_B = "21";
const STORE_A = 100;
const STORE_B = 200;

/** Um instante futuro, em ISO COM offset — o formato que o servidor exige. */
function futureIso(hoursAhead, offset = "-03:00") {
  const date = new Date(NOW + hoursAhead * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00${offset === "Z" ? "Z" : offset}`;
}

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
 * O cenário padrão: proposta da loja A selecionada por R$ 65.000.
 *
 * O piso do proprietário é R$ 62.500 e a loja B tinha oferecido R$ 67.000 — os
 * dois números existem para que os testes de proposta final possam provar que
 * NENHUM deles é barreira depois da inspeção.
 */
function seedSelected(overrides = {}) {
  const row = seedRequest();
  const offerA = seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_A,
    dealerUserId: DEALER_A,
    amount: "65000.00",
  });
  seedOffer({
    saleRequestId: row.id,
    advertiserId: STORE_B,
    dealerUserId: DEALER_B,
    amount: "67000.00",
  });

  row.status = "offer_selected";
  row.selected_offer_id = offerA.id;
  row.selected_offer_at = new Date(NOW - 5 * 60000).toISOString();

  db.saleRequestOfferSelections.push({
    id: db.nextSelectionId++,
    sale_request_id: row.id,
    offer_id: offerA.id,
    advertiser_id: STORE_A,
    selected_by_user_id: OWNER_ID,
    amount_snapshot: "65000.00",
    selected_at: row.selected_offer_at,
  });

  Object.assign(row, overrides);
  return { row, offerA };
}

// ── helpers de request ──────────────────────────────────────────────────────

const asDealer = (req, user) =>
  req.set("x-test-user", user).set("x-test-account", "CNPJ");

function sendSlots(app, { user = DEALER_A, id, slots }) {
  return asDealer(request(app).post(`${DEALER_BASE}/${id}/inspection/slots`), user).send({
    slots,
  });
}

function confirmSlot(app, { user = OWNER_ID, id, slotId }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/inspection/confirm`)
    .set("x-test-user", user)
    .send(slotId === undefined ? {} : { slot_id: slotId });
}

function requestNewSlots(app, { user = OWNER_ID, id }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/inspection/request-slots`)
    .set("x-test-user", user)
    .send();
}

const FULL_FORM = {
  observed_mileage: "64230",
  observed_condition: "regular",
  observed_tire_condition: "replace_now",
  observed_engine_condition: "ok",
  observed_gearbox_condition: "ok",
  observed_suspension_condition: "issue",
  observed_body_paint_status: "issues",
  observed_body_paint_issues: ["scratches", "dents"],
  inspection_notes: "Suspensão dianteira com ruído.",
};

function completeInspection(app, { user = DEALER_A, id, form = FULL_FORM }) {
  return asDealer(
    request(app).post(`${DEALER_BASE}/${id}/inspection/complete`),
    user
  ).send(form);
}

function decide(app, { user = DEALER_A, id, body }) {
  return asDealer(request(app).post(`${DEALER_BASE}/${id}/decision`), user).send(body);
}

function ownerDetail(app, { user = OWNER_ID, id }) {
  return request(app).get(`${OWNER_BASE}/${id}`).set("x-test-user", user);
}

function dealerDetail(app, { user = DEALER_A, id }) {
  return asDealer(request(app).get(`${DEALER_BASE}/${id}`), user);
}

/** Leva a solicitação até `inspection_scheduled`. Devolve o slot confirmado. */
async function scheduleInspection(app, id) {
  await sendSlots(app, { id, slots: [futureIso(48), futureIso(72)] });
  const slot = db.saleRequestInspectionSlots.find((s) => s.round_no === 1);
  await confirmSlot(app, { id, slotId: slot.id });
  return slot;
}

/** Leva até `inspection_completed`. */
async function runInspection(app, id) {
  await scheduleInspection(app, id);
  await completeInspection(app, { id });
}

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
  });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
  seedDealer({ userId: DEALER_B, id: STORE_B, name: "Prime Veículos" });
  // ATENÇÃO: o fake-db aceitaria dois advertisers com o MESMO id, e o
  // PostgreSQL não — `id` é PRIMARY KEY. "Dois operadores da mesma loja" é
  // inexprimível no schema atual (`advertisers` tem UM `user_id`, sem tabela de
  // membros), e semear isso aqui faria o teste provar algo que o banco recusa.
  //
  // O que a autorização por ADVERTISER garante — e o que os testes provam — é
  // que a permissão nunca é comparada com `dealer_user_id`. Ver o teste da loja
  // perdedora e o describe equivalente na suíte de integração.
});

// ============================================================================
describe("agendamento — quem pode propor horários", () => {
  it("a loja SELECIONADA envia horários e a solicitação continua em offer_selected", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), { id: row.id, slots: [futureIso(48)] });

    expect(response.status).toBe(201);
    expect(response.body.inspection.state).toBe("awaiting_owner");
    expect(response.body.inspection.round).toBe(1);

    // O agendamento é SUB-PROCESSO: não promove status da oportunidade (§5).
    expect(db.saleRequests[0].status).toBe("offer_selected");
  });

  /**
   * §4 — a autorização é resolvida pela LOJA, nunca pelo operador.
   *
   * O código nunca compara quem age com o `dealer_user_id` que enviou a proposta
   * preliminar: a guarda é `o.advertiser_id = $2` no lock. Este teste trava esse
   * desenho pelo lado que o schema permite exercitar — o autor do ato é
   * REGISTRADO, e o registro é auditoria, não permissão.
   *
   * (O schema atual tem UM `user_id` por advertiser, então "outro operador da
   * mesma loja" ainda não existe. Quando existir, nada nesta camada muda.)
   */
  it("registra o AUTOR do ato sem usá-lo como permissão", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), { id: row.id, slots: [futureIso(48)] });

    expect(response.status).toBe(201);
    expect(String(db.saleRequestInspectionSlots[0].created_by_user_id)).toBe(DEALER_A);
  });

  it("a loja PERDEDORA recebe 404 e não cria inspeção", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), {
      user: DEALER_B,
      id: row.id,
      slots: [futureIso(48)],
    });

    expect(response.status).toBe(404);
    expect(db.saleRequestInspections).toHaveLength(0);
  });

  it("sem endereço comercial, o envio é bloqueado com código próprio", async () => {
    db.advertisers = db.advertisers.map((a) =>
      a.id === STORE_A ? { ...a, address: "   " } : a
    );
    const { row } = seedSelected();

    const response = await sendSlots(buildApp(), { id: row.id, slots: [futureIso(48)] });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("INSPECTION_STORE_LOCATION_REQUIRED");
    // A resposta diz ONDE resolver — a rota real, verificada na auditoria.
    expect(response.body.details?.action_path).toBe("/dashboard-loja/dados");
  });
});

// ============================================================================
describe("agendamento — a forma dos horários", () => {
  it("aceita 1, 2 e 3 horários", async () => {
    for (const count of [1, 2, 3]) {
      resetDb({ cities: [ATIBAIA, BRAGANCA], nextRequestId: 1, nextOfferId: 1 });
      seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
      const { row } = seedSelected();

      const slots = Array.from({ length: count }, (_, i) => futureIso(48 + i * 24));
      const response = await sendSlots(buildApp(), { id: row.id, slots });

      expect(response.status).toBe(201);
      expect(response.body.inspection.slots).toHaveLength(count);
    }
  });

  it("recusa 0 horários", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), { id: row.id, slots: [] });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_SLOT_COUNT");
  });

  it("recusa 4 horários", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), {
      id: row.id,
      slots: [futureIso(24), futureIso(48), futureIso(72), futureIso(96)],
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_SLOT_COUNT");
  });

  it("recusa horários duplicados", async () => {
    const { row } = seedSelected();
    const response = await sendSlots(buildApp(), {
      id: row.id,
      slots: [futureIso(48), futureIso(48)],
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_DUPLICATE_SLOT");
  });

  /**
   * O MESMO instante escrito com fusos diferentes é duplicata.
   *
   * A comparação é sobre o INSTANTE, não sobre o texto — aceitá-los como dois
   * horários poria dois botões idênticos na tela do proprietário.
   */
  it("recusa o mesmo instante escrito com offsets diferentes", async () => {
    const { row } = seedSelected();
    const local = futureIso(48, "-03:00");
    const utc = new Date(local).toISOString().replace(/\.\d{3}Z$/, "Z");

    const response = await sendSlots(buildApp(), { id: row.id, slots: [local, utc] });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_DUPLICATE_SLOT");
  });

  it("recusa horário no passado", async () => {
    const { row } = seedSelected();
    const past = new Date(NOW - 3600000).toISOString().replace(/\.\d{3}Z$/, "Z");

    const response = await sendSlots(buildApp(), { id: row.id, slots: [past] });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_SLOT");
  });

  /**
   * §10 — O TESTE QUE PROTEGE O FUSO.
   *
   * `2026-08-25T14:30:00` sem offset não é um instante: é um texto que precisa de
   * um fuso para virar um. `Date.parse` o aceita e produz um valor plausível —
   * por isso a checagem não pode ser "deu para converter?", e sim sobre a FORMA.
   *
   * Se algum dia alguém "facilitar" aceitando o formato sem fuso, o servidor
   * passará a adivinhar — e o Render roda em UTC, então 14:30 viraria 11:30 na
   * tela do proprietário.
   */
  it("recusa timestamp SEM offset explícito", async () => {
    const { row } = seedSelected();

    const response = await sendSlots(buildApp(), {
      id: row.id,
      slots: ["2026-08-25T14:30:00"],
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_SLOT");
    expect(db.saleRequestInspectionSlots).toHaveLength(0);
  });

  it("aceita offset explícito, inclusive `Z`", async () => {
    const { row } = seedSelected();

    const response = await sendSlots(buildApp(), {
      id: row.id,
      slots: [futureIso(48, "Z")],
    });

    // `Z` É um offset explícito (zero) — quem manda `Z` está dizendo UTC, não
    // omitindo a informação.
    expect(response.status).toBe(201);
  });

  it("recusa data inexistente que passa pelo formato", async () => {
    const { row } = seedSelected();

    const response = await sendSlots(buildApp(), {
      id: row.id,
      slots: ["2026-02-31T10:00:00-03:00"],
    });

    expect(response.status).toBe(400);
  });
});

// ============================================================================
describe("agendamento — rodadas e escolha", () => {
  it("o proprietário vê os horários da rodada atual", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48), futureIso(72)] });

    const { body } = await ownerDetail(app, { id: row.id });

    expect(body.inspection.state).toBe("awaiting_owner");
    expect(body.inspection.slots).toHaveLength(2);
    // O endereço comercial acompanha — é o que a pessoa precisa para comparecer.
    expect(body.inspection.store.name).toBe("Auto Center Atibaia");
    expect(body.inspection.store.address).toBe("Rua das Lojas, 120");
    expect(body.inspection.store.city).toBe("Atibaia - SP");
  });

  it("confirmar um horário move para inspection_scheduled", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48), futureIso(72)] });

    const slot = db.saleRequestInspectionSlots[0];
    const response = await confirmSlot(app, { id: row.id, slotId: slot.id });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("inspection_scheduled");
    expect(String(db.saleRequestInspections[0].confirmed_slot_id)).toBe(String(slot.id));
  });

  it("uma NOVA rodada substitui a anterior, e o histórico permanece", async () => {
    const { row } = seedSelected();
    const app = buildApp();

    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    const oldSlot = db.saleRequestInspectionSlots[0];

    await requestNewSlots(app, { id: row.id });
    await sendSlots(app, { id: row.id, slots: [futureIso(96)] });

    // Os dois horários continuam no banco…
    expect(db.saleRequestInspectionSlots).toHaveLength(2);
    expect(db.saleRequestInspections[0].schedule_round).toBe(2);

    // …mas só o da rodada atual é oferecido.
    const { body } = await ownerDetail(app, { id: row.id });
    expect(body.inspection.slots).toHaveLength(1);
    expect(String(body.inspection.slots[0].id)).not.toBe(String(oldSlot.id));
  });

  /**
   * §11 — o horário OBSOLETO.
   *
   * O proprietário está com a tela aberta desde antes de a loja substituir os
   * horários. Confirmar o antigo marcaria uma visita num horário que a loja já
   * não oferece.
   */
  it("horário de rodada anterior é recusado com SLOT_STALE", async () => {
    const { row } = seedSelected();
    const app = buildApp();

    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    const staleSlot = db.saleRequestInspectionSlots[0];

    await requestNewSlots(app, { id: row.id });
    await sendSlots(app, { id: row.id, slots: [futureIso(96)] });

    const response = await confirmSlot(app, { id: row.id, slotId: staleSlot.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("INSPECTION_SLOT_STALE");
    expect(db.saleRequests[0].status).toBe("offer_selected");
  });

  it("retry do MESMO horário é idempotente", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    const slot = db.saleRequestInspectionSlots[0];

    const first = await confirmSlot(app, { id: row.id, slotId: slot.id });
    const retry = await confirmSlot(app, { id: row.id, slotId: slot.id });

    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(true);
    expect(retry.status).toBe(200);
    expect(retry.body.changed).toBe(false);
  });

  it("confirmar OUTRO horário depois é 409 — não há reagendamento", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48), futureIso(72)] });
    const [first, second] = db.saleRequestInspectionSlots;

    await confirmSlot(app, { id: row.id, slotId: first.id });
    const response = await confirmSlot(app, { id: row.id, slotId: second.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("INSPECTION_ALREADY_SCHEDULED");
    expect(String(db.saleRequestInspections[0].confirmed_slot_id)).toBe(String(first.id));
  });

  /**
   * §12 — "não consigo nesses horários" NÃO desfaz a seleção.
   *
   * É o teste que impede a ação de virar, por acidente, um cancelamento.
   */
  it("solicitar novos horários mantém a seleção da loja e o estado da disputa", async () => {
    const { row, offerA } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });

    const response = await requestNewSlots(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("offer_selected");
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offerA.id));
    expect(db.saleRequestInspections[0].schedule_status).toBe("awaiting_slots");
    // A trilha da seleção continua intacta.
    expect(db.saleRequestOfferSelections).toHaveLength(1);
  });

  it("o proprietário ERRADO recebe 404", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    const slot = db.saleRequestInspectionSlots[0];

    const response = await confirmSlot(app, {
      user: OTHER_OWNER_ID,
      id: row.id,
      slotId: slot.id,
    });

    expect(response.status).toBe(404);
  });
});

// ============================================================================
describe("a avaliação presencial", () => {
  it("só pode ser registrada depois do horário confirmado", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });

    const response = await completeInspection(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_STATE");
  });

  it("registra a ficha e move para inspection_completed", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const response = await completeInspection(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("inspection_completed");
    expect(db.saleRequestInspections[0].schedule_status).toBe("completed");
    expect(String(db.saleRequestInspections[0].completed_by_user_id)).toBe(DEALER_A);
  });

  /**
   * §20 e §45 — O TESTE QUE PROTEGE A DECLARAÇÃO DO PROPRIETÁRIO.
   *
   * A loja leu 64.230 km; a pessoa havia declarado 62.000. As duas versões
   * convivem. "Corrigir" o dado dela destruiria a prova de que houve
   * divergência — que é justamente o que justifica uma redução de valor depois.
   */
  it("o observado NÃO sobrescreve o declarado", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    await completeInspection(app, { id: row.id });

    // O declarado, intacto.
    expect(db.saleRequests[0].mileage).toBe(62000);
    expect(db.saleRequests[0].declared_condition).toBe("bom");

    // O observado, ao lado.
    expect(db.saleRequestInspections[0].observed_mileage).toBe(64230);
    expect(db.saleRequestInspections[0].observed_condition).toBe("regular");
  });

  it("a ficha é IMUTÁVEL — registrar de novo é 409", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await completeInspection(app, {
      id: row.id,
      form: { ...FULL_FORM, observed_mileage: "99999" },
    });

    expect(response.status).toBe(409);
    expect(db.saleRequestInspections[0].observed_mileage).toBe(64230);
  });

  it("recusa campo fora do vocabulário", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const response = await completeInspection(app, {
      id: row.id,
      form: { ...FULL_FORM, observed_tire_condition: "excelente_demais" },
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.field).toBe("observed_tire_condition");
  });

  it("`issues` exige ao menos um detalhe, e `none` proíbe detalhes", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const semDetalhe = await completeInspection(app, {
      id: row.id,
      form: { ...FULL_FORM, observed_body_paint_issues: [] },
    });
    expect(semDetalhe.status).toBe(400);
    expect(semDetalhe.body.details?.field).toBe("observed_body_paint_issues");

    const contraditorio = await completeInspection(app, {
      id: row.id,
      form: {
        ...FULL_FORM,
        observed_body_paint_status: "none",
        observed_body_paint_issues: ["dents"],
      },
    });
    expect(contraditorio.status).toBe(400);
  });

  it("a loja PERDEDORA não registra avaliação", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const response = await completeInspection(app, { user: DEALER_B, id: row.id });

    expect(response.status).toBe(404);
  });

  /**
   * §22 — sem relógio artificial.
   *
   * O horário confirmado é daqui a 48h e a avaliação é registrada AGORA. O carro
   * pode ter chegado antes; o relógio do servidor não sabe disso.
   */
  it("não exige que o horário agendado já tenha passado", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const response = await completeInspection(app, { id: row.id });

    expect(response.status).toBe(200);
  });
});

// ============================================================================
describe("a proposta final", () => {
  it("valor MAIOR que o preliminar é aceito, sem exigir motivo", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "70000.00" },
    });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("final_offer_submitted");
    expect(response.body.decision.difference).toBe("5000.00");
  });

  it("valor IGUAL é aceito, sem exigir motivo", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "65000.00" },
    });

    expect(response.status).toBe(200);
    expect(response.body.decision.difference).toBe("0.00");
  });

  /**
   * §44 — O TESTE CRÍTICO.
   *
   * Piso do proprietário: R$ 62.500. Preliminar selecionada: R$ 65.000. Maior
   * proposta da disputa: R$ 67.000. Final: R$ 60.000 — abaixo dos TRÊS.
   *
   * Tem de passar. Se algum dia alguém reaplicar aqui a regra da disputa "por
   * segurança", é este teste que cai — e a diferença entre um marketplace que
   * permite reavaliar depois de ver o carro e um que não permite é invisível em
   * qualquer outro teste desta suíte.
   */
  it("valor ABAIXO do piso, da preliminar e da maior proposta é ACEITO", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: {
        decision_type: "final_offer",
        final_amount: "60000.00",
        adjustment_reason: "mileage_difference",
        adjustment_note: "Odômetro 2.230 km acima do informado.",
      },
    });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("final_offer_submitted");

    // Abaixo do piso declarado (62.500)…
    expect(Number(response.body.decision.final_amount)).toBeLessThan(
      Number(db.saleRequests[0].minimum_accepted_price)
    );
    // …e abaixo da proposta selecionada (65.000).
    expect(response.body.decision.difference).toBe("-5000.00");
  });

  /**
   * §25 — a proteção que substituiu os pisos.
   *
   * O proprietário não pode receber R$ 65.000 → R$ 57.000 sem um motivo
   * registrado.
   */
  it("REDUÇÃO sem motivo é recusada", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "57000.00" },
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_ADJUSTMENT_REASON_REQUIRED");
    expect(db.saleRequestDecisions).toHaveLength(0);
  });

  it("motivo `other` sem nota é recusado", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: {
        decision_type: "final_offer",
        final_amount: "57000.00",
        adjustment_reason: "other",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_ADJUSTMENT_NOTE_REQUIRED");
  });

  it("valor não-positivo é recusado", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "0" },
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_FINAL_AMOUNT");
  });

  it("não pode ser enviada antes da avaliação registrada", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "60000.00" },
    });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("INSPECTION_INVALID_STATE");
  });
});

// ============================================================================
describe("a desistência (no_offer)", () => {
  it("registra a decisão e move para final_offer_declined", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "no_offer", adjustment_reason: "mechanical" },
    });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("final_offer_declined");
    expect(db.saleRequestDecisions[0].decision_type).toBe("no_offer");
    expect(db.saleRequestDecisions[0].final_amount).toBeNull();
  });

  it("SEMPRE exige motivo — mesmo sem valor", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "no_offer" },
    });

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe("INSPECTION_ADJUSTMENT_REASON_REQUIRED");
  });

  it("NÃO reabre a disputa nem volta para receiving_offers", async () => {
    const { row, offerA } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    await decide(app, {
      id: row.id,
      body: { decision_type: "no_offer", adjustment_reason: "documentation" },
    });

    expect(db.saleRequests[0].status).toBe("final_offer_declined");
    // A seleção continua registrada: a decisão de reabrir é da Fase 4.6.
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offerA.id));
  });
});

// ============================================================================
describe("idempotência e exclusividade da decisão", () => {
  it("retry da MESMA decisão é 200 e não duplica", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const body = { decision_type: "final_offer", final_amount: "70000.00" };
    const first = await decide(app, { id: row.id, body });
    const retry = await decide(app, { id: row.id, body });

    expect(first.body.changed).toBe(true);
    expect(retry.status).toBe(200);
    expect(retry.body.changed).toBe(false);
    expect(db.saleRequestDecisions).toHaveLength(1);
  });

  it("decisão DIFERENTE depois é 409 — não dá para corrigir o valor", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "70000.00" },
    });
    const second = await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "61000.00" },
    });

    expect(second.status).toBe(409);
    expect(second.body.details?.code).toBe("INSPECTION_FINAL_DECISION_ALREADY_RECORDED");
    expect(db.saleRequestDecisions[0].final_amount).toBe("70000.00");
  });

  it("proposta e desistência são mutuamente exclusivas", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "70000.00" },
    });
    const response = await decide(app, {
      id: row.id,
      body: { decision_type: "no_offer", adjustment_reason: "mechanical" },
    });

    expect(response.status).toBe(409);
    expect(db.saleRequests[0].status).toBe("final_offer_submitted");
    expect(db.saleRequestDecisions).toHaveLength(1);
  });
});

// ============================================================================
describe("notificações", () => {
  it("horários enviados avisam o PROPRIETÁRIO", async () => {
    const { row } = seedSelected();
    await sendSlots(buildApp(), { id: row.id, slots: [futureIso(48)] });

    const notification = db.userNotifications.at(-1);
    expect(String(notification.recipient_user_id)).toBe(OWNER_ID);
    expect(notification.event_type).toBe("sale_request.inspection_slots_offered");
  });

  it("horário confirmado avisa a LOJA (evento reaproveitado)", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await scheduleInspection(app, row.id);

    const notification = db.userNotifications.at(-1);
    expect(String(notification.recipient_user_id)).toBe(DEALER_A);
    // `appointment.confirmed` JÁ EXISTIA — reutilizado em vez de duplicado.
    expect(notification.event_type).toBe("appointment.confirmed");
  });

  it("novos horários solicitados avisam a LOJA", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    await requestNewSlots(app, { id: row.id });

    const notification = db.userNotifications.at(-1);
    expect(String(notification.recipient_user_id)).toBe(DEALER_A);
    expect(notification.event_type).toBe("sale_request.inspection_slots_requested");
  });

  it("proposta final avisa o PROPRIETÁRIO, e a desistência também", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);
    await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "60000.00", adjustment_reason: "tires" },
    });

    const notification = db.userNotifications.at(-1);
    expect(String(notification.recipient_user_id)).toBe(OWNER_ID);
    expect(notification.event_type).toBe("sale_request.final_offer_submitted");
  });

  it("cada rodada de horários gera aviso PRÓPRIO", async () => {
    const { row } = seedSelected();
    const app = buildApp();

    await sendSlots(app, { id: row.id, slots: [futureIso(48)] });
    await requestNewSlots(app, { id: row.id });
    await sendSlots(app, { id: row.id, slots: [futureIso(96)] });

    const offered = db.userNotifications.filter(
      (n) => n.event_type === "sale_request.inspection_slots_offered"
    );
    // Duas rodadas, dois avisos: a chave inclui o número da rodada, então o
    // segundo conjunto não é silenciado como duplicata do primeiro.
    expect(offered).toHaveLength(2);
  });

  it("nenhuma notificação carrega contato de ninguém", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);
    await decide(app, {
      id: row.id,
      body: { decision_type: "final_offer", final_amount: "60000.00", adjustment_reason: "tires" },
    });

    const serialized = JSON.stringify(db.userNotifications).toLowerCase();
    for (const forbidden of ["whatsapp", "telefone", "e-mail", "@", "cnpj", "cpf"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

// ============================================================================
describe("privacidade", () => {
  it("o DTO do proprietário não expõe identificadores internos da loja", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const { body } = await ownerDetail(app, { id: row.id });
    const serialized = JSON.stringify(body.inspection);

    expect(serialized).not.toContain("advertiser_id");
    expect(serialized).not.toContain("dealer_user_id");
    expect(serialized).not.toContain("completed_by_user_id");
    expect(serialized).not.toContain("created_by_user_id");
  });

  /**
   * §32 — a nota INTERNA não vaza.
   *
   * Ela é coluna separada de `adjustment_note` justamente para que a query do
   * proprietário possa deixá-la de fora sem pensar duas vezes.
   */
  it("a nota INTERNA da loja nunca chega ao proprietário", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    await decide(app, {
      id: row.id,
      body: {
        decision_type: "final_offer",
        final_amount: "60000.00",
        adjustment_reason: "tires",
        adjustment_note: "Pneus dianteiros no limite.",
        internal_note: "Falar com o Marcos antes de fechar — margem apertada.",
      },
    });

    const { body } = await ownerDetail(app, { id: row.id });

    // O que o proprietário VÊ.
    expect(body.final_decision.note).toBe("Pneus dianteiros no limite.");
    // O que ele NUNCA vê.
    expect(JSON.stringify(body)).not.toContain("Marcos");
    expect(JSON.stringify(body)).not.toContain("internal_note");
  });

  it("o DTO do lojista continua sem NADA do proprietário", async () => {
    const { row } = seedSelected();
    const app = buildApp();
    await runInspection(app, row.id);

    const { body } = await dealerDetail(app, { id: row.id });
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

  /**
   * O DEFEITO QUE O E2E PEGOU, travado aqui para não voltar.
   *
   * `serializeSelection` nasceu na 4.4 comparando `status === 'offer_selected'`.
   * Com os quatro estados novos, `is_selected` virava `false` assim que a
   * avaliação era agendada — e a tela da loja ESCOLHIDA voltava a exibir o
   * formulário de PROPOSTA, dizendo "Recebendo propostas" e oferecendo um campo
   * para cobrir um lance que já não existe.
   *
   * Nenhum teste de unidade da 4.4 pegou, porque todos olhavam só para
   * `receiving_offers` e `offer_selected`. Este percorre a máquina inteira.
   */
  it("`is_selected` permanece VERDADEIRO em todos os estados da avaliação", async () => {
    const { row } = seedSelected();
    const app = buildApp();

    const steps = [
      ["offer_selected", null],
      [
        "offer_selected",
        async () => sendSlots(app, { id: row.id, slots: [futureIso(48)] }),
      ],
      [
        "inspection_scheduled",
        async () => {
          const slot = db.saleRequestInspectionSlots.at(-1);
          return confirmSlot(app, { id: row.id, slotId: slot.id });
        },
      ],
      ["inspection_completed", async () => completeInspection(app, { id: row.id })],
      [
        "final_offer_submitted",
        async () =>
          decide(app, {
            id: row.id,
            body: {
              decision_type: "final_offer",
              final_amount: "60000.00",
              adjustment_reason: "tires",
            },
          }),
      ],
    ];

    for (const [expectedStatus, advance] of steps) {
      if (advance) await advance();

      const { body } = await dealerDetail(app, { id: row.id });

      expect(body.sale_opportunity.status).toBe(expectedStatus);
      expect(
        body.sale_opportunity.is_selected,
        `is_selected virou false em ${expectedStatus}`
      ).toBe(true);
      // E o valor selecionado continua sendo devolvido — a tela o exibe.
      expect(body.sale_opportunity.selected_amount).toBe("65000.00");
    }
  });

  it("a loja PERDEDORA continua recebendo 404 em todos os estados novos", async () => {
    const { row } = seedSelected();
    const app = buildApp();

    for (const advance of [
      async () => sendSlots(app, { id: row.id, slots: [futureIso(48)] }),
      async () => {
        const slot = db.saleRequestInspectionSlots.at(-1);
        return confirmSlot(app, { id: row.id, slotId: slot.id });
      },
      async () => completeInspection(app, { id: row.id }),
      async () =>
        decide(app, {
          id: row.id,
          body: { decision_type: "final_offer", final_amount: "60000.00", adjustment_reason: "tires" },
        }),
    ]) {
      await advance();
      const response = await dealerDetail(app, { user: DEALER_B, id: row.id });
      expect(response.status).toBe(404);
    }
  });
});

// ============================================================================
describe("cancelamento durante a avaliação (regressão da 4.4.1)", () => {
  /**
   * O guard de cancelamento nasceu na 4.4.1 comparando com `offer_selected`.
   * Com os quatro estados novos, uma igualdade voltaria a produzir o "200 falso"
   * que aquela fase consertou — a tela diria "cancelada" sobre uma solicitação
   * com visita agendada.
   */
  it("é recusado em TODOS os estados da avaliação", async () => {
    const app = buildApp();

    for (const advance of [
      null,
      async (id) => sendSlots(app, { id, slots: [futureIso(48)] }),
      async (id) => {
        await sendSlots(app, { id, slots: [futureIso(48)] });
        const slot = db.saleRequestInspectionSlots.at(-1);
        return confirmSlot(app, { id, slotId: slot.id });
      },
      async (id) => {
        await scheduleInspection(app, id);
        return completeInspection(app, { id });
      },
    ]) {
      resetDb({
        cities: [ATIBAIA, BRAGANCA],
        nextRequestId: 1,
        nextOfferId: 1,
        nextSelectionId: 1,
        nextInspectionId: 1,
        nextSlotId: 1,
      });
      seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
      const { row } = seedSelected();
      if (advance) await advance(row.id);

      const statusBefore = db.saleRequests[0].status;
      const response = await request(app)
        .post(`${OWNER_BASE}/${row.id}/cancel`)
        .set("x-test-user", OWNER_ID);

      expect(response.status).toBe(409);
      expect(response.body.details?.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
      expect(db.saleRequests[0].status).toBe(statusBefore);
    }
  });
});
