// Feed do LOJISTA — contrato HTTP, escopo territorial, privacidade e filtros.
//
// O router REAL é montado num app Express de verdade: este é o arquivo que prova
// ALCANCE. Um teste de service prova a regra; só montar o router prova que a
// regra está no caminho da request — a lição que a Fase 0.1 deixou registrada
// quando `requireDealerAccount` existia, tinha teste e estava montado em zero
// rotas.
//
// O Postgres de mentira (`fake-db.js`) LÊ os predicados do SQL do repository em
// vez de reimplementá-los. Apagar `sr.city_id = $1` do repository não faz o fake
// filtrar por conta própria: faz o teste de "outra cidade não aparece" FALHAR.

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

/**
 * Auth de mentira dirigida por cabeçalho — mesmo formato do teste de rotas do
 * dono. `x-test-user` é o id; `x-test-account` é o `account_type`.
 *
 * O middleware real deriva `account_type` de `users.document_type`; aqui ele é
 * injetado direto porque o que está sob teste é o ROUTER, não a derivação (que
 * tem teste próprio em tests/shared/dealer-authorization-chain.test.js).
 */
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
const DEALER_ID = "20";
const OTHER_DEALER_ID = "21";
const PF_ID = "8";

/** Lojista com UMA loja ativa em Atibaia — o caso feliz. */
function seedDealer({
  userId = DEALER_ID,
  cityId = ATIBAIA.id,
  id = null,
  status = "active",
  name = null,
} = {}) {
  const advertiserId = id ?? db.advertisers.length + 100;
  db.advertisers.push({
    id: advertiserId,
    user_id: userId,
    city_id: cityId,
    status,
    name: name ?? `Loja ${advertiserId}`,
  });
  return advertiserId;
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

function seedImages(saleRequestId, keys) {
  keys.forEach((key, index) => {
    db.saleRequestImages.push({
      id: db.nextImageId++,
      sale_request_id: saleRequestId,
      storage_key: key,
      sort_order: index,
    });
  });
}

function asDealer(app, userId = DEALER_ID, path = "") {
  return request(app)
    .get(`${BASE}${path}`)
    .set("x-test-user", userId)
    .set("x-test-account", "CNPJ");
}

beforeEach(() => {
  resetDb({ cities: [ATIBAIA, BRAGANCA], nextRequestId: 1, nextImageId: 1 });
  seq = 0;
  fakeClock.now = () => NOW;
});

// ============================================================================
describe("guardas de acesso", () => {
  it("sem sessão devolve 401", async () => {
    const response = await request(buildApp()).get(BASE);
    expect(response.status).toBe(401);
  });

  it("conta CPF recebe 403 com código estável — o feed é exclusivo do lojista", async () => {
    seedDealer();
    seedRequest();

    const response = await request(buildApp())
      .get(BASE)
      .set("x-test-user", PF_ID)
      .set("x-test-account", "CPF");

    expect(response.status).toBe(403);
    expect(response.body?.details?.code).toBe("DEALER_ACCOUNT_REQUIRED");
  });

  it("conta `pending` também recebe 403 — o guard falha fechado", async () => {
    const response = await request(buildApp())
      .get(BASE)
      .set("x-test-user", PF_ID)
      .set("x-test-account", "pending");

    expect(response.status).toBe(403);
  });

  it("lojista com loja ativa recebe 200", async () => {
    seedDealer();
    const response = await asDealer(buildApp());
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("toda resposta é privada e não cacheável", async () => {
    seedDealer();
    const response = await asDealer(buildApp());
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});

// ============================================================================
describe("resolução da loja — multi-advertiser determinístico", () => {
  it("CNPJ SEM loja nenhuma recebe 403, não uma lista vazia", async () => {
    seedRequest();
    const response = await asDealer(buildApp());

    expect(response.status).toBe(403);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_UNRESOLVED");
  });

  it("loja BLOQUEADA não resolve cidade — moderação corta o acesso", async () => {
    seedDealer({ status: "blocked" });
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.status).toBe(403);
  });

  it("status NULL conta como ativo — linha anterior à coluna não perde acesso", async () => {
    seedDealer({ status: null });
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.status).toBe(200);
  });

  // ==========================================================================
  // MAIS DE UMA LOJA: O SERVIDOR NÃO DESEMPATA
  // ==========================================================================
  // Uma versão anterior desta fase escolhia a loja de MENOR id. Era
  // determinístico — e atribuía a proposta a uma empresa que talvez não a
  // tivesse feito. Os testes abaixo travam a regra que substituiu aquela.

  it("DUAS lojas em cidades DIFERENTES: 409 pedindo escolha, não um 403 mudo", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: BRAGANCA.id });
    seedRequest();

    const response = await asDealer(buildApp());

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED");
  });

  it("DUAS lojas na MESMA cidade também exigem escolha — a cidade não desambigua a LOJA", async () => {
    seedDealer({ id: 205, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: ATIBAIA.id });
    seedRequest();

    const response = await asDealer(buildApp());

    expect(response.status).toBe(409);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED");
  });

  it("o 409 carrega as lojas do PRÓPRIO usuário, para a tela oferecer a escolha", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id, name: "Auto Atibaia" });
    seedDealer({ id: 101, cityId: BRAGANCA.id, name: "Auto Bragança" });

    const response = await asDealer(buildApp());
    const stores = response.body?.details?.stores ?? [];

    expect(stores).toHaveLength(2);
    expect(stores.map((store) => store.name).sort()).toEqual(["Auto Atibaia", "Auto Bragança"]);
    expect(stores[0].city).toEqual({ name: ATIBAIA.name, state: ATIBAIA.state });
  });

  it("escolhendo a loja de Atibaia, o feed é de ATIBAIA", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: BRAGANCA.id });
    const here = seedRequest({ city_id: ATIBAIA.id });
    seedRequest({ city_id: BRAGANCA.id });

    const response = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=100");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item) => item.id)).toEqual([here.id]);
  });

  it("escolhendo a loja de Bragança, o MESMO usuário vê o feed de BRAGANÇA", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: BRAGANCA.id });
    seedRequest({ city_id: ATIBAIA.id });
    const there = seedRequest({ city_id: BRAGANCA.id });

    const response = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=101");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item) => item.id)).toEqual([there.id]);
  });

  it("loja de OUTRO usuário é recusada — o id pedido nunca vira autorização", async () => {
    seedDealer({ id: 100, userId: DEALER_ID, cityId: ATIBAIA.id });
    seedDealer({ id: 900, userId: OTHER_DEALER_ID, cityId: ATIBAIA.id });
    seedRequest();

    const response = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=900");

    expect(response.status).toBe(403);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_INVALID");
  });

  it("loja INEXISTENTE recebe a MESMA resposta de loja alheia", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedRequest();

    const alheia = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=999999");

    expect(alheia.status).toBe(403);
    expect(alheia.body?.details?.code).toBe("SALE_OPPORTUNITY_STORE_INVALID");
  });

  it("loja SUSPENSA do próprio usuário é recusada", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: ATIBAIA.id, status: "suspended" });
    seedRequest();

    const response = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=101");
    expect(response.status).toBe(403);
  });

  it("com UMA loja só, o advertiser_id é dispensável — e o correto é aceito", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedRequest();

    const semParam = await asDealer(buildApp());
    const comParam = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=100");

    expect(semParam.status).toBe(200);
    expect(comParam.status).toBe(200);
  });

  it("com UMA loja só, pedir OUTRA continua sendo recusado", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedRequest();

    const response = await asDealer(buildApp(), DEALER_ID, "?advertiser_id=101");
    expect(response.status).toBe(403);
  });

  it("loja sem cidade no catálogo não entra no conjunto elegível", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id });
    seedDealer({ id: 101, cityId: 987654 });
    seedRequest();

    // Duas linhas em advertisers, mas só UMA elegível → resolve sozinha, sem
    // pedir escolha.
    const response = await asDealer(buildApp());
    expect(response.status).toBe(200);
  });

  it("loja bloqueada em OUTRA cidade não cria conflito com a loja boa", async () => {
    seedDealer({ id: 100, cityId: ATIBAIA.id, status: "active" });
    seedDealer({ id: 101, cityId: BRAGANCA.id, status: "blocked" });
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("loja SEM cidade não resolve — nada de inferir de users.city ou do primeiro anúncio", async () => {
    seedDealer({ cityId: null });
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.status).toBe(403);
  });
});

