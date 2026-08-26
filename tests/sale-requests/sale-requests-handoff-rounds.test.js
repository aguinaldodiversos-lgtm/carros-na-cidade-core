// O HANDOFF DIRETO, a RESSELEÇÃO e as RODADAS (Fase 4.7).
//
// ════════════════════════════════════════════════════════════════════════════
// A FRONTEIRA DESTE ARQUIVO, DECLARADA
// ════════════════════════════════════════════════════════════════════════════
// Aqui se prova a REGRA e o ALCANCE dela: quem pode fazer o quê, o que é
// recusado, o que aparece e o que nunca vaza.
//
// O que NÃO se prova aqui, e tem arquivo próprio contra PostgreSQL real
// (tests/integration/sale-request-handoff-rounds.integration.test.js):
//
//   §41  duas resseleções simultâneas;
//   §42  resseleção × nova rodada;
//   §43  duas rodadas 2 ao mesmo tempo;
//   §49  o backfill da migration 060 sobre um banco povoado;
//   §50  a integridade composta (oferta de outra rodada, seleção de outro
//        advertiser) — o fake não reproduz FK, e um fake que a imitasse estaria
//        concordando consigo mesmo.

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

const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };

const OWNER_ID = "7";
const OTHER_OWNER_ID = "9";
const DEALER_A = "20";
const DEALER_B = "21";
const DEALER_C = "22";
const STORE_A = 100;
const STORE_B = 200;
const STORE_C = 300;

const OFFER_A = "65000";
const OFFER_B = "63500";
const OFFER_C = "62000";

let seq = 0;

function seedDealer({ userId, id, name, whatsapp = "11999990000" }) {
  db.advertisers.push({
    id,
    user_id: userId,
    city_id: ATIBAIA.id,
    status: "active",
    name,
    address: "Rua das Lojas, 120",
    whatsapp,
  });
}

function seedRequest(overrides = {}) {
  seq += 1;
  const id = db.nextRequestId++;

  const row = {
    id,
    owner_user_id: OWNER_ID,
    city_id: ATIBAIA.id,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: "005340-0",
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    minimum_accepted_price: "60000.00",
    year: 2020,
    mileage: 62000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...EVALUATION_ROW,
    status: "receiving_offers",
    current_round_number: 1,
    selected_offer_id: null,
    selected_offer_at: null,
    created_at: new Date(NOW - seq * 60000).toISOString(),
    updated_at: new Date(NOW - seq * 60000).toISOString(),
    ...overrides,
  };

  db.saleRequests.push(row);
  return row;
}

// ── helpers de request ──────────────────────────────────────────────────────

const asDealer = (req, user) => req.set("x-test-user", user).set("x-test-account", "CNPJ");

function sendOffer(app, { user, id, amount }) {
  return asDealer(request(app).post(`${DEALER_BASE}/${id}/offers`), user).send({ amount });
}

function ownerDetail(app, { user = OWNER_ID, id }) {
  return request(app).get(`${OWNER_BASE}/${id}`).set("x-test-user", user);
}

function dealerDetail(app, { user = DEALER_A, id }) {
  return asDealer(request(app).get(`${DEALER_BASE}/${id}`), user);
}

function acceptOffer(app, { user = OWNER_ID, id, offerId }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/select-offer`)
    .set("x-test-user", user)
    .send({ offer_id: String(offerId) });
}

function noAgreement(app, { user = OWNER_ID, id }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/handoff/no-agreement`)
    .set("x-test-user", user)
    .send();
}

function newRound(app, { user = OWNER_ID, id, minimum }) {
  return request(app)
    .post(`${OWNER_BASE}/${id}/rounds`)
    .set("x-test-user", user)
    .send(minimum === undefined ? {} : { minimum_accepted_price: minimum });
}

function whatsapp(app, { user = OWNER_ID, id }) {
  return request(app).get(`${OWNER_BASE}/${id}/handoff/whatsapp`).set("x-test-user", user);
}

