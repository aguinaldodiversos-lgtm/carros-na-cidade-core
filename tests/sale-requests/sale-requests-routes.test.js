// Contrato HTTP das solicitações de venda: guardas, IDOR, cabeçalhos e a
// AUSÊNCIA de superfície que ainda não deve existir.
//
// O router REAL é montado num app Express de verdade — este é o arquivo que
// prova ALCANCE. Os testes de service provam a regra; só montar o router prova
// que a regra está no caminho da request. A Fase 0.1 deixou
// `requireDealerAccount` implementado e testado, mas montado em zero rotas: uma
// suíte verde não era evidência de nenhuma rota protegida.

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";
import { EVALUATION_BODY, EVALUATION_ROW } from "./evaluation-fixture.js";
import {
  ImageInputError,
  ObjectStorageError,
} from "../../src/infrastructure/storage/storage-errors.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (callback) => callback({ query: (sql, params) => fakeQuery(sql, params) }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

/**
 * O upload ao R2 é controlado pelo teste; TODO o resto de `r2.service` é o real
 * (via `importOriginal`), porque `sale-requests.validation.js` importa
 * `SALE_REQUEST_KEY_PREFIX` dali — mockar o módulo inteiro faria a validação de
 * posse comparar contra `undefined` e passar a aceitar qualquer chave.
 */
const uploadSaleRequestImage = vi.fn();

vi.mock("../../src/infrastructure/storage/r2.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    uploadSaleRequestImage: (...args) => uploadSaleRequestImage(...args),
  };
});

// FIPE nunca é chamada de verdade num teste de rota: seria I/O externo e
// tornaria o resultado dependente de rede.
vi.mock("../../src/modules/fipe/fipe.service.js", () => ({
  resolveFipeReference: vi.fn().mockResolvedValue({
    ok: false,
    value: null,
    confidence: "none",
    failure_reason: "no_codes_no_hint",
    fipe_snapshot_at: "2026-08-16T12:00:00.000Z",
  }),
  fipeValueForRiskScoring: () => null,
}));