// ============================================================================
describe("escopo territorial e de estado", () => {
  it("mostra só a cidade da loja — a de outra cidade não aparece", async () => {
    seedDealer({ cityId: ATIBAIA.id });
    const mine = seedRequest({ city_id: ATIBAIA.id });
    seedRequest({ city_id: BRAGANCA.id });

    const response = await asDealer(buildApp());

    expect(response.body.items.map((item) => item.id)).toEqual([mine.id]);
  });

  it("a cidade NÃO pode ser escolhida pelo cliente: ?city_id de outra cidade é ignorado", async () => {
    seedDealer({ cityId: ATIBAIA.id });
    seedRequest({ city_id: ATIBAIA.id });
    const foreign = seedRequest({ city_id: BRAGANCA.id });

    const response = await request(buildApp())
      .get(`${BASE}?city_id=${BRAGANCA.id}`)
      .set("x-test-user", DEALER_ID)
      .set("x-test-account", "CNPJ");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item) => item.id)).not.toContain(foreign.id);
  });

  it("solicitação CANCELADA nunca aparece", async () => {
    seedDealer();
    const open = seedRequest();
    seedRequest({ status: "cancelled" });

    const response = await asDealer(buildApp());
    expect(response.body.items.map((item) => item.id)).toEqual([open.id]);
  });

  it("um estado FUTURO desconhecido também não aparece — a lista é igualdade, não negação", async () => {
    seedDealer();
    const open = seedRequest();
    // `selected` pertence a uma fase seguinte. O feed não pode passar a
    // mostrá-lo automaticamente no dia em que a migration existir.
    seedRequest({ status: "selected" });

    const response = await asDealer(buildApp());
    expect(response.body.items.map((item) => item.id)).toEqual([open.id]);
  });
});