/** Três lojas ofertando na rodada aberta. Devolve os ids das ofertas. */
async function seedThreeOffers(app, id) {
  await sendOffer(app, { user: DEALER_C, id, amount: OFFER_C });
  await sendOffer(app, { user: DEALER_B, id, amount: OFFER_B });
  await sendOffer(app, { user: DEALER_A, id, amount: OFFER_A });

  const byStore = (advertiserId) =>
    db.saleRequestOffers.find(
      (o) => String(o.sale_request_id) === String(id) && String(o.advertiser_id) === String(advertiserId)
    );

  return { a: byStore(STORE_A).id, b: byStore(STORE_B).id, c: byStore(STORE_C).id };
}

const roundsOf = (id) =>
  db.saleRequestRounds.filter((r) => String(r.sale_request_id) === String(id));
const selectionsOf = (id) =>
  db.saleRequestOfferSelections.filter((s) => String(s.sale_request_id) === String(id));
const outcomesOf = (id) =>
  db.saleRequestHandoffOutcomes.filter((o) => String(o.sale_request_id) === String(id));

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    nextRequestId: 1,
    nextOfferId: 1,
    nextSelectionId: 1,
    nextNotificationId: 1,
    nextRoundId: 1,
    nextOutcomeId: 1,
  });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
  seedDealer({ userId: DEALER_B, id: STORE_B, name: "Prime Veículos" });
  seedDealer({ userId: DEALER_C, id: STORE_C, name: "Garagem Central" });
});

// ============================================================================
describe("a rodada 1 (§24, §25)", () => {
  it("a oferta entra na rodada aberta da solicitação", async () => {
    const app = buildApp();
    const row = seedRequest();

    await sendOffer(app, { user: DEALER_A, id: row.id, amount: OFFER_A });

    const round = roundsOf(row.id)[0];
    expect(round.round_number).toBe(1);
    expect(db.saleRequestOffers[0].round_id).toBe(round.id);
  });

  it("o piso lido é o da RODADA, e a primeira proposta precisa alcançá-lo", async () => {
    const app = buildApp();
    const row = seedRequest({ minimum_accepted_price: "60000.00" });

    const low = await sendOffer(app, { user: DEALER_A, id: row.id, amount: "59999" });
    expect(low.status).toBe(409);

    const ok = await sendOffer(app, { user: DEALER_A, id: row.id, amount: "60000" });
    expect(ok.status).toBe(201);
  });
});

// ============================================================================
describe("aceitar oferta e o handoff (§13, §14, §15)", () => {
  it("o proprietário aceita e a solicitação vai para offer_selected", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);

    const response = await acceptOffer(app, { id: row.id, offerId: offers.a });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("offer_selected");
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offers.a));
    expect(selectionsOf(row.id)).toHaveLength(1);
  });

  it("a MENOR oferta também pode ser aceita — a lista não é um leilão", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);

    const response = await acceptOffer(app, { id: row.id, offerId: offers.c });
    expect(response.status).toBe(200);
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offers.c));
  });

  /** §14 — o link sai do WhatsApp COMERCIAL da loja escolhida. */
  it("o WhatsApp devolvido é o da loja aceita, com a mensagem certa", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await whatsapp(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.url).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/);

    const text = decodeURIComponent(response.body.url.split("text=")[1]);
    expect(text).toContain("Carros na Cidade");
    expect(text).toContain("T-Cross");
    expect(text).toMatch(/avaliação presencial/i);
  });

  /** §14 — nada sensível na mensagem, e nem o valor. */
  it("a mensagem não carrega CPF, e-mail, id interno nem o valor", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await whatsapp(app, { id: row.id });
    const text = decodeURIComponent(response.body.url.split("text=")[1]);

    expect(text).not.toMatch(/cpf|@|65\.?000|65000/i);
    // E a resposta é MÍNIMA: só a URL.
    expect(Object.keys(response.body).sort()).toEqual(["success", "url"]);
  });

  it("a loja sem WhatsApp utilizável devolve código próprio", async () => {
    const app = buildApp();
    db.advertisers.find((a) => a.id === STORE_A).whatsapp = "";
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await whatsapp(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_STORE_WHATSAPP_UNAVAILABLE");
  });

  it("outra PF não alcança o WhatsApp — 404 indistinguível", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await whatsapp(app, { user: OTHER_OWNER_ID, id: row.id });
    expect(response.status).toBe(404);
  });

  it("sem oferta aceita, não há WhatsApp para pedir", async () => {
    const app = buildApp();
    const row = seedRequest();
    await seedThreeOffers(app, row.id);

    const response = await whatsapp(app, { id: row.id });
    expect(response.status).toBe(404);
  });

  /** §15/§16 — a loja NÃO recebe dado nenhum do proprietário pelo portal. */
  it("a loja aceita vê a oferta aceita e NADA do proprietário", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await dealerDetail(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.sale_opportunity.is_selected).toBe(true);
    expect(response.body.sale_opportunity.selected_amount).toBe("65000.00");

    const raw = JSON.stringify(response.body);
    expect(raw).not.toMatch(/owner_user_id|whatsapp|telefone|cpf|e-?mail/i);
  });

  it("as lojas NÃO escolhidas continuam com 404", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    for (const loser of [DEALER_B, DEALER_C]) {
      const response = await dealerDetail(app, { user: loser, id: row.id });
      expect(response.status).toBe(404);
    }
  });
});

