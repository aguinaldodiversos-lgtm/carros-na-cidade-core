// Filtros, ordenação e contagem do feed "Compradores ativos" (Fase 4.11C).
//
// O router REAL é montado num Express de verdade, contra o `fake-db` que lê o
// SQL emitido. Isso é o que dá valor às asserções abaixo: elas provam que o
// REPOSITORY produziu a cláusula, não que o service recebeu um objeto.
//
// Um teste que chamasse o service com `{ filters: { transmission: "manual" } }`
// e conferisse o resultado continuaria verde depois de alguém apagar
// `add("pi.transmission = $?")` do repository — e o feed voltaria a ignorar o
// câmbio em produção sem uma linha vermelha em lugar nenhum.
//
// A tela que consome este contrato tem prova própria em
// `frontend/e2e/active-buyers-card-grid.spec.ts` (geometria) e em
// `frontend/components/account/opportunities/ActiveBuyer*.test.tsx` (render).

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";

const queryCalls = [];

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => {
    queryCalls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
    return fakeQuery(sql, params);
  },
  pool: {
    query: (sql, params) => {
      queryCalls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      return fakeQuery(sql, params);
    },
  },
  withTransaction: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  const handler = (req, res, next) => {
    const asUser = req.headers["x-test-user"];
    if (!asUser) return res.status(401).json({ error: "unauth" });
    req.user = {
      id: String(asUser),
      role: "user",
      plan: "free",
      account_type: String(req.headers["x-test-account"] || "CNPJ"),
    };
    return next();
  };
  return { authMiddleware: handler, default: handler };
});

const dealerRoutes = (
  await import("../../src/modules/purchase-intents/purchase-intents.dealer.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

const BASE = "/api/account/opportunities/purchase-intents";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(BASE, dealerRoutes);
  app.use(errorHandler);
  return app;
}

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const DAY = 86400000;
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

/** Uma procura já persistida. `minutesAgo` separa os `created_at`. */
function seedIntent(overrides = {}, minutesAgo = 0) {
  const id = db.nextIntentId;
  db.nextIntentId += 1;
  const createdAt = new Date(NOW - minutesAgo * 60000).toISOString();

  db.purchaseIntents.push({
    id,
    buyer_user_id: "10",
    city_id: ATIBAIA.id,
    intent_type: "specific_model",
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    body_type: null,
    transmission: "automatico",
    max_price: "95000.00",
    purchase_timeframe: "within_30_days",
    status: "active",
    expires_at: new Date(NOW + 30 * DAY).toISOString(),
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  });
  return id;
}

/** `open_category` tem carroceria e NÃO tem marca — é o CHECK da tabela. */
function seedCategory(overrides = {}, minutesAgo = 0) {
  return seedIntent(
    {
      intent_type: "open_category",
      brand: null,
      brand_slug: null,
      model: null,
      model_slug: null,
      body_type: "suv",
      ...overrides,
    },
    minutesAgo
  );
}

function get(path, user = "20") {
  return request(buildApp()).get(`${BASE}${path}`).set("x-test-user", user);
}

const ids = (res) => res.body.purchase_intents.map((item) => item.id);

beforeEach(() => {
  queryCalls.length = 0;
  fakeClock.now = () => NOW;
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    users: [
      { id: "10", document_type: "cpf" },
      { id: "20", document_type: "cnpj" },
    ],
    advertisers: [{ id: 1, user_id: "20", city_id: ATIBAIA.id }],
  });
});

describe("contagem do cabeçalho", () => {
  it("`summary.total` conta a CIDADE inteira, não a página", async () => {
    for (let index = 0; index < 25; index += 1) seedIntent({}, index);

    const res = await get("?limit=6");

    expect(res.status).toBe(200);
    // O número do cabeçalho e o tamanho da página são perguntas diferentes.
    // `items.length` diria "6" para uma cidade com 25 procuras.
    expect(res.body.summary.total).toBe(25);
    expect(res.body.purchase_intents).toHaveLength(6);
  });

  it("a contagem respeita os MESMOS filtros da lista", async () => {
    seedIntent({ transmission: "manual" });
    seedIntent({ transmission: "manual" }, 1);
    seedIntent({ transmission: "automatico" }, 2);

    const res = await get("?transmission=manual");

    expect(res.body.summary.total).toBe(2);
    expect(res.body.purchase_intents).toHaveLength(2);
  });

  it("lojista sem cidade resolvida: total 0, e nenhuma contagem no banco", async () => {
    db.advertisers = [];
    const res = await get("");

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(0);
    expect(res.body.purchase_intents).toEqual([]);
    expect(queryCalls.some((call) => /COUNT\(\*\)::int AS total/i.test(call.sql))).toBe(false);
  });
});