// ============================================================================
describe("privacidade — nenhum dado da pessoa física", () => {
  const FORBIDDEN = [
    "owner_user_id",
    "user_id",
    "email",
    "phone",
    "mobile_phone",
    "whatsapp",
    "cpf",
    "document",
    "document_type",
    "address",
    "name",
    "seller",
    "owner",
  ];

  it("o JSON SERIALIZADO do feed não contém nenhuma chave de identificação", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());

    // O `city` é removido ANTES da varredura, e só ele. `city.name` é o nome do
    // MUNICÍPIO — a cidade é justamente o dado que o produto precisa entregar —
    // enquanto um `name` em qualquer outro lugar da resposta só poderia ser o da
    // pessoa. Sem esse recorte, a asserção teria de largar `"name"` da lista, e
    // um `seller_name` acrescentado amanhã passaria despercebido.
    const withoutCity = JSON.parse(JSON.stringify(response.body));
    for (const item of withoutCity.items || []) delete item.city;

    const raw = JSON.stringify(withoutCity);

    for (const field of FORBIDDEN) {
      // Busca a CHAVE no JSON serializado, não a propriedade do objeto de
      // topo: um campo aninhado três níveis abaixo vaza igual.
      expect(raw).not.toContain(`"${field}"`);
    }
  });

  it("o item do feed carrega exatamente o contrato acordado, e nada além", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());
    const [item] = response.body.items;

    expect(Object.keys(item).sort()).toEqual(
      [
        "brand",
        "brand_slug",
        "city",
        "created_at",
        "declared_condition",
        "evaluation",
        "fipe_model_description",

        // O PISO do proprietario (4.3.3): dado COMERCIAL, o unico valor que o
        // card mostra. Entra na lista porque a lista e o contrato — campo novo
        // so chega ao lojista se alguem escreve-lo aqui, a mao.
        "minimum_accepted_price",
        "fipe_reference_at",
        "fipe_reference_value",
        "fuel_type",
        "id",
        "image",
        "mileage",
        "model",
        "model_slug",
        "status",
        "transmission",
        "year",

        // Estado da disputa (Subfase B). São QUATRO campos, e nenhum deles é
        // identificador: valor líder, valor desta loja, se ela lidera e quantas
        // propostas existem. Um quinto campo com `advertiser_id` do líder
        // quebraria esta lista — que é exatamente o ponto de tê-la aqui.
        "current_highest_offer",
        "my_offer",
        "is_leading",
        "offers_count",
      ].sort()
    );
  });

  it("`city` traz localidade, nunca endereço", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.body.items[0].city).toEqual({
      name: ATIBAIA.name,
      state: ATIBAIA.state,
      slug: ATIBAIA.slug,
    });
  });
});

