/**
 * API de notificações — autenticação, posse e IDOR.
 *
 * Monta o router REAL num Express real e fala HTTP de verdade. O único
 * substituído é o `pool`, por um Postgres de mentira que aplica o escopo por
 * destinatário exatamente como as queries fazem (`WHERE recipient_user_id =
 * $x`). Assim, se alguém remover o escopo de uma query, o teste vê o
 * vazamento — um mock que devolvesse linhas fixas não veria.
 *
 * O que estes testes travam:
 *   • sem sessão → 401, e nenhuma query é emitida;
 *   • usuário A jamais lê, conta ou marca notificação de B;
 *   • id alheio responde 404 (não 403) — 403 confirmaria a existência;
 *   • `read-all` do A não toca uma linha do B;
 *   • respostas privadas não são cacheáveis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/** "Banco". Duas pessoas, para que o vazamento tenha para onde vazar. */
let rows = [];

const fakeQuery = vi.fn(async (sql, params = []) => {
  const text = String(sql).replace(/\s+/g, " ").trim();

  if (/SELECT COUNT\(\*\)::int AS count FROM user_notifications/i.test(text)) {
    const count = rows.filter(
      (r) => String(r.recipient_user_id) === String(params[0]) && r.read_at == null
    ).length;
    return { rows: [{ count }], rowCount: 1 };
  }

  if (/^UPDATE user_notifications SET read_at = COALESCE/i.test(text)) {
    const row = rows.find(
      (r) => r.id === Number(params[0]) && String(r.recipient_user_id) === String(params[1])
    );
    if (!row) return { rows: [], rowCount: 0 };
    row.read_at = row.read_at ?? "2026-08-10T13:00:00.000Z";
    return { rows: [row], rowCount: 1 };
  }

  if (/^UPDATE user_notifications SET read_at = NOW\(\)/i.test(text)) {
    const target = rows.filter(
      (r) => String(r.recipient_user_id) === String(params[0]) && r.read_at == null
    );
    for (const r of target) r.read_at = "2026-08-10T13:00:00.000Z";
    return { rows: [], rowCount: target.length };
  }

  if (/^SELECT .* FROM user_notifications WHERE recipient_user_id = \$1/i.test(text)) {
    const limit = Number(params[params.length - 1]);
    const mine = rows
      .filter((r) => String(r.recipient_user_id) === String(params[0]))
      .sort((a, b) => b.id - a.id);
    return { rows: mine.slice(0, limit), rowCount: mine.length };
  }

  return { rows: [], rowCount: 0 };
});

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: vi.fn(),
}));

/** authMiddleware controlável por header — testamos a rota, não o JWT. */
vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  const handler = (req, res, next) => {
    const asUser = req.headers["x-test-user"];
    if (!asUser) return res.status(401).json({ error: "unauth" });
    req.user = { id: String(asUser), role: "user", plan: "free", account_type: "CPF" };
    return next();
  };
  return { authMiddleware: handler, default: handler };
});

const notificationsRoutes = (
  await import("../../src/modules/notifications/notifications.routes.js")
).default;
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/account/notifications", notificationsRoutes);
  app.use(errorHandler);
  return app;
}

const USER_A = "10";
const USER_B = "20";

function seed() {
  rows = [
    {
      id: 1,
      recipient_user_id: USER_A,
      title: "A-1",
      body: "x",
      read_at: null,
      created_at: "2026-08-10T12:00:01.000Z",
    },
    {
      id: 2,
      recipient_user_id: USER_A,
      title: "A-2",
      body: "x",
      read_at: null,
      created_at: "2026-08-10T12:00:02.000Z",
    },
    {
      id: 3,
      recipient_user_id: USER_A,
      title: "A-3",
      body: "x",
      read_at: "2026-08-09T10:00:00.000Z",
      created_at: "2026-08-10T12:00:03.000Z",
    },
    {
      id: 4,
      recipient_user_id: USER_B,
      title: "B-1",
      body: "x",
      read_at: null,
      created_at: "2026-08-10T12:00:04.000Z",
    },
    {
      id: 5,
      recipient_user_id: USER_B,
      title: "B-2",
      body: "x",
      read_at: null,
      created_at: "2026-08-10T12:00:05.000Z",
    },
  ];
}

beforeEach(() => {
  seed();
  fakeQuery.mockClear();
});

describe("autenticação — nada é servido sem sessão", () => {
  const endpoints = [
    ["get", "/api/account/notifications"],
    ["get", "/api/account/notifications/unread-count"],
    ["patch", "/api/account/notifications/1/read"],
    ["patch", "/api/account/notifications/read-all"],
  ];

  for (const [method, path] of endpoints) {
    it(`${method.toUpperCase()} ${path} → 401 sem sessão`, async () => {
      const res = await request(buildApp())[method](path);

      expect(res.status).toBe(401);
      // E não chegou a consultar o banco.
      expect(fakeQuery).not.toHaveBeenCalled();
    });
  }
});

