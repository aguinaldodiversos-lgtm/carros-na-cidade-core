import { describe, it, expect, beforeEach } from "vitest";

describe("token.signer – getJwtConfig", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test_secret_that_is_long_enough_for_testing_purposes";
    process.env.JWT_REFRESH_SECRET = "test_refresh_secret_long_enough_for_testing_purposes";
    process.env.NODE_ENV = "test";
  });

  it("lança AppError quando JWT_SECRET está ausente", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    const { getJwtConfig } = await import("../../src/modules/auth/token/token.signer.js");
    expect(() => getJwtConfig()).toThrow();
  });

  it("retorna config completa quando segredos estão definidos", async () => {
    const { getJwtConfig } = await import("../../src/modules/auth/token/token.signer.js");
    const cfg = getJwtConfig();
    expect(cfg.jwtSecret).toBeTruthy();
    expect(cfg.jwtRefreshSecret).toBeTruthy();
    expect(typeof cfg.accessTtlMin).toBe("number");
    expect(typeof cfg.refreshTtlDays).toBe("number");
  });

  it("signAccessToken e verifyAccessToken são consistentes", async () => {
    // verifyAccessToken está em jwt.strategy.js (usa token.signer internamente)
    const { signAccessToken } = await import(
      "../../src/modules/auth/token/token.signer.js"
    );
    const { verifyAccessToken } = await import(
      "../../src/modules/auth/jwt.strategy.js"
    );
    const token = signAccessToken({ id: "user-123", email: "test@example.com" });
    expect(typeof token).toBe("string");
    const decoded = verifyAccessToken(token);
    expect(decoded.id).toBe("user-123");
  });
});