describe("filtros", () => {
  it("intent_type separa os dois modos reais", async () => {
    const especifica = seedIntent();
    const categoria = seedCategory({}, 1);

    expect(ids(await get("?intent_type=specific_model"))).toEqual([especifica]);
    expect(ids(await get("?intent_type=open_category"))).toEqual([categoria]);
    expect(ids(await get(""))).toEqual([especifica, categoria]);
  });

  it("marca casa por SLUG, e o cliente pode mandar o rótulo que recebeu", async () => {
    const vw = seedIntent({ brand: "Volkswagen", brand_slug: "volkswagen" });
    seedIntent({ brand: "Fiat", brand_slug: "fiat" }, 1);

    // O DTO do lojista traz `brand` (rótulo), não `brand_slug`. O servidor
    // canonicaliza — senão o `<select>` alimentado pelo próprio feed nunca
    // casaria a coluna.
    expect(ids(await get("?brand=Volkswagen"))).toEqual([vw]);
    // E o prefixo de grupo da FIPE converge para o mesmo slug.
    expect(ids(await get("?brand=VW%20-%20VolksWagen"))).toEqual([vw]);
  });

  it("carroceria casa `open_category`, e uma procura específica nunca entra", async () => {
    seedIntent();
    const suv = seedCategory({ body_type: "suv" }, 1);
    seedCategory({ body_type: "hatch" }, 2);

    expect(ids(await get("?body_type=suv"))).toEqual([suv]);
  });

  it("carroceria aceita o RÓTULO acentuado — é o mesmo normalizador da escrita", async () => {
    const sedan = seedCategory({ body_type: "sedan" });

    // "Sedã" é o que a tela mostra; 'sedan' é o que o banco guarda. Comparação
    // crua devolveria lista vazia para um filtro que o usuário vê marcado.
    expect(ids(await get("?body_type=Sed%C3%A3"))).toEqual([sedan]);
  });

  it("câmbio e prazo de compra filtram de verdade", async () => {
    const manualUrgente = seedIntent({
      transmission: "manual",
      purchase_timeframe: "as_soon_as_possible",
    });
    seedIntent({ transmission: "manual", purchase_timeframe: "within_30_days" }, 1);
    seedIntent({ transmission: "automatico", purchase_timeframe: "as_soon_as_possible" }, 2);

    expect(ids(await get("?transmission=manual&purchase_timeframe=as_soon_as_possible"))).toEqual([
      manualUrgente,
    ]);
  });

  it("a faixa de orçamento compara o TETO declarado, inclusive nas bordas", async () => {
    const baixo = seedIntent({ max_price: "40000.00" });
    const meio = seedIntent({ max_price: "60000.00" }, 1);
    seedIntent({ max_price: "95000.00" }, 2);

    // Bordas INCLUSIVAS: quem digita "até 60.000" espera ver o de 60.000.
    expect(ids(await get("?budget_min=40000&budget_max=60000"))).toEqual([baixo, meio]);
  });

  it("marca e carroceria juntas devolvem vazio — e isso é a leitura correta", async () => {
    seedIntent({ brand_slug: "volkswagen" });
    seedCategory({ body_type: "suv" }, 1);

    // Nenhuma linha tem as duas colunas preenchidas: o CHECK da tabela proíbe.
    // Um `OR` aqui inventaria um resultado que o vocabulário não comporta.
    const res = await get("?brand=Volkswagen&body_type=suv");
    expect(res.body.purchase_intents).toEqual([]);
    expect(res.body.summary.total).toBe(0);
  });

  it("o filtro NÃO afrouxa o escopo de cidade nem o de validade", async () => {
    seedIntent({ city_id: BRAGANCA.id, transmission: "manual" });
    seedIntent({
      transmission: "manual",
      expires_at: new Date(NOW - DAY).toISOString(),
    });
    const viva = seedIntent({ transmission: "manual" }, 1);

    // Um filtro é uma restrição A MAIS. Se ele substituísse o WHERE em vez de
    // somar-se a ele, a procura de Bragança apareceria para a loja de Atibaia.
    expect(ids(await get("?transmission=manual"))).toEqual([viva]);
  });
});

