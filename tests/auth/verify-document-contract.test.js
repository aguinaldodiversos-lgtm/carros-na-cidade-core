/**
 * Homologação pré-lançamento — GRUPO B (perfil PF/PJ) + AUTH-12, camada HTTP.
 *
 * Motivo de existir: o gate de documento é o funil por onde TODA conta nova
 * passa antes de anunciar, e não havia teste de rota nenhum sobre ele. Havia
 * validação de dígito verificador testada dos dois lados (backend
 * `documentVerification.service.js`, frontend `lib/validation/document.ts`),
 * mas nada provava o CONTRATO HTTP: qual status sai, e — no caso do documento
 * já usado — se o UPDATE é mesmo evitado. Um 409 que ainda assim grava é o
 * defeito silencioso que esta suíte fecha.
 *
 * IDs cobertos:
 *   PROF-01  conta sem documento → o middleware deriva account_type 'pending'
 *   PROF-02  CPF válido → 200 e UPDATE com document_verified
 *   PROF-03  CPF inválido → 400 explícito, sem UPDATE
 *   PROF-04  documento de outra conta → 409 e NENHUM UPDATE
 *   AUTH-12  token adulterado/ausente → 401 sem stack trace e sem tocar o banco
 *
 * Sobe o router REAL (`auth.routes.js`) atrás do `authMiddleware` REAL e do
 * `errorMiddleware` REAL. Só o `pool` é mockado — é o que permite afirmar
 * "nenhum UPDATE" com propriedade.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "vitest-auth-secret-com-mais-de-32-caracteres!!";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const queryMock = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: (...args) => queryMock(...args) },
  default: { query: (...args) => queryMock(...args) },
  closeDatabasePool: vi.fn(),
}));

// Rate limit é comportamento de infraestrutura (janela + contador). Aqui o
// alvo é o contrato do gate; deixar o limiter real tornaria o teste sensível
// à ordem de execução. Ver tests/shared/rateLimit.middleware.test.js.
vi.mock("../../src/shared/middlewares/rateLimit.middleware.js", () => ({
  loginRateLimit: (req, res, next) => next(),
  registerRateLimit: (req, res, next) => next(),
  default: () => (req, res, next) => next(),
}));

const USERS_COLUMNS = [
  "id",
  "name",
  "email",
  "role",
  "plan",
  "address",
  "phone",
  "whatsapp",
  "document_type",
  "document_number",
  "document_verified",
  "updated_at",
];

/** CPF/CNPJ com dígitos verificadores válidos (gerados, não de pessoa real). */
const CPF_VALIDO = "52998224725";
const CPF_INVALIDO = "12345678900";
const CNPJ_VALIDO = "11222333000181";

let emitted = [];
let app;

function sqlKind(text) {
  const sql = String(text).replace(/\s+/g, " ").trim();
  if (sql.includes("information_schema.columns")) return "columns";
  if (sql.startsWith("SELECT id FROM users WHERE document_number")) return "dup";
  if (sql.startsWith("UPDATE users")) return "update";
  if (sql.includes("FROM users") && sql.includes("WHERE id =")) return "session-user";
  return "other";
}

/**
 * @param sessionUser linha devolvida ao authMiddleware (null → 401 "Usuário inválido")
 * @param dupRows     linhas devolvidas na checagem de documento já usado
 */
