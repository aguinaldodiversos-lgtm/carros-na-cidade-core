import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}));
vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (req, _res, next) => {
    req.user = { id: "owner-7" };
    next();
  },
}));
vi.mock("../../src/shared/middlewares/rateLimit.middleware.js", () => {
  const pass = (_req, _res, next) => next();
  return {
    loginRateLimit: pass,
    loginIdentityRateLimit: pass,
    registerRateLimit: pass,
    passwordRecoveryIdentityRateLimit: pass,
    passwordRecoveryRateLimit: pass,
    passwordResetRateLimit: pass,
  };
});
vi.mock("../../src/services/email.service.js", () => ({ sendResetPasswordEmail: vi.fn() }));
vi.mock("../../src/modules/auth/auth.service.js", () => ({}));
vi.mock("../../src/modules/auth/password.service.js", () => ({}));
vi.mock("../../src/modules/auth/emailVerification.service.js", () => ({}));

import { pool, withTransaction } from "../../src/infrastructure/database/db.js";
import authRouter from "../../src/modules/auth/auth.routes.js";

const previous = { document_type: "cnpj", document_number: "26263257000120" };
const txQuery = vi.fn();
const validBody = {
  document_type: "cnpj",
  document_number: "11.222.333/0001-81",
  name: "Loja Exemplo",
  address: "Rua Comercial, 123",
  phone: "11987654321",
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use((error, _req, res, _next) =>
    res.status(error.statusCode || 500).json({
      error: error.message,
    })
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.query)
    .mockResolvedValueOnce({ rows: [] }) // Duplicate document check
    .mockResolvedValueOnce({
      rows: [
        "document_type",
        "document_number",
        "document_verified",
        "name",
        "address",
        "phone",
        "whatsapp",
        "updated_at",
      ].map((column_name) => ({ column_name })),
    });
  vi.mocked(withTransaction).mockImplementation(async (callback) => callback({ query: txQuery }));
  txQuery.mockReset();
  txQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("troca do documento e averiguação física da loja", () => {
  it("revoga loja verificada na mesma transação ao mudar CNPJ", async () => {
    txQuery.mockResolvedValueOnce({ rows: [previous] });
    const response = await request(makeApp()).post("/api/auth/verify-document").send(validBody);
    expect(response.status).toBe(200);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(txQuery).toHaveBeenCalledTimes(3);
    expect(txQuery.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(txQuery.mock.calls[1][0]).toContain("UPDATE users");
    expect(txQuery.mock.calls[2][0]).toContain("verified = FALSE");
    expect(txQuery.mock.calls[2][1]).toEqual(["owner-7"]);
  });

  it("não altera verificação da loja ao confirmar o mesmo CNPJ", async () => {
    txQuery.mockResolvedValueOnce({
      rows: [{ document_type: "CNPJ", document_number: "11222333000181" }],
    });
    const response = await request(makeApp()).post("/api/auth/verify-document").send(validBody);
    expect(response.status).toBe(200);
    expect(txQuery).toHaveBeenCalledTimes(2);
    expect(txQuery.mock.calls.some(([sql]) => String(sql).includes("verified = FALSE"))).toBe(
      false
    );
  });
});