describe("filtro desconhecido é 400 — nunca um feed inteiro disfarçado", () => {
  it.each([
    ["?intent_type=cabe_no_bolso", "intent_type"],
    ["?transmission=Manual%20ou%20automatico", "transmission"],
    ["?body_type=conversivel", "body_type"],
    ["?purchase_timeframe=amanha", "purchase_timeframe"],
    ["?budget_max=muito", "budget_max"],
    ["?sort=maior_urgencia", "sort"],
  ])("%s → 400", async (queryString) => {
    const res = await get(queryString);

    expect(res.status).toBe(400);
    // Aceitar em silêncio devolveria a cidade inteira sob um cabeçalho que
    // promete um recorte — o lojista abordaria compradores que não pediu.
    expect(res.body.purchase_intents).toBeUndefined();
  });

  it("faixa de orçamento invertida é 400, e não uma troca silenciosa", async () => {
    const res = await get("?budget_min=90000&budget_max=10000");
    expect(res.status).toBe(400);
  });

  it("`limit` continua TOLERANTE — limite é transporte, filtro é promessa", async () => {
    seedIntent();
    const res = await get("?limit=abc");
    expect(res.status).toBe(200);
  });
});

describe("ordenação", () => {
  it("as quatro ordens são resolvidas no SERVIDOR", async () => {
    const caro = seedIntent({ max_price: "95000.00" }, 30);
    const medio = seedIntent({ max_price: "60000.00" }, 20);
    const barato = seedIntent({ max_price: "40000.00" }, 10);

    expect(ids(await get(""))).toEqual([barato, medio, caro]);
    expect(ids(await get("?sort=recent"))).toEqual([barato, medio, caro]);
    expect(ids(await get("?sort=oldest"))).toEqual([caro, medio, barato]);
    expect(ids(await get("?sort=budget_desc"))).toEqual([caro, medio, barato]);
    expect(ids(await get("?sort=budget_asc"))).toEqual([barato, medio, caro]);
  });

  it("a ordenação por orçamento atravessa a PAGINAÇÃO", async () => {
    // Nove tetos distintos, publicados na ordem inversa do preço: uma ordenação
    // feita no cliente sobre a primeira página devolveria os três mais caros
    // DAQUELA página, não os da cidade.
    for (let index = 0; index < 9; index += 1) {
      seedIntent({ max_price: `${10000 + index * 1000}.00` }, index);
    }

    const first = await get("?sort=budget_desc&limit=3");
    const second = await get(
      `?sort=budget_desc&limit=3&cursor=${encodeURIComponent(first.body.next_cursor)}`
    );

    const price = (res) => res.body.purchase_intents.map((item) => Number(item.max_price));
    expect(price(first)).toEqual([18000, 17000, 16000]);
    expect(price(second)).toEqual([15000, 14000, 13000]);
  });

  it("o cursor de uma ordenação não vale para outra: recomeça, nunca 500", async () => {
    for (let index = 0; index < 6; index += 1) {
      seedIntent({ max_price: `${20000 + index * 1000}.00` }, index);
    }

    const budget = await get("?sort=budget_desc&limit=2");
    // Trocar o seletor com uma página carregada é um clique real. Comparar
    // `numeric` com `timestamptz` seria erro de tipo no Postgres — 500 numa tela
    // que a pessoa só queria reordenar.
    const reordered = await get(
      `?sort=recent&limit=2&cursor=${encodeURIComponent(budget.body.next_cursor)}`
    );

    expect(reordered.status).toBe(200);
    expect(reordered.body.purchase_intents).toHaveLength(2);
    // Recomeçou do início da nova ordem.
    expect(ids(reordered)).toEqual(ids(await get("?sort=recent&limit=2")));
  });

  it("`sort` volta no payload — a tela não precisa adivinhar o que o servidor fez", async () => {
    seedIntent();
    expect((await get("?sort=budget_asc")).body.sort).toBe("budget_asc");
    expect((await get("")).body.sort).toBe("recent");
  });
});

describe("privacidade — o filtro novo não abriu porta nenhuma", () => {
  it("nenhum campo de identidade do comprador no payload, com ou sem filtro", async () => {
    seedIntent();

    for (const path of ["", "?transmission=automatico&sort=budget_desc"]) {
      const res = await get(path);
      const serialized = JSON.stringify(res.body);

      for (const forbidden of [
        "buyer_user_id",
        "buyerUserId",
        "user_id",
        "email",
        "phone",
        "whatsapp",
        "cpf",
        "document",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });

  it("`city_id` na query continua sem efeito: a cidade vem da loja", async () => {
    const atibaia = seedIntent();
    seedIntent({ city_id: BRAGANCA.id }, 1);

    const res = await get("?city_id=2&city=braganca-paulista-sp&brand=Volkswagen");

    // O parser de filtros não lê `city_id`, e o `$1` do WHERE continua saindo
    // de `resolveDealerCityId`.
    expect(ids(res)).toEqual([atibaia]);
    expect(queryCalls.every((call) => call.params?.[0] !== "2")).toBe(true);
  });
});