function installPool({
  sessionUser = { id: 1, role: "user", document_type: null },
  dupRows = [],
} = {}) {
  queryMock.mockReset();
  emitted = [];
  queryMock.mockImplementation(async (text, params) => {
    const kind = sqlKind(text);
    emitted.push({ kind, params });
    if (kind === "columns") {
      return { rows: USERS_COLUMNS.map((column_name) => ({ column_name })), rowCount: 12 };
    }
    if (kind === "dup") return { rows: dupRows, rowCount: dupRows.length };
    if (kind === "session-user") {
      // O id vem do token, não do fixture: devolver sempre a mesma linha faria
      // o teste de escopo (PROF-04) passar por acidente.
      if (!sessionUser) return { rows: [], rowCount: 0 };
      return { rows: [{ ...sessionUser, id: params?.[0] ?? sessionUser.id }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

function tokenFor(id = 1) {
  return jwt.sign({ id: String(id), type: "access" }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: "carros-na-cidade",
    audience: "carros-na-cidade-users",
    expiresIn: "15m",
  });
}

/** Perfil completo — o gate exige nome, endereço e contato além do documento. */
function perfilValido(extra = {}) {
  return {
    document_type: "cpf",
    document_number: CPF_VALIDO,
    name: "Maria Teste da Silva",
    address: "Rua das Flores, 100 - Atibaia/SP",
    phone: "11999998888",
    whatsapp: "11999998888",
    ...extra,
  };
}

/** Captura o `req.user` que o authMiddleware montou, para provar PROF-01. */
let capturedUser = null;

beforeAll(async () => {
  const { default: authRoutes } = await import("../../src/modules/auth/auth.routes.js");
  const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");
  const { authMiddleware } = await import("../../src/shared/middlewares/auth.middleware.js");

  app = express();
  app.use(express.json());
  app.get("/probe/me", authMiddleware, (req, res) => {
    capturedUser = req.user;
    res.status(200).json(req.user);
  });
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  capturedUser = null;
});

describe("PROF-01 — conta nova sem CPF/CNPJ", () => {
  it("document_type NULL vira account_type 'pending' (nunca CPF por omissão)", async () => {
    installPool({ sessionUser: { id: 1, role: "user", document_type: null } });

    const res = await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(200);
    expect(capturedUser.account_type).toBe("pending");
  });

  it("document_type string vazia também é 'pending' (legado grava '' em vez de NULL)", async () => {
    installPool({ sessionUser: { id: 1, role: "user", document_type: "   " } });

    await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(capturedUser.account_type).toBe("pending");
  });

  it("conta já com CPF sai como 'CPF', e com CNPJ sai como 'CNPJ'", async () => {
    installPool({ sessionUser: { id: 1, role: "user", document_type: "cpf" } });
    await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${tokenFor(1)}`);
    expect(capturedUser.account_type).toBe("CPF");

    installPool({ sessionUser: { id: 2, role: "user", document_type: "CNPJ" } });
    await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${tokenFor(2)}`);
    expect(capturedUser.account_type).toBe("CNPJ");
  });
});

describe("PROF-02 — CPF válido no gate", () => {
  it("200 e o UPDATE marca document_verified", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const update = emitted.find((e) => e.kind === "update");
    expect(update).toBeTruthy();
    expect(update.params).toContain(CPF_VALIDO);
    expect(update.params).toContain(true);
  });

  it("CNPJ válido segue o mesmo caminho (200 + UPDATE)", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido({ document_type: "cnpj", document_number: CNPJ_VALIDO }));

    expect(res.status).toBe(200);
    expect(emitted.some((e) => e.kind === "update")).toBe(true);
  });

  it("aceita o documento com máscara — a rota descarta a pontuação", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido({ document_number: "529.982.247-25" }));

    expect(res.status).toBe(200);
    const update = emitted.find((e) => e.kind === "update");
    expect(update.params).toContain(CPF_VALIDO);
    expect(update.params).not.toContain("529.982.247-25");
  });
});

describe("PROF-03 — CPF inválido", () => {
  it("400 explícito e NENHUM UPDATE", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido({ document_number: CPF_INVALIDO }));

    expect(res.status).toBe(400);
    expect(emitted.some((e) => e.kind === "update")).toBe(false);
  });

  it("dígitos repetidos (111.111.111-11) são recusados, não aceitos por comprimento", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido({ document_number: "11111111111" }));

    expect(res.status).toBe(400);
    expect(emitted.some((e) => e.kind === "update")).toBe(false);
  });

  it("tipo fora de cpf|cnpj → 400 antes de qualquer validação de dígito", async () => {
    installPool();

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido({ document_type: "rg" }));

    expect(res.status).toBe(400);
    expect(emitted.some((e) => e.kind === "update")).toBe(false);
  });
});

