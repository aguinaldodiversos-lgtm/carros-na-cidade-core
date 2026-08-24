// O FLUXO APOSENTADO — a avaliação presencial dentro do portal (Fase 4.7, §32).
//
// ════════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO SUBSTITUI, E POR QUÊ
// ════════════════════════════════════════════════════════════════════════════
// Ele toma o lugar de `sale-requests-inspection.test.js` (Fase 4.5, 54 testes) e
// `sale-requests-owner-final-decision.test.js` (Fase 4.6, 46 testes).
//
// Aqueles arquivos provavam que agendar visita, registrar avaliação, apresentar
// proposta final e aceitá-la FUNCIONAVAM. A 4.7 tirou as quatro coisas do
// produto: a avaliação acontece entre as duas partes, fora da plataforma. Não é
// possível testar que um comportamento removido funciona, e mantê-los
// vermelhos ensinaria a ignorar vermelho.
//
// A classificação do §58, aplicada aos 100 testes:
//
//   A. invariantes ainda válidos            → PORTADOS para cá (leitura legada,
//                                             guard de cancelamento, loser 404,
//                                             varredura da máquina de estados);
//   B. comportamento legacy                 → PORTADO: os DTOs continuam
//                                             servindo inspeção e proposta final
//                                             para as linhas que já as têm;
//   C. comportamento intencionalmente
//      removido (os 6 writers)              → substituído pela prova de que cada
//                                             um agora RECUSA.
//
// O relatório da fase registra a contagem e a razão de cada categoria.

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
const { SALE_REQUEST_LEGACY_STATUSES, SALE_REQUEST_SELECTED_STATUSES } = await import(
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
const OWNER_ID = "7";
const DEALER_A = "20";
const DEALER_B = "21";
const STORE_A = 100;
const STORE_B = 200;

const PRELIMINARY = "65000.00";
const FINAL = "60000.00";

let seq = 0;

function seedDealer({ userId, id, name }) {
  db.advertisers.push({
    id,
    user_id: userId,
    city_id: ATIBAIA.id,
    status: "active",
    name,
    address: "Rua das Lojas, 120",
    whatsapp: "11999990000",
  });
}

/**
 * Uma solicitação num estado LEGADO, com toda a cadeia da 4.5/4.6 montada.
 *
 * Montada direto no fake porque os endpoints que a produziriam já não existem —
 * que é precisamente o ponto deste arquivo. As relações são as reais.
 */
function seedLegacy({ status, decisionType = "final_offer", ownerDecision = null } = {}) {
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
    minimum_accepted_price: "62500.00",
    year: 2020,
    mileage: 62000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...EVALUATION_ROW,
    status,
    current_round_number: 1,
    selected_offer_id: null,
    selected_offer_at: new Date(NOW - 5 * 60000).toISOString(),
    created_at: new Date(NOW - seq * 60000).toISOString(),
    updated_at: new Date(NOW - seq * 60000).toISOString(),
  };
  db.saleRequests.push(row);

  const round = {
    id: db.nextRoundId++,
    sale_request_id: id,
    round_number: 1,
    minimum_accepted_price: row.minimum_accepted_price,
    created_at: row.created_at,
  };
  db.saleRequestRounds.push(round);

  const offerA = {
    id: db.nextOfferId++,
    sale_request_id: id,
    round_id: round.id,
    dealer_user_id: DEALER_A,
    advertiser_id: STORE_A,
    amount: PRELIMINARY,
    note: null,
    created_at: new Date(NOW - 10 * 60000).toISOString(),
  };
  db.saleRequestOffers.push(offerA);
  db.saleRequestOffers.push({
    id: db.nextOfferId++,
    sale_request_id: id,
    round_id: round.id,
    dealer_user_id: DEALER_B,
    advertiser_id: STORE_B,
    amount: "67000.00",
    note: null,
    created_at: new Date(NOW - 9 * 60000).toISOString(),
  });

  row.selected_offer_id = offerA.id;

  const selection = {
    id: db.nextSelectionId++,
    sale_request_id: id,
    round_id: round.id,
    offer_id: offerA.id,
    advertiser_id: STORE_A,
    selected_by_user_id: OWNER_ID,
    amount_snapshot: PRELIMINARY,
    selected_at: row.selected_offer_at,
  };
  db.saleRequestOfferSelections.push(selection);

  const inspection = {
    id: db.nextInspectionId++,
    sale_request_id: id,
    // Fase 4.9A — a agenda passa a pertencer à SELEÇÃO. Toda linha legada
    // recebeu este vínculo no backfill da migration 061, resolvido pelo par
    // (sale_request_id, advertiser_id), que era único antes da 4.7. A fixture
    // reflete o banco depois da migration, e não antes dela.
    selection_id: selection.id,
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
    inspection_notes: "Ruído na suspensão.",
    created_at: new Date(NOW - 4 * 3600000).toISOString(),
  };
  db.saleRequestInspections.push(inspection);

  db.saleRequestDecisions.push({
    id: db.nextDecisionId++,
    sale_request_id: id,
    inspection_id: inspection.id,
    advertiser_id: STORE_A,
    selected_offer_id: offerA.id,
    decision_type: decisionType,
    preliminary_amount_snapshot: PRELIMINARY,
    final_amount: decisionType === "final_offer" ? FINAL : null,
    adjustment_reason: "tires",
    adjustment_note: null,
    internal_note: "Margem apertada, avisar o gerente.",
    decided_by_user_id: DEALER_A,
    created_at: new Date(NOW - 3600000).toISOString(),
  });

  if (ownerDecision) {
    db.saleRequestOwnerDecisions.push({
      id: db.nextOwnerDecisionId++,
      sale_request_id: id,
      post_inspection_decision_id: 1,
      advertiser_id: STORE_A,
      post_inspection_decision_type: "final_offer",
      decision_type: ownerDecision,
      final_amount_snapshot: FINAL,
      decided_by_user_id: OWNER_ID,
      created_at: new Date(NOW - 1800000).toISOString(),
    });
  }

  return { row, offerA, selection, inspection };
}

