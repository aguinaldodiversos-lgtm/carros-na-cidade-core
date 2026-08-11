// Contrato HTTP das procuras: guardas, IDOR, isolamento por cidade e cabeçalhos.
//
// Os dois routers REAIS são montados num app Express de verdade — este é o
// arquivo que prova ALCANCE. Os testes de service provam a regra; só montar o
// router prova que a regra está no caminho da request. A Fase 0.1 deixou
// `requireDealerAccount` implementado e testado, mas montado em zero rotas: uma
// suíte verde não era evidência de nenhuma rota protegida.

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

/**
 * Auth de mentira dirigida por cabeçalho.
 *
 * `x-test-user` é o id; `x-test-account` é o account_type. O middleware real
 * deriva `account_type` de `users.document_type` — aqui ele é injetado direto
 * porque o que está sob teste é o ROUTER, não a derivação (que tem teste
 * próprio em tests/shared/dealer-authorization-chain.test.js).
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

const buyerRoutes = (await import("../../src/modules/purchase-intents/purchase-intents.routes.js"))
  .default;
const dealerRoutes = (
  await import("../../src/modules/purchase-intents/purchase-intents.dealer.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/account/opportunities/purchase-intents", dealerRoutes);
  app.use("/api/account/purchase-intents", buyerRoutes);
  app.use(errorHandler);
  return app;
}

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const DAY = 86400000;
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const SPECIFIC_BODY = {
  intent_type: "specific_model",
  brand: "VW - VolksWagen",
  model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
  transmission: "Automático",
  max_price: 95000,
  purchase_timeframe: "within_30_days",
  city_id: ATIBAIA.id,
};

/** Uma procura já persistida, sem passar pela rota. */
function seedIntent(overrides = {}) {
  const id = db.nextIntentId;
  db.nextIntentId += 1;
  const createdAt = new Date(NOW).toISOString();
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

beforeEach(() => {
  queryCalls.length = 0;
  fakeClock.now = () => NOW;
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    users: [
      { id: "10", document_type: "cpf" },
      { id: "20", document_type: "cnpj" },
      { id: "30", document_type: "cnpj" },
    ],
    advertisers: [
      { id: 1, user_id: "20", city_id: ATIBAIA.id },
      { id: 2, user_id: "30", city_id: BRAGANCA.id },
    ],
  });
});

describe("rotas do comprador — sessão obrigatória", () => {
  it.each([
    ["get", "/api/account/purchase-intents"],
    ["post", "/api/account/purchase-intents"],
    ["get", "/api/account/purchase-intents/1"],
    ["patch", "/api/account/purchase-intents/1/close"],
  ])("%s %s sem sessão → 401 e nenhuma query", async (method, path) => {
    const res = await request(buildApp())[method](path);
    expect(res.status).toBe(401);
    expect(queryCalls).toHaveLength(0);
  });
});