// ============================================================================
describe("ficha de avaliação no card", () => {
  it("vem inteira, para que os badges do card não exijam segunda request", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());
    const { evaluation } = response.body.items[0];

    expect(evaluation.tire_condition).toBe("good");
    expect(evaluation.caution_report_status).toBe("not_available");
    expect(evaluation.auction_history).toBe("no");
    expect(evaluation.financing_status).toBe("no");
  });

  it("NULL legado continua NULL — nunca vira 'no' nem 'unknown'", async () => {
    seedDealer();
    seedRequest({
      tire_condition: null,
      financing_status: null,
      auction_history: null,
      caution_report_status: null,
      body_paint_status: null,
      body_paint_issues: null,
    });

    const response = await asDealer(buildApp());
    const { evaluation } = response.body.items[0];

    expect(evaluation.tire_condition).toBeNull();
    expect(evaluation.financing_status).toBeNull();
    expect(evaluation.auction_history).toBeNull();
    expect(evaluation.caution_report_status).toBeNull();
    expect(evaluation.body_paint_issues).toBeNull();
  });

  it("'unknown' explícito NÃO é confundido com ausência", async () => {
    seedDealer();
    seedRequest({ financing_status: "unknown", auction_history: "unknown" });

    const response = await asDealer(buildApp());
    const { evaluation } = response.body.items[0];

    expect(evaluation.financing_status).toBe("unknown");
    expect(evaluation.auction_history).toBe("unknown");
  });

  it("lista vazia de avarias é diferente de NULL: respondido x não perguntado", async () => {
    seedDealer();
    seedRequest({ body_paint_status: "none", body_paint_issues: [] });

    const response = await asDealer(buildApp());
    expect(response.body.items[0].evaluation.body_paint_issues).toEqual([]);
  });
});

// ============================================================================
describe("capa do card", () => {
  it("usa a foto de sort_order 0, e só ela", async () => {
    seedDealer();
    const row = seedRequest();
    seedImages(row.id, [
      `sale-requests/${OWNER_ID}/s/capa.webp`,
      `sale-requests/${OWNER_ID}/s/segunda.webp`,
      `sale-requests/${OWNER_ID}/s/terceira.webp`,
    ]);

    const response = await asDealer(buildApp());
    expect(response.body.items[0].image).toContain("capa.webp");
  });

  it("a capa não vaza para o card vizinho — uma por solicitação", async () => {
    seedDealer();
    const first = seedRequest();
    const second = seedRequest();
    seedImages(first.id, [`sale-requests/${OWNER_ID}/s/primeira.webp`]);
    seedImages(second.id, [`sale-requests/${OWNER_ID}/s/segunda.webp`]);

    const response = await asDealer(buildApp());
    const byId = new Map(response.body.items.map((item) => [String(item.id), item.image]));

    expect(byId.get(String(first.id))).toContain("primeira.webp");
    expect(byId.get(String(second.id))).toContain("segunda.webp");
  });

  it("solicitação sem foto devolve `image: null` — nunca uma URL inventada", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());
    expect(response.body.items[0].image).toBeNull();
  });
});