const asDealer = (req, user) => req.set("x-test-user", user).set("x-test-account", "CNPJ");

const LEGACY_CODE = "SALE_REQUEST_LEGACY_FLOW_RETIRED";

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    nextRequestId: 1,
    nextOfferId: 1,
    nextSelectionId: 1,
    nextNotificationId: 1,
    nextInspectionId: 1,
    nextSlotId: 1,
    nextDecisionId: 1,
    nextOwnerDecisionId: 1,
    nextRoundId: 1,
    nextOutcomeId: 1,
  });
  seq = 0;
  fakeClock.now = () => NOW;
  seedDealer({ userId: DEALER_A, id: STORE_A, name: "Auto Center Atibaia" });
  seedDealer({ userId: DEALER_B, id: STORE_B, name: "Prime Veículos" });
});

// ============================================================================
describe("os TRÊS writers da FICHA e da PROPOSTA FINAL continuam recusando (§32)", () => {
  /**
   * A tabela é a asserção.
   *
   * Cada linha é um caminho de escrita que existia e deixou de existir. Um
   * writer novo que alguém acrescentasse ao módulo antigo NÃO apareceria aqui —
   * e é por isso que o teste seguinte varre as rotas montadas.
   *
   * ────────────────────────────────────────────────────────────────────────
   * ERAM SEIS. A FASE 4.9A DEVOLVEU TRÊS — E SÓ TRÊS.
   * ────────────────────────────────────────────────────────────────────────
   * `inspection/slots`, `inspection/confirm` e `inspection/request-slots`
   * voltaram a funcionar: o AGENDAMENTO é produto de novo, agora pendurado na
   * seleção (migration 061). Eles são cobertos por
   * `SCHEDULING_WRITERS_BACK`, logo abaixo, que prova o oposto disto — que
   * NÃO respondem mais 409.
   *
   * Os três que sobraram aqui são os da AVALIAÇÃO e da PROPOSTA FINAL. Eles
   * continuam aposentados, e a fronteira entre as duas listas é exatamente a
   * decisão de produto da 4.7: a plataforma marca a visita, e não registra o
   * que aconteceu nela.
   */
  const WRITERS = [
    {
      name: "loja registra a avaliação",
      run: (app, id) =>
        asDealer(request(app).post(`${DEALER_BASE}/${id}/inspection/complete`), DEALER_A).send({
          observed_mileage: "64230",
        }),
    },
    {
      name: "loja apresenta proposta final",
      run: (app, id) =>
        asDealer(request(app).post(`${DEALER_BASE}/${id}/decision`), DEALER_A).send({
          decision_type: "final_offer",
          final_amount: "60000",
        }),
    },
    {
      name: "proprietário decide a proposta final",
      run: (app, id) =>
        request(app)
          .post(`${OWNER_BASE}/${id}/final-offer-decision`)
          .set("x-test-user", OWNER_ID)
          .send({ decision: "accepted" }),
    },
  ];

  for (const writer of WRITERS) {
    it(`recusa: ${writer.name}`, async () => {
      const app = buildApp();
      const { row } = seedLegacy({ status: "final_offer_submitted" });

      const response = await writer.run(app, row.id);

      expect(response.status).toBe(409);
      expect(response.body.details?.code).toBe(LEGACY_CODE);
      // A mensagem manda combinar direto — não é "tente mais tarde".
      expect(response.body.message).toMatch(/deixou de ser registrada na plataforma/i);
    });
  }

  /**
   * A recusa acontece ANTES de qualquer leitura de estado.
   *
   * É o que garante que ela vale para TODA solicitação — inclusive as que nunca
   * entraram no fluxo antigo. Um guard depois do lock recusaria só as legadas, e
   * uma solicitação 4.7 em `offer_selected` conseguiria abrir a agenda.
   */
  it("recusa mesmo numa solicitação 4.7, em offer_selected", async () => {
    const app = buildApp();
    const { row } = seedLegacy({ status: "offer_selected" });

    // Snapshot ANTES: a fixture já traz uma ficha preenchida, então "está vazia"
    // não serviria de asserção. O que precisa ser provado é que a chamada não
    // MUDOU nada — e para isso o antes tem de ser lido, não presumido.
    const antes = JSON.stringify(db.saleRequestInspections);

    const response = await asDealer(
      request(app).post(`${DEALER_BASE}/${row.id}/inspection/complete`),
      DEALER_A
    ).send({ observed_mileage: "99999" });

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe(LEGACY_CODE);
    expect(JSON.stringify(db.saleRequestInspections)).toBe(antes);
  });

  /**
   * O CONTRÁRIO, para os três que voltaram (Fase 4.9A).
   *
   * Sem este teste, remover os guards do agendamento seria uma mudança que
   * nenhuma asserção observa: os testes acima passariam igual, porque não falam
   * desses três caminhos. E "o guard sumiu" e "o guard nunca foi alcançado"
   * produzem o mesmo verde.
   *
   * A asserção é estreita de propósito: NÃO é 409 com `LEGACY_FLOW_RETIRED`.
   * Qualquer outra resposta serve — 400 por horário malformado, 409 por estado,
   * 404 por escopo. O que este teste protege é a APOSENTADORIA ter sido
   * levantada, e não o caminho feliz, que é assunto das suítes de agendamento.
   */
  const SCHEDULING_WRITERS_BACK = [
    {
      name: "loja propõe horários",
      run: (app, id) =>
        asDealer(request(app).post(`${DEALER_BASE}/${id}/inspection/slots`), DEALER_A).send({
          slots: ["2026-09-01T10:00:00-03:00"],
        }),
    },
    {
      name: "proprietário confirma horário",
      run: (app, id) =>
        request(app)
          .post(`${OWNER_BASE}/${id}/inspection/confirm`)
          .set("x-test-user", OWNER_ID)
          .send({ slot_id: "1" }),
    },
    {
      name: "proprietário pede novos horários",
      run: (app, id) =>
        request(app)
          .post(`${OWNER_BASE}/${id}/inspection/request-slots`)
          .set("x-test-user", OWNER_ID)
          .send(),
    },
  ];

  for (const writer of SCHEDULING_WRITERS_BACK) {
    it(`NÃO está mais aposentado: ${writer.name}`, async () => {
      const app = buildApp();
      const { row } = seedLegacy({ status: "offer_selected" });

      const response = await writer.run(app, row.id);

      expect(response.body.details?.code).not.toBe(LEGACY_CODE);
      expect(response.body.message ?? "").not.toMatch(
        /deixou de ser registrada na plataforma/i
      );
    });
  }

  it("nenhum writer escreve nada — nem inspeção, nem decisão, nem status", async () => {
    const app = buildApp();
    const { row } = seedLegacy({ status: "final_offer_submitted" });

    const before = {
      inspections: db.saleRequestInspections.length,
      slots: db.saleRequestInspectionSlots.length,
      decisions: db.saleRequestDecisions.length,
      ownerDecisions: db.saleRequestOwnerDecisions.length,
      status: row.status,
    };

    for (const writer of WRITERS) await writer.run(app, row.id);

    expect(db.saleRequestInspections).toHaveLength(before.inspections);
    expect(db.saleRequestInspectionSlots).toHaveLength(before.slots);
    expect(db.saleRequestDecisions).toHaveLength(before.decisions);
    expect(db.saleRequestOwnerDecisions).toHaveLength(before.ownerDecisions);
    expect(db.saleRequests.find((r) => r.id === row.id).status).toBe(before.status);
    // E nenhuma notificação: o fluxo aposentado não avisa ninguém de nada.
    expect(db.userNotifications).toHaveLength(0);
  });
});