// ============================================================================
describe("não houve acordo (§17, §18)", () => {
  async function seedHandoff(app) {
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });
    return { row, offers };
  }

  it("registra o desfecho e move para handoff_failed", async () => {
    const app = buildApp();
    const { row } = await seedHandoff(app);

    const response = await noAgreement(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(db.saleRequests[0].status).toBe("handoff_failed");
    expect(outcomesOf(row.id)).toHaveLength(1);
    expect(outcomesOf(row.id)[0].outcome).toBe("no_agreement");
  });

  /** §17 — não pergunta motivo, culpa nem valor. */
  it("não registra motivo, culpa nem valor renegociado", async () => {
    const app = buildApp();
    const { row } = await seedHandoff(app);

    // Mesmo que o cliente tente mandar.
    await request(app)
      .post(`${OWNER_BASE}/${row.id}/handoff/no-agreement`)
      .set("x-test-user", OWNER_ID)
      .send({ reason: "a loja abaixou o valor", blamed: "dealer", final_amount: "50000" });

    const entry = outcomesOf(row.id)[0];
    expect(Object.keys(entry).sort()).toEqual([
      "created_at",
      "id",
      "outcome",
      "recorded_by_user_id",
      "sale_request_id",
      "selection_id",
    ]);
    expect(JSON.stringify(entry)).not.toMatch(/abaixou|dealer|50000/);
  });

  /** §18 — a seleção anterior PERMANECE. */
  it("a seleção da loja A permanece, com valor e data", async () => {
    const app = buildApp();
    const { row, offers } = await seedHandoff(app);
    const before = { ...selectionsOf(row.id)[0] };

    await noAgreement(app, { id: row.id });

    expect(selectionsOf(row.id)).toHaveLength(1);
    expect(selectionsOf(row.id)[0]).toEqual(before);
    // E o ponteiro continua apontando para ela — é o que a tela mostra.
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offers.a));
  });

  it("retry é idempotente: 200, changed false, sem segundo evento", async () => {
    const app = buildApp();
    const { row } = await seedHandoff(app);

    const first = await noAgreement(app, { id: row.id });
    const second = await noAgreement(app, { id: row.id });

    expect(first.body.changed).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);
    expect(outcomesOf(row.id)).toHaveLength(1);
  });

  it("sem oferta aceita é 409, com código próprio", async () => {
    const app = buildApp();
    const row = seedRequest();
    await seedThreeOffers(app, row.id);

    const response = await noAgreement(app, { id: row.id });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_HANDOFF_NOT_ACTIVE");
    expect(outcomesOf(row.id)).toHaveLength(0);
  });

  it("outra PF recebe 404 e nada é gravado", async () => {
    const app = buildApp();
    const { row } = await seedHandoff(app);

    const response = await noAgreement(app, { user: OTHER_OWNER_ID, id: row.id });

    expect(response.status).toBe(404);
    expect(outcomesOf(row.id)).toHaveLength(0);
    expect(db.saleRequests[0].status).toBe("offer_selected");
  });
});