describe("PROF-04 — documento já utilizado em outra conta", () => {
  it("409 e NENHUM UPDATE (o documento não migra de dono)", async () => {
    installPool({ dupRows: [{ id: 99 }] });

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(1)}`)
      .send(perfilValido());

    expect(res.status).toBe(409);
    expect(emitted.some((e) => e.kind === "update")).toBe(false);
  });

  it("a busca de duplicidade EXCLUI a própria conta (revalidar o mesmo CPF não dá 409)", async () => {
    installPool({ dupRows: [] });

    const res = await request(app)
      .post("/api/auth/verify-document")
      .set("Authorization", `Bearer ${tokenFor(7)}`)
      .send(perfilValido());

    const dup = emitted.find((e) => e.kind === "dup");
    expect(dup.params).toEqual([CPF_VALIDO, "7"]);
    expect(res.status).toBe(200);
  });
});

describe("AUTH-12 — cookie/token inválido ou adulterado", () => {
  it("assinatura adulterada → 401, sem stack trace e sem consultar o banco", async () => {
    installPool();
    const valido = tokenFor(1);
    // Vira o último caractere da assinatura: payload intacto, HMAC quebrado.
    const ultimo = valido.slice(-1);
    const adulterado = valido.slice(0, -1) + (ultimo === "A" ? "B" : "A");

    const res = await request(app).get("/probe/me").set("Authorization", `Bearer ${adulterado}`);

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+|node_modules|Error:/);
    expect(emitted.filter((e) => e.kind === "session-user")).toHaveLength(0);
  });

  it("token assinado com OUTRO segredo → 401 (não 500)", async () => {
    installPool();
    const forjado = jwt.sign({ id: "1", type: "access" }, "segredo-do-atacante", {
      algorithm: "HS256",
      issuer: "carros-na-cidade",
      audience: "carros-na-cidade-users",
      expiresIn: "15m",
    });

    const res = await request(app).get("/probe/me").set("Authorization", `Bearer ${forjado}`);

    expect(res.status).toBe(401);
  });

  it("token de refresh apresentado como access → 401 (type errado não passa)", async () => {
    installPool();
    const refreshComoAccess = jwt.sign({ id: "1", type: "refresh" }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      issuer: "carros-na-cidade",
      audience: "carros-na-cidade-users",
      expiresIn: "15m",
    });

    const res = await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${refreshComoAccess}`);

    expect(res.status).toBe(401);
  });

  it("token expirado → 401 controlado", async () => {
    installPool();
    const expirado = jwt.sign({ id: "1", type: "access" }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      issuer: "carros-na-cidade",
      audience: "carros-na-cidade-users",
      expiresIn: -60,
    });

    const res = await request(app).get("/probe/me").set("Authorization", `Bearer ${expirado}`);

    expect(res.status).toBe(401);
  });

  it("algoritmo 'none' (ataque clássico) → 401", async () => {
    installPool();
    const none = jwt.sign({ id: "1", type: "access" }, "", {
      algorithm: "none",
      issuer: "carros-na-cidade",
      audience: "carros-na-cidade-users",
    });

    const res = await request(app).get("/probe/me").set("Authorization", `Bearer ${none}`);

    expect(res.status).toBe(401);
  });

  it("AUTH-09: rota protegida sem Authorization → 401, sem banco", async () => {
    installPool();

    const res = await request(app).get("/probe/me");

    expect(res.status).toBe(401);
    expect(emitted.filter((e) => e.kind === "session-user")).toHaveLength(0);
  });

  it("token válido de usuário que não existe mais → 401 (não 200 com req.user vazio)", async () => {
    installPool({ sessionUser: null });

    const res = await request(app)
      .get("/probe/me")
      .set("Authorization", `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(401);
  });

  it("o gate de documento também é protegido — sem token é 401, não 400", async () => {
    installPool();

    const res = await request(app).post("/api/auth/verify-document").send(perfilValido());

    expect(res.status).toBe(401);
    expect(emitted.some((e) => e.kind === "update")).toBe(false);
  });
});