// ============================================================================
describe("as LEITURAS legadas continuam inteiras (§12)", () => {
  /**
   * O dado não é apagado, e a tela do proprietário continua conseguindo mostrar
   * o que aconteceu. É a diferença entre APOSENTAR um fluxo e destruir o
   * histórico de quem passou por ele.
   */
  it("o proprietário ainda lê inspeção e proposta final de uma solicitação legada", async () => {
    const app = buildApp();
    const { row } = seedLegacy({ status: "final_offer_submitted" });

    const response = await request(app)
      .get(`${OWNER_BASE}/${row.id}`)
      .set("x-test-user", OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.inspection.observed.mileage).toBe(64230);
    expect(response.body.final_decision.final_amount).toBe(FINAL);
    expect(response.body.selected_offer).toBeTruthy();
  });

  it("a decisão do proprietário (4.6) também continua legível", async () => {
    const app = buildApp();
    const { row } = seedLegacy({
      status: "final_offer_accepted",
      ownerDecision: "accepted",
    });

    const response = await request(app)
      .get(`${OWNER_BASE}/${row.id}`)
      .set("x-test-user", OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.owner_final_decision.type).toBe("accepted");
  });

  /** §31 — a nota interna da loja continua sem atravessar a fronteira. */
  it("internal_note continua fora do DTO do proprietário", async () => {
    const app = buildApp();
    const { row } = seedLegacy({ status: "final_offer_submitted" });

    const response = await request(app)
      .get(`${OWNER_BASE}/${row.id}`)
      .set("x-test-user", OWNER_ID);

    expect(JSON.stringify(response.body)).not.toMatch(/internal_note|Margem apertada/i);
  });

  it("a loja selecionada ainda abre a oportunidade legada; a perdedora continua 404", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_LEGACY_STATUSES) {
      const { row } = seedLegacy({ status });

      const selected = await asDealer(
        request(app).get(`${DEALER_BASE}/${row.id}`),
        DEALER_A
      );
      expect(selected.status, `estado ${status}`).toBe(200);
      expect(selected.body.sale_opportunity.is_selected).toBe(true);

      const loser = await asDealer(request(app).get(`${DEALER_BASE}/${row.id}`), DEALER_B);
      expect(loser.status, `perdedora em ${status}`).toBe(404);
    }
  });
});