describe("listagem — escopada ao dono", () => {
  it("A vê só as próprias notificações", async () => {
    const res = await request(buildApp())
      .get("/api/account/notifications")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(3);
    expect(res.body.notifications.every((n) => String(n.recipient_user_id) === USER_A)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/B-1|B-2/);
  });

  it("B vê só as próprias", async () => {
    const res = await request(buildApp())
      .get("/api/account/notifications")
      .set("x-test-user", USER_B);

    expect(res.body.notifications).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/A-1|A-2|A-3/);
  });

  it("o id do destinatário vem da SESSÃO, não da query", async () => {
    // Tentativa clássica: pedir as do outro por parâmetro.
    const res = await request(buildApp())
      .get(`/api/account/notifications?recipient_user_id=${USER_B}&user_id=${USER_B}`)
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.notifications.every((n) => String(n.recipient_user_id) === USER_A)).toBe(true);
  });

  it("limit é clampado ao máximo do servidor", async () => {
    const res = await request(buildApp())
      .get("/api/account/notifications?limit=100000")
      .set("x-test-user", USER_A);

    expect(res.body.limit).toBe(50);
  });

  it("cursor malformado não quebra a listagem", async () => {
    const res = await request(buildApp())
      .get("/api/account/notifications?cursor=lixo-nao-decodificavel")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(3);
  });
});

describe("unread-count", () => {
  it("conta só as não lidas do próprio usuário", async () => {
    // A tem 3 notificações, 1 lida → 2 não lidas.
    const res = await request(buildApp())
      .get("/api/account/notifications/unread-count")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("cada usuário tem o próprio contador", async () => {
    const res = await request(buildApp())
      .get("/api/account/notifications/unread-count")
      .set("x-test-user", USER_B);

    expect(res.body.count).toBe(2);
  });

  it("a rota não é lida como um :id", async () => {
    // "unread-count" declarado antes da rota com parâmetro.
    const res = await request(buildApp())
      .get("/api/account/notifications/unread-count")
      .set("x-test-user", USER_A);

    expect(res.body).toHaveProperty("count");
    expect(res.body).not.toHaveProperty("notification");
  });
});

describe("marcar UMA como lida", () => {
  it("dono marca a própria: read_at deixa de ser null", async () => {
    const res = await request(buildApp())
      .patch("/api/account/notifications/1/read")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.notification.read_at).not.toBe(null);
    expect(rows.find((r) => r.id === 1).read_at).not.toBe(null);
  });

  it("repetir a operação NÃO falha e preserva o read_at original", async () => {
    const app = buildApp();
    const first = await request(app)
      .patch("/api/account/notifications/1/read")
      .set("x-test-user", USER_A);
    const second = await request(app)
      .patch("/api/account/notifications/1/read")
      .set("x-test-user", USER_A);

    expect(second.status).toBe(200);
    expect(second.body.notification.read_at).toBe(first.body.notification.read_at);
  });

  it("IDOR: A tentando marcar notificação de B → 404 (não 403)", async () => {
    const res = await request(buildApp())
      .patch("/api/account/notifications/4/read")
      .set("x-test-user", USER_A);

    // 403 confirmaria que a notificação 4 existe.
    expect(res.status).toBe(404);
    // E o read_at de B continua intacto.
    expect(rows.find((r) => r.id === 4).read_at).toBe(null);
  });

  it("id inexistente também é 404 — indistinguível do id alheio", async () => {
    const res = await request(buildApp())
      .patch("/api/account/notifications/999999/read")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(404);
  });

  it("id malformado é 404 (não vaza o formato da chave)", async () => {
    for (const bad of ["abc", "1.5", "-1", "0"]) {
      const res = await request(buildApp())
        .patch(`/api/account/notifications/${bad}/read`)
        .set("x-test-user", USER_A);
      expect(res.status, `id ${bad}`).toBe(404);
    }
  });
});

describe("marcar TODAS como lidas", () => {
  it("A zera as próprias e NÃO toca as de B", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/api/account/notifications/read-all")
      .set("x-test-user", USER_A);

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const countA = await request(app)
      .get("/api/account/notifications/unread-count")
      .set("x-test-user", USER_A);
    const countB = await request(app)
      .get("/api/account/notifications/unread-count")
      .set("x-test-user", USER_B);

    expect(countA.body.count).toBe(0);
    expect(countB.body.count, "read-all do A não pode afetar B").toBe(2);
  });

  it("sem não lidas devolve updated: 0 sem erro", async () => {
    const app = buildApp();
    await request(app).patch("/api/account/notifications/read-all").set("x-test-user", USER_A);

    const again = await request(app)
      .patch("/api/account/notifications/read-all")
      .set("x-test-user", USER_A);

    expect(again.status).toBe(200);
    expect(again.body.updated).toBe(0);
  });
});

describe("cache — respostas privadas não podem ser guardadas", () => {
  const endpoints = [
    ["get", "/api/account/notifications"],
    ["get", "/api/account/notifications/unread-count"],
    ["patch", "/api/account/notifications/1/read"],
    ["patch", "/api/account/notifications/read-all"],
  ];

  for (const [method, path] of endpoints) {
    it(`${method.toUpperCase()} ${path} responde private, no-store`, async () => {
      const res = await request(buildApp())[method](path).set("x-test-user", USER_A);

      expect(res.headers["cache-control"]).toBe("private, no-store");
    });
  }
});

describe("criação — não existe superfície pública", () => {
  it("POST na coleção não é uma rota (notificação nasce de código interno)", async () => {
    const res = await request(buildApp())
      .post("/api/account/notifications")
      .set("x-test-user", USER_A)
      .send({
        recipient_user_id: USER_B,
        event_type: "x.y",
        title: "forjada",
        body: "forjada",
        idempotency_key: "k",
      });

    expect([404, 405]).toContain(res.status);
    expect(rows).toHaveLength(5);
  });
});
