// A ÂNCORA DE MERCADO, DA PUBLICAÇÃO ATÉ A TELA DO LOJISTA (Fase 4.3.2).
//
// Este arquivo existe porque o defeito relatado — "o card não mostra a
// referência FIPE" — atravessa DOIS módulos, e cada um deles já tinha teste
// próprio passando:
//
//   • `sale-requests-service.test.js` prova que a publicação GRAVA o snapshot
//     quando a confiança é alta;
//   • `sale-requests-dealer-feed.test.js` prova que o feed devolve o campo
//     `fipe_reference_value` que estiver na linha.
//
// Nenhum dos dois prova que é o MESMO valor. Um DTO que devolvesse o campo com
// outro nome, uma coluna esquecida na allowlist do lojista ou um arredondamento
// no caminho passariam pelos dois arquivos e quebrariam a tela — que é
// exatamente a classe de falha que a fase foi aberta para investigar.
//
// Aqui a solicitação é publicada pelo SERVICE do dono (com a FIPE resolvida por
// um provedor injetado) e lida pelo ROUTER do lojista, sobre o mesmo fake-db.
// A asserção é de IGUALDADE entre as duas pontas, nunca de "existe algo".
//
// O que este arquivo NÃO prova: a apresentação. Que o número aparece no card e
// no detalhe, e que o NULL não vira "R$ 0,00", é provado onde a decisão visual
// mora — em `frontend/components/account/DealerSaleOpportunities.test.tsx` e
// `DealerSaleOpportunityDetail.test.tsx`.

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";
import { EVALUATION_BODY } from "./evaluation-fixture.js";

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

const BASE = "/api/account/opportunities/sale-requests";
const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };

const OWNER = { id: "7", account_type: "CPF" };
const DEALER_ID = "20";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(BASE, dealerRoutes);
  app.use(errorHandler);
  return app;
}

function seedDealerStore() {
  db.advertisers.push({
    id: 100,
    user_id: DEALER_ID,
    city_id: ATIBAIA.id,
    status: "active",
    name: "Loja Teste",
  });
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
    // O PISO do proprietario (4.3.3) e OBRIGATORIO em toda publicacao nova:
    // sem ele o corpo nem passa da validacao. Os testes que exercitam a REGRA do
    // piso sobrescrevem este valor.
    minimum_accepted_price: "62500.00",
    ...EVALUATION_BODY,
    images: Array.from(
      { length: 4 },
      (_, index) => `sale-requests/${OWNER.id}/sess/2026/08/uuid-${index}.webp`
    ),
    // Os códigos que o formulário do proprietário envia. Não são o VALOR: o
    // servidor cota com eles e ignora qualquer valor vindo do cliente.
    fipe_brand_code: "59",
    fipe_model_code: "5940",
    fipe_year_code: "2020-1",
    ...overrides,
  };
}

/** Provedor que responde com alta confiança — o único caso que vira coluna. */
function fipeHigh(value = 92450) {
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

/** Provedor fora do ar: a publicação segue, e a coluna fica NULL. */
function fipeUnavailable() {
  return vi.fn().mockResolvedValue({
    ok: false,
    value: null,
    fipe_code: null,
    fipe_source: null,
    fipe_snapshot_at: "2026-08-01T00:00:00.000Z",
    confidence: "none",
    failure_reason: "provider_unavailable",
    used_client_hint: false,
  });
}

function asDealer(path = "") {
  return request(buildApp())
    .get(`${BASE}${path}`)
    .set("x-test-user", DEALER_ID)
    .set("x-test-account", "CNPJ");
}

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    users: [{ id: OWNER.id }, { id: DEALER_ID }],
    nextRequestId: 1,
    nextImageId: 1,
  });
  fakeClock.now = () => NOW;
  seedDealerStore();
});

describe("referência FIPE — publicação → banco → feed → detalhe", () => {
  it("o MESMO valor gravado na publicação chega ao card e ao detalhe", async () => {
    const created = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeHigh(),
    });

    // 1. BANCO — a coluna não é NULL, e é texto com duas casas (o driver `pg`
    //    devolve NUMERIC como string; manter o formato nas duas direções é o que
    //    impede que "92450" e "92450.00" pareçam valores diferentes na tela).
    const row = db.saleRequests.find((item) => String(item.id) === String(created.sale_request.id));
    expect(row.fipe_reference_value).toBe("92450.00");
    expect(row.fipe_reference_at).not.toBeNull();

    // 2. FEED — mesmo valor, sem reformatação no caminho.
    const feed = await asDealer();
    expect(feed.status).toBe(200);
    const [item] = feed.body.items;
    expect(item.fipe_reference_value).toBe(row.fipe_reference_value);
    expect(new Date(item.fipe_reference_at).toISOString()).toBe(
      new Date(row.fipe_reference_at).toISOString()
    );

    // 3. DETALHE — a mesma origem do feed, e não uma segunda leitura que possa
    //    divergir.
    const detail = await asDealer(`/${created.sale_request.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.sale_opportunity.fipe_reference_value).toBe(item.fipe_reference_value);
    expect(detail.body.sale_opportunity.fipe_reference_at).toBe(item.fipe_reference_at);
  });

  it("provedor fora do ar: a coluna fica NULL e o lojista recebe NULL — nunca zero", async () => {
    const created = await service.createSaleRequest(OWNER, bodyFor(), {
      resolveFipeReference: fipeUnavailable(),
    });

    const row = db.saleRequests.find((item) => String(item.id) === String(created.sale_request.id));
    expect(row.fipe_reference_value).toBeNull();

    const feed = await asDealer();
    const [item] = feed.body.items;

    // `null`, e não `0`, `"0.00"` nem `""`. Um zero aqui viraria "R$ 0,00" na
    // tela — um número com aparência de referência oficial, contra o qual
    // alguém faria uma proposta.
    expect(item.fipe_reference_value).toBeNull();
    expect(item.fipe_reference_at).toBeNull();

    const detail = await asDealer(`/${created.sale_request.id}`);
    expect(detail.body.sale_opportunity.fipe_reference_value).toBeNull();
  });

  it("o valor NÃO vem do cliente: um `fipe_reference_value` no corpo é ignorado", async () => {
    // O corpo carrega uma referência fabricada e o provedor responde outra. Se o
    // corpo tivesse qualquer autoridade, o lojista veria R$ 500.000 num carro de
    // R$ 92.450 — com a aparência de um número oficial.
    const created = await service.createSaleRequest(
      OWNER,
      bodyFor({ fipe_reference_value: "500000.00", fipe_value: 500000, fipe_code: "999999-9" }),
      { resolveFipeReference: fipeHigh() }
    );

    const feed = await asDealer();
    expect(feed.body.items[0].fipe_reference_value).toBe("92450.00");
    expect(String(created.sale_request.fipe_code)).toBe("005340-6");
  });
});