// ============================================================================
describe("a máquina de estados não deixou ninguém para trás (§1)", () => {
  /**
   * Os seis estados legados continuam sendo "com seleção".
   *
   * É a lista que o CHECK da 060 enumera, e é ela que faz o guard de
   * cancelamento, o DTO do dono e a visibilidade do lojista continuarem certos
   * para as linhas que ficaram no fluxo antigo.
   */
  it("todo estado legado continua em SALE_REQUEST_SELECTED_STATUSES", () => {
    for (const status of SALE_REQUEST_LEGACY_STATUSES) {
      expect(SALE_REQUEST_SELECTED_STATUSES, status).toContain(status);
    }
  });

  it("cancelar continua bloqueado em TODO estado pós-seleção", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_SELECTED_STATUSES) {
      const { row } = seedLegacy({ status });

      const response = await request(app)
        .post(`${OWNER_BASE}/${row.id}/cancel`)
        .set("x-test-user", OWNER_ID)
        .send();

      expect(response.status, `estado ${status}`).toBe(409);
      expect(response.body.details?.code).toBe("SALE_REQUEST_NOT_CANCELLABLE");
      expect(db.saleRequests.find((r) => r.id === row.id).status).toBe(status);
    }
  });

  /**
   * §32 — o handoff da 4.7 NÃO alcança uma solicitação presa no fluxo antigo.
   *
   * "Não houve acordo" exige `offer_selected`. Um estado legado não é isso, e a
   * mensagem diz por quê em vez de devolver um genérico que mandaria a pessoa
   * procurar um botão que não existe.
   */
  it("não houve acordo é recusado em estado legado, com mensagem própria", async () => {
    const app = buildApp();

    for (const status of SALE_REQUEST_LEGACY_STATUSES) {
      const { row } = seedLegacy({ status });

      const response = await request(app)
        .post(`${OWNER_BASE}/${row.id}/handoff/no-agreement`)
        .set("x-test-user", OWNER_ID)
        .send();

      expect(response.status, `estado ${status}`).toBe(409);
      expect(response.body.details?.code).toBe("SALE_REQUEST_HANDOFF_NOT_ACTIVE");
      expect(response.body.message).toMatch(/fluxo antigo/i);
    }
  });
});