describe("POST /api/account/purchase-intents", () => {
  it("publica e devolve 201 com a procura", async () => {
    const res = await request(buildApp())
      .post("/api/account/purchase-intents")
      .set("x-test-user", "10")
      .send(SPECIFIC_BODY);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.purchase_intent).toMatchObject({
      id: 1,
      brand: "Volkswagen",
      model: "T-Cross",
      transmission: "automatico",
      status: "active",
      display_status: "active",
      city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    });
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("CNPJ recebe 403 com código próprio", async () => {
    const res = await request(buildApp())
      .post("/api/account/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ")
      .send(SPECIFIC_BODY);

    expect(res.status).toBe(403);
    expect(res.body.details?.code).toBe("PURCHASE_INTENT_BUYER_ONLY");
    expect(db.purchaseIntents).toHaveLength(0);
  });

  it("ignora buyer_user_id enviado pelo navegador", async () => {
    await request(buildApp())
      .post("/api/account/purchase-intents")
      .set("x-test-user", "10")
      .send({ ...SPECIFIC_BODY, buyer_user_id: "999" });

    expect(db.purchaseIntents[0].buyer_user_id).toBe("10");
  });

  it("valida no servidor mesmo quando o formulário não valida", async () => {
    const res = await request(buildApp())
      .post("/api/account/purchase-intents")
      .set("x-test-user", "10")
      .send({ ...SPECIFIC_BODY, max_price: 95 });

    expect(res.status).toBe(400);
    expect(res.body.details?.field).toBe("max_price");
    expect(db.purchaseIntents).toHaveLength(0);
  });

  it("recusa cidade ausente — sem fallback territorial", async () => {
    const res = await request(buildApp())
      .post("/api/account/purchase-intents")
      .set("x-test-user", "10")
      .send({ ...SPECIFIC_BODY, city_id: undefined });

    expect(res.status).toBe(400);
    expect(res.body.details?.field).toBe("city_id");
  });
});

describe("GET /api/account/purchase-intents — posse", () => {
  it("a listagem sai da sessão, não da query", async () => {
    seedIntent({ buyer_user_id: "10" });
    seedIntent({ buyer_user_id: "11" });

    const res = await request(buildApp())
      .get("/api/account/purchase-intents?buyer_user_id=11&user_id=11")
      .set("x-test-user", "10");

    expect(res.status).toBe(200);
    expect(res.body.purchase_intents.map((row) => row.id)).toEqual([1]);

    // Prova estrutural: a query carrega o id da SESSÃO.
    const listCall = queryCalls.find((call) => /WHERE pi\.buyer_user_id = \$1/.test(call.sql));
    expect(listCall.params[0]).toBe("10");
  });

  it("clampa o limit no teto", async () => {
    seedIntent();
    const res = await request(buildApp())
      .get("/api/account/purchase-intents?limit=9999")
      .set("x-test-user", "10");
    expect(res.body.limit).toBe(50);
  });

  it("cursor malformado não derruba a listagem", async () => {
    seedIntent();
    const res = await request(buildApp())
      .get("/api/account/purchase-intents?cursor=lixo")
      .set("x-test-user", "10");
    expect(res.status).toBe(200);
    expect(res.body.purchase_intents).toHaveLength(1);
  });
});

describe("IDOR do comprador", () => {
  it("GET de procura alheia → 404 (nunca 403)", async () => {
    seedIntent({ buyer_user_id: "10" });

    const res = await request(buildApp())
      .get("/api/account/purchase-intents/1")
      .set("x-test-user", "11");

    expect(res.status).toBe(404);
    // O errorHandler reescreve 404 operacional para este corpo enxuto — a
    // mensagem não confirma nada sobre a existência da linha.
    expect(res.body).toEqual({ success: false, error: "not_found" });
  });

  it("PATCH close de procura alheia → 404 e NADA muda", async () => {
    seedIntent({ buyer_user_id: "10" });

    const res = await request(buildApp())
      .patch("/api/account/purchase-intents/1/close")
      .set("x-test-user", "11");

    expect(res.status).toBe(404);
    expect(db.purchaseIntents[0].status).toBe("active");
  });

  it("a posse está na cláusula WHERE do UPDATE, não num if", async () => {
    seedIntent({ buyer_user_id: "10" });
    await request(buildApp())
      .patch("/api/account/purchase-intents/1/close")
      .set("x-test-user", "10");

    const updateCall = queryCalls.find((call) => /^UPDATE purchase_intents/.test(call.sql));
    expect(updateCall.sql).toMatch(/WHERE id = \$1 AND buyer_user_id = \$2/);
    expect(updateCall.params).toEqual([1, "10"]);
  });

  it.each(["abc", "1.5", "-1", "0"])("id malformado %p → 404", async (id) => {
    const res = await request(buildApp())
      .get(`/api/account/purchase-intents/${id}`)
      .set("x-test-user", "10");
    expect(res.status).toBe(404);
  });
});

describe("rotas do lojista — guarda de conta", () => {
  it.each([
    ["get", "/api/account/opportunities/purchase-intents"],
    ["get", "/api/account/opportunities/purchase-intents/1"],
  ])("%s %s sem sessão → 401", async (method, path) => {
    const res = await request(buildApp())[method](path);
    expect(res.status).toBe(401);
  });

  it.each(["CPF", "pending"])(
    "conta %s recebe 403 do requireDealerAccount",
    async (accountType) => {
      seedIntent();
      const res = await request(buildApp())
        .get("/api/account/opportunities/purchase-intents")
        .set("x-test-user", "10")
        .set("x-test-account", accountType);

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe("DEALER_ACCOUNT_REQUIRED");
      // A guarda corta ANTES de qualquer consulta.
      expect(queryCalls).toHaveLength(0);
    }
  );

  it("CNPJ passa", async () => {
    seedIntent();
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");
    expect(res.status).toBe(200);
  });
});

describe("isolamento por cidade na API do lojista", () => {
  beforeEach(() => {
    seedIntent({ city_id: ATIBAIA.id });
  });

  it("lojista de Atibaia vê a procura de Atibaia", async () => {
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");

    expect(res.body.purchase_intents.map((row) => row.id)).toEqual([1]);
  });

  it("lojista de Bragança NÃO vê", async () => {
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "30")
      .set("x-test-account", "CNPJ");

    expect(res.body.purchase_intents).toEqual([]);
  });

  it("lojista de Bragança acessando o id direto → 404", async () => {
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents/1")
      .set("x-test-user", "30")
      .set("x-test-account", "CNPJ");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "not_found" });
    // Nada na resposta diz "existe, mas é de outra cidade".
    expect(JSON.stringify(res.body)).not.toMatch(/cidade|city|Atibaia/i);
  });

  it("a cidade da query vem do advertiser, e não é aceita do cliente", async () => {
    await request(buildApp())
      .get("/api/account/opportunities/purchase-intents?city_id=1&city=atibaia-sp")
      .set("x-test-user", "30")
      .set("x-test-account", "CNPJ");

    const listCall = queryCalls.find((call) =>
      /WHERE pi\.city_id = \$1 AND pi\.status/.test(call.sql)
    );
    // Bragança (2), apesar de a query string pedir Atibaia (1).
    expect(listCall.params[0]).toBe(BRAGANCA.id);
  });

  it("procura encerrada some para o lojista", async () => {
    db.purchaseIntents[0].status = "closed";
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");
    expect(res.body.purchase_intents).toEqual([]);
  });

  it("procura vencida some para o lojista", async () => {
    fakeClock.now = () => NOW + 31 * DAY;
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");
    expect(res.body.purchase_intents).toEqual([]);
  });
});

