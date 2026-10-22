import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => {
  const query = vi.fn();
  return {
    query,
    default: { query },
    pool: { query },
  };
});
vi.mock("../../src/modules/auth/sessions/refreshToken.repository.js", () => ({
  revokeAllUserRefreshTokens: vi.fn(),
}));

const db = await import("../../src/infrastructure/database/db.js");
const tokens = await import("../../src/modules/auth/sessions/refreshToken.repository.js");
const { resetPasswordWithToken } = await import("../../src/modules/auth/password.service.js");

beforeEach(() => {
  db.query.mockReset();
  tokens.revokeAllUserRefreshTokens.mockReset();
});

describe("recuperação segura da conta", () => {
  it("grava password_hash quando as duas colunas existem e revoga refresh tokens", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ column_name: "password" }, { column_name: "password_hash" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });

    await expect(
      resetPasswordWithToken({ token: "token-teste", newPassword: "NovaSenhaSegura2026!" })
    ).resolves.toEqual({ ok: true });

    const [sql] = db.query.mock.calls[1];
    expect(sql).toMatch(/SET password_hash = \$1/);
    expect(sql).not.toMatch(/SET password = \$1/);
    expect(tokens.revokeAllUserRefreshTokens).toHaveBeenCalledWith(7);
  });

  it("rejeita token expirado e não revoga sessões sem sucesso", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ column_name: "password_hash" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      resetPasswordWithToken({ token: "token-invalido", newPassword: "NovaSenhaSegura2026!" })
    ).rejects.toThrow(/Token inválido ou expirado/);
    expect(tokens.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
  });
});