// ============================================================================
describe("resseleção — aceitar outra oferta anterior (§19, §20, §27)", () => {
  async function seedFailedHandoff(app) {
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });
    await noAgreement(app, { id: row.id });
    return { row, offers };
  }

  /** §38 — as outras ofertas VOLTAM a aparecer. */
  it("as outras ofertas da rodada reaparecem no detalhe", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    const response = await ownerDetail(app, { id: row.id });

    expect(response.body.sale_request.status).toBe("handoff_failed");
    const names = response.body.proposals.map((p) => p.store_name).sort();
    expect(names).toEqual(["Auto Center Atibaia", "Garagem Central", "Prime Veículos"]);
  });

  it("aceitar a Loja B cria uma seleção NOVA e preserva a da Loja A", async () => {
    const app = buildApp();
    const { row, offers } = await seedFailedHandoff(app);

    const response = await acceptOffer(app, { id: row.id, offerId: offers.b });

    expect(response.status).toBe(200);
    expect(db.saleRequests[0].status).toBe("offer_selected");
    expect(String(db.saleRequests[0].selected_offer_id)).toBe(String(offers.b));

    // DUAS seleções: a história da Loja A não foi reescrita.
    const trail = selectionsOf(row.id);
    expect(trail).toHaveLength(2);
    expect(String(trail[0].offer_id)).toBe(String(offers.a));
    expect(trail[0].amount_snapshot).toBe("65000.00");
    expect(String(trail[1].offer_id)).toBe(String(offers.b));
  });

  it("o histórico mostra a Loja A encerrada e a Loja B como match atual", async () => {
    const app = buildApp();
    const { row, offers } = await seedFailedHandoff(app);
    await acceptOffer(app, { id: row.id, offerId: offers.b });

    const response = await ownerDetail(app, { id: row.id });
    const history = response.body.selection_history;

    expect(history).toHaveLength(2);
    // Mais recente primeiro.
    expect(history[0].store_name).toBe("Prime Veículos");
    expect(history[0].outcome).toBeNull();
    expect(history[1].store_name).toBe("Auto Center Atibaia");
    expect(history[1].outcome).toBe("no_agreement");

    // Sem ids internos.
    expect(JSON.stringify(history)).not.toMatch(/advertiser_id|offer_id|selection_id/);
  });

  it("a Loja A deixa de ser o match atual; a Loja B passa a ver a oportunidade", async () => {
    const app = buildApp();
    const { row, offers } = await seedFailedHandoff(app);
    await acceptOffer(app, { id: row.id, offerId: offers.b });

    const b = await dealerDetail(app, { user: DEALER_B, id: row.id });
    expect(b.status).toBe(200);
    expect(b.body.sale_opportunity.is_selected).toBe(true);

    const a = await dealerDetail(app, { user: DEALER_A, id: row.id });
    expect(a.status).toBe(404);
  });

  it("o WhatsApp devolvido passa a ser o da Loja B", async () => {
    const app = buildApp();
    db.advertisers.find((a) => a.id === STORE_B).whatsapp = "11988887777";
    const { row, offers } = await seedFailedHandoff(app);
    await acceptOffer(app, { id: row.id, offerId: offers.b });

    const response = await whatsapp(app, { id: row.id });
    expect(response.body.url).toContain("5511988887777");
  });

  /** Trocar de loja DURANTE um handoff ativo continua sendo 409. */
  it("não é possível trocar de loja sem informar que não houve acordo", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    const response = await acceptOffer(app, { id: row.id, offerId: offers.b });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe("SALE_REQUEST_ALREADY_SELECTED");
    expect(selectionsOf(row.id)).toHaveLength(1);
  });
});