// ============================================================================
describe("filtros", () => {
  beforeEach(() => {
    seedDealer();
  });

  it("marca", async () => {
    const vw = seedRequest({ brand_slug: "volkswagen" });
    seedRequest({ brand_slug: "fiat", model_slug: "argo" });

    const response = await asDealer(buildApp(), DEALER_ID, "?brand=volkswagen");
    expect(response.body.items.map((item) => item.id)).toEqual([vw.id]);
  });

  it("ano mínimo e máximo", async () => {
    seedRequest({ year: 2015 });
    const target = seedRequest({ year: 2020 });
    seedRequest({ year: 2024 });

    const response = await asDealer(buildApp(), DEALER_ID, "?year_min=2019&year_max=2021");
    expect(response.body.items.map((item) => item.id)).toEqual([target.id]);
  });

  it("quilometragem máxima", async () => {
    const low = seedRequest({ mileage: 20000 });
    seedRequest({ mileage: 120000 });

    const response = await asDealer(buildApp(), DEALER_ID, "?mileage_max=50000");
    expect(response.body.items.map((item) => item.id)).toEqual([low.id]);
  });

  it("câmbio aceita a forma ACENTUADA e casa o slug gravado", async () => {
    const auto = seedRequest({ transmission: "automatico" });
    seedRequest({ transmission: "manual" });

    const response = await asDealer(
      buildApp(),
      DEALER_ID,
      `?transmission=${encodeURIComponent("Automático")}`
    );
    expect(response.body.items.map((item) => item.id)).toEqual([auto.id]);
  });

  it("estado geral declarado", async () => {
    const excelente = seedRequest({ declared_condition: "excelente" });
    seedRequest({ declared_condition: "precisa_reparos" });

    const response = await asDealer(buildApp(), DEALER_ID, "?declared_condition=excelente");
    expect(response.body.items.map((item) => item.id)).toEqual([excelente.id]);
  });

  it("passagem por leilão", async () => {
    const clean = seedRequest({ auction_history: "no" });
    seedRequest({ auction_history: "yes" });

    const response = await asDealer(buildApp(), DEALER_ID, "?auction_history=no");
    expect(response.body.items.map((item) => item.id)).toEqual([clean.id]);
  });

  it("filtrar por 'no' NÃO traz a linha legada com NULL — ausência não é declaração", async () => {
    const declared = seedRequest({ auction_history: "no" });
    seedRequest({ auction_history: null });

    const response = await asDealer(buildApp(), DEALER_ID, "?auction_history=no");
    expect(response.body.items.map((item) => item.id)).toEqual([declared.id]);
  });

  it("pneus e laudo cautelar", async () => {
    const target = seedRequest({ tire_condition: "new", caution_report_status: "approved" });
    seedRequest({ tire_condition: "replace_now", caution_report_status: "rejected" });

    const response = await asDealer(
      buildApp(),
      DEALER_ID,
      "?tire_condition=new&caution_report_status=approved"
    );
    expect(response.body.items.map((item) => item.id)).toEqual([target.id]);
  });

  it("dois filtros combinam por AND", async () => {
    const target = seedRequest({ brand_slug: "fiat", year: 2022 });
    seedRequest({ brand_slug: "fiat", year: 2012 });
    seedRequest({ brand_slug: "volkswagen", year: 2022 });

    const response = await asDealer(buildApp(), DEALER_ID, "?brand=fiat&year_min=2020");
    expect(response.body.items.map((item) => item.id)).toEqual([target.id]);
  });

  it("valor FORA do vocabulário é 400, e não um filtro que não filtra", async () => {
    seedRequest({ auction_history: "yes" });

    const response = await asDealer(buildApp(), DEALER_ID, "?auction_history=nao");

    expect(response.status).toBe(400);
    expect(response.body?.details?.code).toBe("SALE_OPPORTUNITY_INVALID_FILTER");
    expect(response.body?.details?.field).toBe("auction_history");
  });

  it("faixa de ano invertida é 400 — não uma lista vazia sem explicação", async () => {
    const response = await asDealer(buildApp(), DEALER_ID, "?year_min=2020&year_max=2015");
    expect(response.status).toBe(400);
    expect(response.body?.details?.field).toBe("year_min");
  });

  it("ordenação desconhecida é 400", async () => {
    const response = await asDealer(buildApp(), DEALER_ID, "?sort=maior_margem");
    expect(response.status).toBe(400);
  });
});