describe("privacidade do comprador na resposta ao lojista", () => {
  /** Todos os caminhos de chave do objeto, incluindo os aninhados. */
  function keyPaths(value, prefix = "") {
    if (value === null || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
    return Object.entries(value).flatMap(([key, nested]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const deeper = keyPaths(nested, path);
      return deeper.length ? deeper : [path];
    });
  }

  /**
   * Allowlist EXATA dos campos entregues ao lojista.
   *
   * Uma lista de proibidos (`não pode conter "email"`) só pega o que alguém
   * lembrou de proibir; esta trava o conjunto inteiro, então qualquer coluna
   * nova que vaze para a projeção quebra o teste — inclusive uma que ainda não
   * existe. `city.name` é a cidade da procura, não o nome de ninguém.
   */
  const ALLOWED_PATHS = [
    "id",
    "intent_type",
    "brand",
    "model",
    "body_type",
    "transmission",
    "max_price",
    "purchase_timeframe",
    "created_at",
    "expires_at",
    "city.name",
    "city.state",
    "city.slug",
  ].sort();

  /** Tokens que jamais podem aparecer no JSON, em qualquer posição. */
  const FORBIDDEN_TOKENS = /buyer|e-?mail|phone|whatsapp|cpf|cnpj|document|telefone/i;

  beforeEach(() => {
    seedIntent({ city_id: ATIBAIA.id });
  });

  it("a listagem entrega exatamente os campos permitidos", async () => {
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");

    expect(keyPaths(res.body.purchase_intents[0]).sort()).toEqual(ALLOWED_PATHS);
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_TOKENS);
  });

  it("o detalhe entrega exatamente os campos permitidos", async () => {
    const res = await request(buildApp())
      .get("/api/account/opportunities/purchase-intents/1")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");

    expect(keyPaths(res.body.purchase_intent).sort()).toEqual(ALLOWED_PATHS);
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_TOKENS);
  });

  it("a query do lojista nem toca na tabela users", async () => {
    // Allowlist de verdade: o dado do comprador não é filtrado depois, ele não
    // é lido. Um `SELECT *` com remoção posterior passaria nos testes acima e
    // falharia neste.
    await request(buildApp())
      .get("/api/account/opportunities/purchase-intents/1")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");

    const detailCall = queryCalls.find((call) =>
      /FROM purchase_intents pi.*WHERE pi\.id = \$1 AND pi\.city_id = \$2/.test(call.sql)
    );
    expect(detailCall.sql).not.toMatch(/JOIN users/i);
    expect(detailCall.sql).not.toMatch(/buyer_user_id/i);
    expect(detailCall.sql).not.toMatch(/SELECT \*/i);
  });
});

describe("cabeçalhos", () => {
  it("toda resposta autenticada é private, no-store", async () => {
    seedIntent();
    const app = buildApp();

    const buyerList = await request(app)
      .get("/api/account/purchase-intents")
      .set("x-test-user", "10");
    const buyerDetail = await request(app)
      .get("/api/account/purchase-intents/1")
      .set("x-test-user", "10");
    const dealerList = await request(app)
      .get("/api/account/opportunities/purchase-intents")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");
    const dealerDetail = await request(app)
      .get("/api/account/opportunities/purchase-intents/1")
      .set("x-test-user", "20")
      .set("x-test-account", "CNPJ");

    for (const res of [buyerList, buyerDetail, dealerList, dealerDetail]) {
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
  });
});