// ============================================================================
describe("nova rodada (§22, §23, §39, §40)", () => {
  async function seedFailedHandoff(app) {
    const row = seedRequest({ minimum_accepted_price: "60000.00" });
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });
    await noAgreement(app, { id: row.id });
    return { row, offers };
  }

  it("abre a rodada 2 com o piso novo e reabre a disputa", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    const response = await newRound(app, { id: row.id, minimum: "58000" });

    expect(response.status).toBe(200);
    expect(response.body.round.number).toBe(2);
    expect(response.body.round.minimum_accepted_price).toBe("58000.00");

    const stored = db.saleRequests[0];
    expect(stored.status).toBe("receiving_offers");
    expect(stored.current_round_number).toBe(2);
    // O CHECK de coerência exige: `receiving_offers` não tem seleção.
    expect(stored.selected_offer_id).toBeNull();
    expect(stored.selected_offer_at).toBeNull();
  });

  /** §23 — a rodada 1 e o piso dela permanecem intactos. */
  it("a rodada 1 e o piso original permanecem no histórico", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "58000" });

    const rounds = roundsOf(row.id).sort((a, b) => a.round_number - b.round_number);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].minimum_accepted_price).toBe("60000.00");
    expect(rounds[1].minimum_accepted_price).toBe("58000.00");
  });

  /** §23/§40 — as ofertas antigas NÃO contaminam a rodada nova. */
  it("as ofertas da rodada 1 não aparecem como propostas atuais na rodada 2", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "58000" });

    const response = await ownerDetail(app, { id: row.id });
    expect(response.body.proposals).toEqual([]);
    expect(response.body.round.number).toBe(2);
  });

  it("o feed do lojista não conta a oferta da rodada 1 como proposta da rodada 2", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "58000" });

    const feed = await asDealer(request(app).get(DEALER_BASE), DEALER_A);
    const card = feed.body.items.find((item) => String(item.id) === String(row.id));

    expect(card).toBeTruthy();
    expect(card.my_offer).toBeNull();
    expect(card.current_highest_offer).toBeNull();
  });

  it("a loja pode ofertar de novo na rodada 2, pelo piso NOVO", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "58000" });

    // Abaixo do piso novo continua recusado…
    const low = await sendOffer(app, { user: DEALER_A, id: row.id, amount: "57999" });
    expect(low.status).toBe(409);

    // …e o piso novo (menor que o antigo) agora passa.
    const ok = await sendOffer(app, { user: DEALER_A, id: row.id, amount: "58000" });
    expect(ok.status).toBe(201);

    const round2 = roundsOf(row.id).find((r) => r.round_number === 2);
    const offer = db.saleRequestOffers.find((o) => o.amount === "58000.00");
    expect(String(offer.round_id)).toBe(String(round2.id));
  });

  it("uma oferta da rodada 1 NÃO pode ser aceita na rodada 2", async () => {
    const app = buildApp();
    const { row, offers } = await seedFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "58000" });

    const response = await acceptOffer(app, { id: row.id, offerId: offers.b });

    expect(response.status).toBe(404);
    expect(response.body.details?.code).toBe("SALE_REQUEST_OFFER_NOT_FOUND");
  });

  it("só a partir de handoff_failed — em receiving_offers e offer_selected é 409", async () => {
    const app = buildApp();

    const open = seedRequest();
    const first = await newRound(app, { id: open.id, minimum: "58000" });
    expect(first.status).toBe(409);
    expect(first.body.details?.code).toBe("SALE_REQUEST_ROUND_NOT_ALLOWED");

    const matched = seedRequest();
    const offers = await seedThreeOffers(app, matched.id);
    await acceptOffer(app, { id: matched.id, offerId: offers.a });
    const second = await newRound(app, { id: matched.id, minimum: "58000" });
    expect(second.status).toBe(409);
  });

  /** §44 — o retry do POST da rodada 2 não cria a rodada 3. */
  it("retry não cria uma terceira rodada", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    await newRound(app, { id: row.id, minimum: "58000" });
    const retry = await newRound(app, { id: row.id, minimum: "58000" });

    expect(retry.status).toBe(409);
    expect(roundsOf(row.id)).toHaveLength(2);
    expect(db.saleRequests[0].current_round_number).toBe(2);
  });

  it("piso inválido é 400, antes de qualquer escrita", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    for (const minimum of ["0", "-1", "abc"]) {
      const response = await newRound(app, { id: row.id, minimum });
      expect(response.status, `piso ${minimum}`).toBe(400);
    }

    expect(roundsOf(row.id)).toHaveLength(1);
    expect(db.saleRequests[0].status).toBe("handoff_failed");
  });

  it("outra PF recebe 404 e nenhuma rodada é criada", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    const response = await newRound(app, { user: OTHER_OWNER_ID, id: row.id, minimum: "58000" });

    expect(response.status).toBe(404);
    expect(roundsOf(row.id)).toHaveLength(1);
  });

  /** O ciclo inteiro: rodada 2 → aceite → handoff → rodada 3. */
  it("o ciclo se repete: rodada 2 aceita, sem acordo, rodada 3", async () => {
    const app = buildApp();
    const { row } = await seedFailedHandoff(app);

    await newRound(app, { id: row.id, minimum: "58000" });
    await sendOffer(app, { user: DEALER_A, id: row.id, amount: "58000" });

    const round2Offer = db.saleRequestOffers.find((o) => o.amount === "58000.00");
    await acceptOffer(app, { id: row.id, offerId: round2Offer.id });
    expect(db.saleRequests[0].status).toBe("offer_selected");

    await noAgreement(app, { id: row.id });
    const third = await newRound(app, { id: row.id, minimum: "55000" });

    expect(third.status).toBe(200);
    expect(third.body.round.number).toBe(3);
    // TRÊS rodadas e DUAS seleções, todas preservadas.
    expect(roundsOf(row.id)).toHaveLength(3);
    expect(selectionsOf(row.id)).toHaveLength(2);
    expect(outcomesOf(row.id)).toHaveLength(2);
  });
});

