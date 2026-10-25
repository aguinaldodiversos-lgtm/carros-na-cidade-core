import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
}));
vi.mock("../../src/services/email.service.js", () => ({
  sendEmailVerificationEmail: vi.fn(),
}));

import { pool } from "../../src/infrastructure/database/db.js";
import { sendEmailVerificationEmail } from "../../src/services/email.service.js";
import {
  sendVerificationEmailForUser,
  verifyEmail,
} from "../../src/modules/auth/emailVerification.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmação efetiva de e-mail", () => {
  it("gera token aleatório com hash no banco, envia apenas ao endereço cadastrado", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: "u-11", email: "loja@exemplo.com", email_verified_at: null }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "u-11" }], rowCount: 1 });
    vi.mocked(sendEmailVerificationEmail).mockResolvedValueOnce(true);
    const sent = await sendVerificationEmailForUser("u-11");
    expect(sent).toMatchObject({ ok: true, sent: true });
    expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    const [email, token] = vi.mocked(sendEmailVerificationEmail).mock.calls[0];
    expect(email).toBe("loja@exemplo.com");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const [sql, params] = vi.mocked(pool.query).mock.calls[1];
    expect(sql).toContain("email_verification_last_sent_at");
    expect(sql).toContain("email_verified_at IS NULL");
    expect(params[0]).toBe("u-11");
    expect(params[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(params[1]).not.toBe(token);
  });

  it("o mesmo token só confirma uma vez, sem devolver segredo ou identidade", async () => {
    const token = "f".repeat(64);
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: "u-11" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await verifyEmail(token);
    expect(result).toEqual({ ok: true, message: "E-mail confirmado com sucesso." });
    expect(JSON.stringify(result)).not.toContain(token);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain("email_verified_at = NOW()");
    expect(sql).toContain("email_verification_expires > NOW()");
    expect(sql).toContain("email_verification_token = NULL");
    expect(params[0]).not.toBe(token);
    await expect(verifyEmail(token)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("nega token malformado sem acessar banco", async () => {
    await expect(verifyEmail("x")).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("impede reenvio dentro de dois minutos", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: "u-11",
          email: "loja@exemplo.com",
          email_verified_at: null,
          email_verification_last_sent_at: new Date(),
        },
      ],
    });
    await expect(sendVerificationEmailForUser("u-11")).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
  });

  it("não reenvia para conta confirmada", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: "u-11",
          email: "loja@exemplo.com",
          email_verified_at: new Date(),
        },
      ],
    });
    await expect(sendVerificationEmailForUser("u-11")).resolves.toEqual({
      ok: true,
      already_verified: true,
    });
    expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
  });
});
