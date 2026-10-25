import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  withUserTransaction: vi.fn(),
}));
vi.mock("../../src/modules/account/account.service.js", () => ({
  getDashboardPayload: vi.fn(),
  getOwnedAd: vi.fn(),
  listPlans: vi.fn(),
  resolvePublishEligibility: vi.fn(),
  listBoostOptionsAsync: vi.fn(),
  listOwnedHistoryAds: vi.fn(),
  updateOwnedAdStatus: vi.fn(),
  deleteOwnedAd: vi.fn(),
}));
vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (req, _res, next) => {
    req.user = { id: "pf-7", account_type: "CPF" };
    next();
  },
}));

import { pool } from "../../src/infrastructure/database/db.js";
import accountRouter from "../../src/modules/account/account.routes.js";

const profileRow = {
  name: "Maria Teste",
  email: "maria@example.test",
  document_type: "cpf",
  document_number: "12345678909",
  document_verified: true,
  phone: "11999998888",
  whatsapp: "11999998888",
  address: "Rua de Testes",
  city: "Atibaia",
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/account", accountRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query).mockResolvedValue({ rows: [profileRow], rowCount: 1 });
});

describe("perfil privado de pessoa física", () => {
  it("retorna dados reais da conta, nunca de um user_id enviado na URL", async () => {
    const response = await request(buildApp()).get("/api/account/personal?user_id=outro");
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      name: "Maria Teste",
      email: "maria@example.test",
      document: { type: "CPF", verified: true },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(["pf-7"]);
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("atualiza somente contatos sob o id da sessão", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 });
    const response = await request(buildApp()).put("/api/account/personal").send({
      phone: "(11) 99999-8888",
      whatsapp: "11999998888",
      address: "Rua de Testes",
    });
    expect(response.status).toBe(200);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain("UPDATE users");
    expect(sql).not.toMatch(/SET name|SET email|SET document_number/);
    expect(sql).toContain("LOWER(TRIM(document_type)) <> 'cnpj'");
    expect(params).toEqual(["11999998888", "11999998888", "Rua de Testes", "pf-7"]);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("rejeita tentativa de alterar CPF, e-mail ou nome", async () => {
    const response = await request(buildApp()).put("/api/account/personal").send({
      phone: "11999998888",
      whatsapp: "11999998888",
      address: "Rua de Testes",
      email: "outra@example.test",
    });
    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejeita telefone inválido antes de gravar", async () => {
    const response = await request(buildApp()).put("/api/account/personal").send({
      phone: "123",
      whatsapp: "",
      address: "",
    });
    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("não revela perfil de conta CNPJ e não permite editar seus contatos via PF", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...profileRow, document_type: "cnpj" }],
      rowCount: 1,
    });
    const read = await request(buildApp()).get("/api/account/personal");
    expect(read.status).toBe(403);

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const edit = await request(buildApp()).put("/api/account/personal").send({
      phone: "11999998888",
      whatsapp: "",
      address: "",
    });
    expect(edit.status).toBe(403);
  });
});