// ============================================================================
describe("autorização (§45)", () => {
  it("o lojista não executa nenhuma das três ações do proprietário", async () => {
    const app = buildApp();
    const row = seedRequest();
    const offers = await seedThreeOffers(app, row.id);
    await acceptOffer(app, { id: row.id, offerId: offers.a });

    // O corpo de `/rounds` é VÁLIDO de propósito. A validação de forma roda
    // antes do lock (um piso malformado é 400 em qualquer estado), e mandar um
    // corpo vazio faria o teste passar por 400 sem nunca chegar à autorização —
    // provando o validador em vez do escopo.
    const actions = [
      ["get", `${OWNER_BASE}/${row.id}/handoff/whatsapp`, undefined],
      ["post", `${OWNER_BASE}/${row.id}/handoff/no-agreement`, undefined],
      ["post", `${OWNER_BASE}/${row.id}/rounds`, { minimum_accepted_price: "58000" }],
    ];

    for (const [method, path, body] of actions) {
      const response = await request(app)
        [method](path)
        .set("x-test-user", DEALER_A)
        .set("x-test-account", "CNPJ")
        .send(body);
      expect(response.status, path).toBe(404);
    }

    expect(outcomesOf(row.id)).toHaveLength(0);
    expect(roundsOf(row.id)).toHaveLength(1);
  });

  it("sem sessão é 401 nas três", async () => {
    const app = buildApp();
    const row = seedRequest();

    const paths = [
      ["get", `${OWNER_BASE}/${row.id}/handoff/whatsapp`],
      ["post", `${OWNER_BASE}/${row.id}/handoff/no-agreement`],
      ["post", `${OWNER_BASE}/${row.id}/rounds`],
    ];

    for (const [method, path] of paths) {
      const response = await request(app)[method](path).send();
      expect(response.status).toBe(401);
    }
  });
});

/**
 * O PISO QUE O LOJISTA LÊ (Fase 4.11A, §25 e §54).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRESSÃO QUE ESTE BLOCO TRANCA
 * ════════════════════════════════════════════════════════════════════════════
 * Da 4.7 até a 4.11A, `sale-requests.dealer.repository.js` projetava
 * `sr.minimum_accepted_price` — o piso da RODADA 1, que `openNewRound` nunca
 * atualiza. Enquanto isso `sale-requests.offers.service.js` já validava contra
 * `round.minimum_accepted_price`.
 *
 * O sintoma não era um erro: era a tela do lojista pedindo R$ 70.000 numa
 * disputa que a API aceitava por R$ 62.500. Ninguém recebia exceção, e o único
 * jeito de descobrir era ofertar.
 *
 * Estes testes falham se alguém devolver o `sr.minimum_accepted_price` direto:
 * `projectDealer` do fake decide o piso LENDO o SQL, então sem o
 * `LEFT JOIN sale_request_rounds` o valor volta a ser o da rodada 1 e as
 * asserções abaixo acusam.
 */