/**
 * Auth de mentira dirigida por cabeçalho.
 *
 * `x-test-user` é o id; `x-test-account` é o `account_type`. O middleware real
 * deriva `account_type` de `users.document_type` — aqui ele é injetado direto
 * porque o que está sob teste é o ROUTER, não a derivação (que tem teste próprio
 * em tests/shared/dealer-authorization-chain.test.js).
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

const saleRequestRoutes = (
  await import("../../src/modules/sale-requests/sale-requests.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/account/sale-requests", saleRequestRoutes);
  app.use(errorHandler);
  return app;
}

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const OWNER_ID = "7";

function keysFor(count, owner = OWNER_ID, session = "sess") {
  return Array.from(
    { length: count },
    (_, index) => `sale-requests/${owner}/${session}/2026/08/uuid-${index}.webp`
  );
}

function validBody(overrides = {}) {
  return {
    city_id: ATIBAIA.id,
    brand: "VW - VolksWagen",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: "2020",
    mileage: "45000",
    transmission: "Automático",
    fuel_type: "Flex",
    declared_condition: "bom",
    ...EVALUATION_BODY,
    images: keysFor(4),
    ...overrides,
  };
}

function seedRequest(overrides = {}) {
  const id = db.nextRequestId;
  db.nextRequestId += 1;
  const createdAt = new Date(NOW - id * 1000).toISOString();

  db.saleRequests.push({
    id,
    owner_user_id: OWNER_ID,
    city_id: ATIBAIA.id,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: null,
    fipe_reference_value: null,
    fipe_reference_at: null,
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...EVALUATION_ROW,
    status: "receiving_offers",
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  });
  return id;
}

beforeEach(() => {
  resetDb({
    cities: [ATIBAIA],
    users: [{ id: OWNER_ID }, { id: "8" }, { id: "9" }, { id: "999" }],
  });
  fakeClock.now = () => NOW;
});

describe("autenticação", () => {
  it("sem sessão, todas as rotas recusam", async () => {
    const app = buildApp();

    await request(app).get("/api/account/sale-requests").expect(401);
    await request(app).post("/api/account/sale-requests").send(validBody()).expect(401);
    await request(app).get("/api/account/sale-requests/1").expect(401);
    await request(app).post("/api/account/sale-requests/1/cancel").expect(401);
    await request(app).post("/api/account/sale-requests/photos").expect(401);
  });
});

describe("tipo de conta na rota REAL", () => {
  it.each([
    ["CPF", 201],
    ["pending", 201],
  ])("conta %s publica (%i)", async (accountType, expected) => {
    const app = buildApp();
    const userId = accountType === "CPF" ? OWNER_ID : "8";

    await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", userId)
      .set("x-test-account", accountType)
      .send(validBody({ images: keysFor(4, userId) }))
      .expect(expected);
  });

  it("conta CNPJ recebe 403 com código estável", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", "9")
      .set("x-test-account", "CNPJ")
      .send(validBody({ images: keysFor(4, "9") }))
      .expect(403);

    expect(response.body?.code || response.body?.details?.code).toBe("SALE_REQUEST_OWNER_ONLY");
    expect(db.saleRequests).toHaveLength(0);
  });
});

describe("cabeçalhos", () => {
  it("toda resposta é privada e não cacheável", async () => {
    const app = buildApp();
    const id = seedRequest();

    for (const call of [
      request(app).get("/api/account/sale-requests"),
      request(app).get(`/api/account/sale-requests/${id}`),
    ]) {
      const response = await call.set("x-test-user", OWNER_ID);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
  });

  it("o 404 de solicitação alheia NÃO vira cache público", async () => {
    // O errorHandler marca 404 operacional como `public, max-age=60`; numa rota
    // autenticada isso é o tipo de coisa que um proxy no meio guarda.
    const app = buildApp();
    const id = seedRequest({ owner_user_id: "999" });

    const response = await request(app)
      .get(`/api/account/sale-requests/${id}`)
      .set("x-test-user", OWNER_ID)
      .expect(404);

    expect(response.headers["cache-control"]).not.toMatch(/public/);
  });
});

describe("IDOR", () => {
  it("não lê solicitação de outro usuário", async () => {
    const app = buildApp();
    const id = seedRequest({ owner_user_id: "999" });

    await request(app)
      .get(`/api/account/sale-requests/${id}`)
      .set("x-test-user", OWNER_ID)
      .expect(404);
  });

  it("não cancela solicitação de outro usuário", async () => {
    const app = buildApp();
    const id = seedRequest({ owner_user_id: "999" });

    await request(app)
      .post(`/api/account/sale-requests/${id}/cancel`)
      .set("x-test-user", OWNER_ID)
      .expect(404);

    expect(db.saleRequests[0].status).toBe("receiving_offers");
  });

  it("a listagem nunca inclui solicitação alheia", async () => {
    const app = buildApp();
    seedRequest();
    seedRequest({ owner_user_id: "999" });

    const response = await request(app)
      .get("/api/account/sale-requests")
      .set("x-test-user", OWNER_ID)
      .expect(200);

    expect(response.body.sale_requests).toHaveLength(1);
  });

  it("não aceita owner_user_id vindo do corpo", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", OWNER_ID)
      .send({ ...validBody(), owner_user_id: "999" })
      .expect(201);

    // Quem publicou foi a sessão, não o corpo.
    expect(db.saleRequests[0].owner_user_id).toBe(OWNER_ID);
  });
});

describe("cancelamento pela rota", () => {
  it("é POST, é soft e é idempotente", async () => {
    const app = buildApp();
    const id = seedRequest();

    const first = await request(app)
      .post(`/api/account/sale-requests/${id}/cancel`)
      .set("x-test-user", OWNER_ID)
      .expect(200);
    expect(first.body.sale_request.status).toBe("cancelled");
    expect(first.body.changed).toBe(true);

    const second = await request(app)
      .post(`/api/account/sale-requests/${id}/cancel`)
      .set("x-test-user", OWNER_ID)
      .expect(200);
    expect(second.body.changed).toBe(false);

    // Soft: a linha continua lá.
    expect(db.saleRequests).toHaveLength(1);
  });
});

describe("superfície — o que NÃO pode existir na Fase 4.1", () => {
  it("não existe rota de EDIÇÃO", async () => {
    // Publicou, não edita campo economicamente relevante: quando os lances
    // existirem, mudar km debaixo de uma oferta seria alterar o objeto do
    // negócio depois da proposta.
    const app = buildApp();
    const id = seedRequest();

    await request(app)
      .patch(`/api/account/sale-requests/${id}`)
      .set("x-test-user", OWNER_ID)
      .send({ mileage: 1 })
      .expect(404);

    await request(app)
      .put(`/api/account/sale-requests/${id}`)
      .set("x-test-user", OWNER_ID)
      .send({ mileage: 1 })
      .expect(404);
  });

  it("não existe DELETE — cancelar é mudança de estado", async () => {
    const app = buildApp();
    const id = seedRequest();

    await request(app)
      .delete(`/api/account/sale-requests/${id}`)
      .set("x-test-user", OWNER_ID)
      .expect(404);
  });

  it("não existe superfície de lojista neste router", async () => {
    const app = buildApp();

    for (const path of ["/api/account/sale-requests/opportunities", "/api/account/sale-requests/1/bids"]) {
      const response = await request(app).get(path).set("x-test-user", "9").set("x-test-account", "CNPJ");
      expect(response.status).toBe(404);
    }
  });

  it("`/photos` não é capturado como `/:id`", async () => {
    // Se `/:id` viesse primeiro, `parseSaleRequestId("photos")` devolveria 404 e
    // um upload legítimo falharia com "solicitação inexistente" — silencioso e
    // difícil de ler no log.
    const app = buildApp();

    const response = await request(app)
      .post("/api/account/sale-requests/photos")
      .set("x-test-user", OWNER_ID);

    // Sem arquivo o service recusa com 400; o que importa aqui é NÃO ser o 404
    // de "solicitação não encontrada".
    expect(response.status).toBe(400);
    expect(String(response.body?.message || "")).not.toMatch(/não encontrada/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// O CONTRATO HTTP DO UPLOAD — 400 × 503 pelo caminho REAL
// ────────────────────────────────────────────────────────────────────────────
// Os testes de service provam a tradução; estes provam que ela SOBREVIVE ao
// caminho completo (multer → controller → asyncHandler → error handler do router
// → errorHandler global). É onde um 503 poderia virar 400 ou 500 sem ninguém
// perceber — e o bug original só apareceu porque alguém rodou o fluxo de ponta a
// ponta.
describe("upload de fotos — classificação de falha na rota", () => {
  function postPhoto(app) {
    return request(app)
      .post("/api/account/sale-requests/photos")
      .set("x-test-user", OWNER_ID)
      .attach("photos", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
        filename: "foto.jpg",
        contentType: "image/jpeg",
      });
  }

  it("sucesso devolve 201 com as chaves", async () => {
    uploadSaleRequestImage.mockResolvedValue({
      key: `sale-requests/${OWNER_ID}/sess/2026/08/uuid-0.webp`,
      publicUrl: "",
    });

    const response = await postPhoto(buildApp()).expect(201);

    expect(response.body.images).toHaveLength(1);
    expect(response.body.images[0].storage_key).toContain(`sale-requests/${OWNER_ID}/`);
  });

  it("arquivo inválido → 400 INVALID_PHOTO", async () => {
    uploadSaleRequestImage.mockRejectedValue(
      new ImageInputError("[r2] Tipo de arquivo não permitido: image/heic.")
    );

    const response = await postPhoto(buildApp()).expect(400);

    expect(response.body?.details?.code).toBe("SALE_REQUEST_INVALID_PHOTO");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("storage indisponível → 503, e NÃO 400", async () => {
    // A regressão exata do smoke: bucket inexistente devolvia 400 dizendo que a
    // foto estava errada.
    const cause = new Error("The specified bucket does not exist");
    cause.name = "NoSuchBucket";
    uploadSaleRequestImage.mockRejectedValue(
      new ObjectStorageError("falha ao gravar", { cause, stage: "put" })
    );

    const response = await postPhoto(buildApp()).expect(503);

    expect(response.body?.details?.code).toBe("SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE");
    expect(response.body?.message).toBe(
      "Não foi possível enviar a foto agora. Tente novamente em instantes."
    );
  });

  it("configuração de storage ausente → 503 sem vazar o nome da variável", async () => {
    uploadSaleRequestImage.mockRejectedValue(
      new ObjectStorageError("Falha ao inicializar o cliente de storage.", {
        cause: new Error("[r2] Variável obrigatória ausente: R2_BUCKET_NAME"),
        stage: "config",
      })
    );

    const response = await postPhoto(buildApp()).expect(503);

    const body = JSON.stringify(response.body);
    for (const leak of [/R2_/, /bucket/i, /endpoint/i, /secret/i, /access.?key/i]) {
      expect(body).not.toMatch(leak);
    }
  });

  it("a resposta 503 é privada e não cacheável", async () => {
    // Um 503 cacheado por proxy manteria a tela quebrada depois de o storage
    // voltar.
    uploadSaleRequestImage.mockRejectedValue(
      new ObjectStorageError("falha", { cause: new Error("x"), stage: "put" })
    );

    const response = await postPhoto(buildApp()).expect(503);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("erro não classificado NÃO vira 400 de foto inválida", async () => {
    uploadSaleRequestImage.mockRejectedValue(new TypeError("client.send is not a function"));

    const response = await postPhoto(buildApp());

    expect(response.status).toBe(500);
    expect(response.body?.details?.code).not.toBe("SALE_REQUEST_INVALID_PHOTO");
    // O errorHandler global não expõe mensagem interna em 500.
    expect(String(response.body?.message || "")).not.toMatch(/client\.send/);
  });
});

describe("validação chega pela rota", () => {
  it("menos de 4 fotos é 400", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", OWNER_ID)
      .send(validBody({ images: keysFor(3) }))
      .expect(400);

    expect(String(response.body?.message)).toMatch(/pelo menos 4/i);
  });

  it("chave de foto de outro usuário é 400 e nada é persistido", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", OWNER_ID)
      .send(validBody({ images: keysFor(4, "999") }))
      .expect(400);

    expect(db.saleRequests).toHaveLength(0);
    expect(db.saleRequestImages).toHaveLength(0);
  });

  it("cidade inexistente é 400", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/account/sale-requests")
      .set("x-test-user", OWNER_ID)
      .send(validBody({ city_id: 4242 }))
      .expect(400);
  });
});