// ============================================================================
describe("ordenação", () => {
  beforeEach(() => {
    seedDealer();
  });

  it("padrão: mais recentes primeiro", async () => {
    const older = seedRequest();
    const newer = seedRequest({ created_at: new Date(NOW).toISOString() });

    const response = await asDealer(buildApp());
    expect(response.body.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(response.body.sort).toBe("recent");
  });

  it("mais antigos primeiro", async () => {
    const older = seedRequest({ created_at: new Date(NOW - 900000).toISOString() });
    const newer = seedRequest({ created_at: new Date(NOW).toISOString() });

    const response = await asDealer(buildApp(), DEALER_ID, "?sort=oldest");
    expect(response.body.items.map((item) => item.id)).toEqual([older.id, newer.id]);
  });

  it("ano mais novo primeiro", async () => {
    const old = seedRequest({ year: 2014 });
    const recent = seedRequest({ year: 2024 });

    const response = await asDealer(buildApp(), DEALER_ID, "?sort=year_desc");
    expect(response.body.items.map((item) => item.id)).toEqual([recent.id, old.id]);
  });

  it("menor quilometragem primeiro", async () => {
    const high = seedRequest({ mileage: 180000 });
    const low = seedRequest({ mileage: 12000 });

    const response = await asDealer(buildApp(), DEALER_ID, "?sort=mileage_asc");
    expect(response.body.items.map((item) => item.id)).toEqual([low.id, high.id]);
  });
});

// ============================================================================
describe("paginação por cursor", () => {
  beforeEach(() => {
    seedDealer();
  });

  it("percorre a lista inteira sem repetir nem perder item", async () => {
    const app = buildApp();
    const created = Array.from({ length: 7 }, () => seedRequest());

    const seen = [];
    let cursor = null;

    for (let page = 0; page < 10; page += 1) {
      const url = cursor
        ? `?limit=3&cursor=${encodeURIComponent(cursor)}`
        : "?limit=3";
      const response = await asDealer(app, DEALER_ID, url);
      expect(response.status).toBe(200);

      seen.push(...response.body.items.map((item) => String(item.id)));
      cursor = response.body.next_cursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(created.length);
    expect(new Set(seen).size).toBe(created.length);
  });

  it("timestamps IDÊNTICOS não fazem item sumir — a tupla desempata pelo id", async () => {
    const app = buildApp();
    const sameInstant = new Date(NOW - 1000).toISOString();
    Array.from({ length: 5 }, () => seedRequest({ created_at: sameInstant }));

    const seen = [];
    let cursor = null;

    for (let page = 0; page < 10; page += 1) {
      const url = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
      const response = await asDealer(app, DEALER_ID, url);
      seen.push(...response.body.items.map((item) => String(item.id)));
      cursor = response.body.next_cursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(5);
  });

  it("pagina corretamente numa ordenação NUMÉRICA (a que o codec compartilhado corromperia)", async () => {
    const app = buildApp();
    Array.from({ length: 5 }, (_, index) => seedRequest({ mileage: 10000 * (index + 1) }));

    const seen = [];
    let cursor = null;

    for (let page = 0; page < 10; page += 1) {
      const url = cursor
        ? `?sort=mileage_asc&limit=2&cursor=${encodeURIComponent(cursor)}`
        : "?sort=mileage_asc&limit=2";
      const response = await asDealer(app, DEALER_ID, url);
      expect(response.status).toBe(200);
      seen.push(...response.body.items.map((item) => item.mileage));
      cursor = response.body.next_cursor;
      if (!cursor) break;
    }

    expect(seen).toEqual([10000, 20000, 30000, 40000, 50000]);
  });

  it("última página devolve next_cursor null", async () => {
    seedRequest();
    const response = await asDealer(buildApp(), DEALER_ID, "?limit=10");
    expect(response.body.next_cursor).toBeNull();
  });

  it("cursor de OUTRA ordenação recomeça do início, em vez de derrubar a tela", async () => {
    const app = buildApp();
    Array.from({ length: 4 }, () => seedRequest());

    const first = await asDealer(app, DEALER_ID, "?limit=2");
    const cursorFromRecent = first.body.next_cursor;

    const response = await asDealer(
      app,
      DEALER_ID,
      `?sort=mileage_asc&limit=2&cursor=${encodeURIComponent(cursorFromRecent)}`
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
  });

  it("cursor com lixo devolve a primeira página, não 400", async () => {
    seedRequest();
    const response = await asDealer(buildApp(), DEALER_ID, "?cursor=%%%naovalido%%%");
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it("limite absurdo cai no teto, e não em erro", async () => {
    seedRequest();
    const response = await asDealer(buildApp(), DEALER_ID, "?limit=99999");
    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(48);
  });
});

// ============================================================================
describe("métricas do cabeçalho", () => {
  it("conta a cidade inteira, não só a página", async () => {
    seedDealer();
    Array.from({ length: 5 }, () => seedRequest());

    const response = await asDealer(buildApp(), DEALER_ID, "?limit=2");

    expect(response.body.items).toHaveLength(2);
    expect(response.body.summary.total).toBe(5);
  });

  it("respeita os filtros aplicados — o número descreve o que a tela mostra", async () => {
    seedDealer();
    seedRequest({ brand_slug: "fiat" });
    seedRequest({ brand_slug: "volkswagen" });
    seedRequest({ brand_slug: "volkswagen" });

    const response = await asDealer(buildApp(), DEALER_ID, "?brand=volkswagen");
    expect(response.body.summary.total).toBe(2);
  });

  it("`new_today` usa janela móvel de 24h e não conta a de ontem", async () => {
    seedDealer();
    seedRequest({ created_at: new Date(NOW - 3600000).toISOString() });
    seedRequest({ created_at: new Date(NOW - 30 * 3600000).toISOString() });

    const response = await asDealer(buildApp());
    expect(response.body.summary.total).toBe(2);
    expect(response.body.summary.new_today).toBe(1);
  });

  it("não existe métrica sem fonte: nada de margem, interesse ou nível", async () => {
    seedDealer();
    seedRequest();

    const response = await asDealer(buildApp());
    expect(Object.keys(response.body.summary).sort()).toEqual(
      ["new_today", "total", "with_my_offer", "without_my_offer"].sort()
    );
  });
});

// ============================================================================
describe("detalhe", () => {
  it("devolve a ficha completa e a galeria ordenada", async () => {
    seedDealer();
    const row = seedRequest({ known_issues: "Ar-condicionado gelando pouco." });
    seedImages(row.id, [
      `sale-requests/${OWNER_ID}/s/a.webp`,
      `sale-requests/${OWNER_ID}/s/b.webp`,
      `sale-requests/${OWNER_ID}/s/c.webp`,
    ]);

    const response = await asDealer(buildApp(), DEALER_ID, `/${row.id}`);

    expect(response.status).toBe(200);
    const detail = response.body.sale_opportunity;
    expect(detail.images).toHaveLength(3);
    expect(detail.images[0]).toContain("a.webp");
    expect(detail.images[2]).toContain("c.webp");
    expect(detail.known_issues).toBe("Ar-condicionado gelando pouco.");
    expect(detail.evaluation.engine_condition).toBe("ok");
  });

  it("id inexistente é 404", async () => {
    seedDealer();
    const response = await asDealer(buildApp(), DEALER_ID, "/9999");
    expect(response.status).toBe(404);
  });

  it("solicitação de OUTRA cidade é 404 — nunca 403 com motivo", async () => {
    seedDealer({ cityId: ATIBAIA.id });
    const foreign = seedRequest({ city_id: BRAGANCA.id });

    const response = await asDealer(buildApp(), DEALER_ID, `/${foreign.id}`);

    expect(response.status).toBe(404);
    // O corpo não pode confirmar a existência: quem sonda ids de fora da cidade
    // aprenderia que alguém ali está vendendo um carro.
    expect(JSON.stringify(response.body)).not.toContain("cidade");
  });

  it("solicitação CANCELADA é 404 para o lojista", async () => {
    seedDealer();
    const cancelled = seedRequest({ status: "cancelled" });

    const response = await asDealer(buildApp(), DEALER_ID, `/${cancelled.id}`);
    expect(response.status).toBe(404);
  });

  it("404 privado NUNCA vira cache público", async () => {
    seedDealer();
    const response = await asDealer(buildApp(), DEALER_ID, "/9999");

    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["cache-control"]).not.toContain("public");
  });

  it("o detalhe não carrega nenhum dado da pessoa física", async () => {
    seedDealer();
    const row = seedRequest();
    seedImages(row.id, [`sale-requests/${OWNER_ID}/s/a.webp`]);

    const response = await asDealer(buildApp(), DEALER_ID, `/${row.id}`);
    const raw = JSON.stringify(response.body);

    for (const field of ["owner_user_id", "email", "phone", "whatsapp", "cpf", "document"]) {
      expect(raw).not.toContain(`"${field}"`);
    }
  });

  it("conta CPF não alcança o detalhe", async () => {
    seedDealer();
    const row = seedRequest();

    const response = await request(buildApp())
      .get(`${BASE}/${row.id}`)
      .set("x-test-user", PF_ID)
      .set("x-test-account", "CPF");

    expect(response.status).toBe(403);
  });

  it("lojista de OUTRA cidade não alcança o detalhe da primeira", async () => {
    seedDealer({ userId: DEALER_ID, cityId: ATIBAIA.id, id: 100 });
    seedDealer({ userId: OTHER_DEALER_ID, cityId: BRAGANCA.id, id: 200 });
    const row = seedRequest({ city_id: ATIBAIA.id });

    const mine = await asDealer(buildApp(), DEALER_ID, `/${row.id}`);
    const theirs = await asDealer(buildApp(), OTHER_DEALER_ID, `/${row.id}`);

    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(404);
  });
});

// ============================================================================
describe("ausência de canal de contato", () => {
  it("nenhuma rota de contato existe neste router", async () => {
    seedDealer();
    const row = seedRequest();
    const app = buildApp();

    for (const path of [`/${row.id}/whatsapp`, `/${row.id}/contato`, `/${row.id}/telefone`]) {
      const response = await asDealer(app, DEALER_ID, path);
      // 404 do Express (rota inexistente) — não é uma rota que responde.
      expect(response.status).toBe(404);
    }
  });

  it("a resposta não contém nenhum termo de contato direto", async () => {
    seedDealer();
    const row = seedRequest();

    const response = await asDealer(buildApp(), DEALER_ID, `/${row.id}`);
    const raw = JSON.stringify(response.body).toLowerCase();

    for (const term of ["whatsapp", "wa.me", "telefone", "tel:", "mailto"]) {
      expect(raw).not.toContain(term);
    }
  });
});