describe("o piso do lojista vem da rodada CORRENTE (§25, §54)", () => {
  const ROUND_1_MINIMUM = "70000.00";
  const ROUND_2_MINIMUM = "62500.00";

  /**
   * Leva a solicitação até `handoff_failed`, pronta para uma rodada nova.
   *
   * NÃO usa `seedThreeOffers`: os valores fixos daquele helper (65.000, 63.500,
   * 62.000) não alcançam o piso de 70.000 desta história, e o backend recusaria
   * as três com 409. O piso alto é justamente o ponto — é dele que a rodada 2
   * vai descer.
   */
  async function seedUpToFailedHandoff(app, overrides = {}) {
    const row = seedRequest({ minimum_accepted_price: ROUND_1_MINIMUM, ...overrides });

    await sendOffer(app, { user: DEALER_A, id: row.id, amount: "72000" });
    const offer = db.saleRequestOffers.find(
      (item) => String(item.sale_request_id) === String(row.id)
    );

    await acceptOffer(app, { id: row.id, offerId: offer.id });
    await noAgreement(app, { id: row.id });
    return row;
  }

  it("§54 — depois da rodada 2, o DETALHE mostra o piso novo, nunca o da rodada 1", async () => {
    const app = buildApp();
    const row = await seedUpToFailedHandoff(app);

    await newRound(app, { id: row.id, minimum: "62500" });

    const response = await dealerDetail(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.sale_opportunity.minimum_accepted_price).toBe(ROUND_2_MINIMUM);
    // A asserção negativa é a que trava a regressão: o valor da rodada 1
    // continua existindo no banco, e é exatamente ele que voltaria a aparecer se
    // a junção saísse do repository.
    expect(response.body.sale_opportunity.minimum_accepted_price).not.toBe(ROUND_1_MINIMUM);
  });

  it("§54 — o FEED acompanha o detalhe: um piso só, o da rodada corrente", async () => {
    const app = buildApp();
    const row = await seedUpToFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "62500" });

    const response = await asDealer(request(app).get(DEALER_BASE), DEALER_A);

    expect(response.status).toBe(200);
    const card = response.body.items.find((item) => String(item.id) === String(row.id));
    // O card e a ficha lêem a MESMA coluna projetada. Se divergirem, o lojista
    // vê um piso na lista e outro ao abrir — e nenhuma das duas telas erra
    // sozinha o bastante para alguém desconfiar.
    expect(card.minimum_accepted_price).toBe(ROUND_2_MINIMUM);
  });

  it("§53 — na rodada 1 o piso declarado continua chegando inteiro", async () => {
    const app = buildApp();
    const row = seedRequest({ minimum_accepted_price: "62500.00" });

    const response = await dealerDetail(app, { id: row.id });

    expect(response.status).toBe(200);
    expect(response.body.sale_opportunity.minimum_accepted_price).toBe("62500.00");
  });

  it("§55 — solicitação legada sem piso chega como null, e nunca como zero", async () => {
    const app = buildApp();
    const row = seedRequest({ minimum_accepted_price: null });

    const response = await dealerDetail(app, { id: row.id });

    expect(response.status).toBe(200);
    // `null` é "não foi declarado". `"0"` seria "aceita qualquer valor" — e a
    // tela tem de poder distinguir os dois para não convidar a uma oferta de
    // nada em nome de quem nunca abriu mão de piso algum.
    expect(response.body.sale_opportunity.minimum_accepted_price).toBeNull();
  });

  it("a rodada 1 permanece no histórico com o piso original", async () => {
    const app = buildApp();
    const row = await seedUpToFailedHandoff(app);
    await newRound(app, { id: row.id, minimum: "62500" });

    const rounds = roundsOf(row.id).sort((a, b) => a.round_number - b.round_number);

    // O piso antigo não é apagado: ele é o contexto das ofertas da rodada 1, e
    // sem ele aquelas ofertas viram números sem régua.
    expect(rounds.map((round) => round.minimum_accepted_price)).toEqual([
      ROUND_1_MINIMUM,
      ROUND_2_MINIMUM,
    ]);
  });
});
