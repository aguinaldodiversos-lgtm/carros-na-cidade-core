import { afterEach, describe, it, expect, vi } from "vitest";
import {
  clientRateLimitKey,
  sensitiveAuthRateLimitKey,
  sensitiveAuthIdentityKey,
} from "../../src/shared/middlewares/rateLimit.middleware.js";

function mockReq(overrides = {}) {
  return {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

describe("clientRateLimitKey", () => {
  it("uses X-Cnc-Client-Ip when present (BFF forwarding)", () => {
    const req = mockReq({ headers: { "x-cnc-client-ip": "203.0.113.42" } });
    expect(clientRateLimitKey(req)).toBe("203.0.113.42");
  });

  it("falls back to X-Forwarded-For when no BFF header", () => {
    const req = mockReq({
      headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" },
    });
    expect(clientRateLimitKey(req)).toBe("198.51.100.1");
  });

  it("falls back to req.ip when no forwarding headers", () => {
    const req = mockReq({ headers: {}, ip: "192.168.1.100" });
    expect(clientRateLimitKey(req)).toBe("192.168.1.100");
  });

  it("falls back to socket remoteAddress as last resort", () => {
    const req = mockReq({ headers: {}, ip: undefined, socket: { remoteAddress: "10.0.0.5" } });
    expect(clientRateLimitKey(req)).toBe("10.0.0.5");
  });

  it("returns 'unknown' when nothing is available", () => {
    const req = mockReq({ headers: {}, ip: undefined, socket: {} });
    expect(clientRateLimitKey(req)).toBe("unknown");
  });

  it("trims whitespace from X-Cnc-Client-Ip", () => {
    const req = mockReq({ headers: { "x-cnc-client-ip": "  203.0.113.42  " } });
    expect(clientRateLimitKey(req)).toBe("203.0.113.42");
  });

  it("ignores empty X-Cnc-Client-Ip and falls through", () => {
    const req = mockReq({
      headers: { "x-cnc-client-ip": "   ", "x-forwarded-for": "198.51.100.1" },
    });
    expect(clientRateLimitKey(req)).toBe("198.51.100.1");
  });

  // ─── CF-Connecting-IP (Cloudflare na frente) ──────────────────────────────
  it("prefere CF-Connecting-IP sobre todos os outros (Cloudflare → origin)", () => {
    const req = mockReq({
      headers: {
        "cf-connecting-ip": "203.0.113.99",
        "x-cnc-client-ip": "203.0.113.42",
        "x-forwarded-for": "198.51.100.1",
      },
      ip: "10.0.0.1",
    });
    expect(clientRateLimitKey(req)).toBe("203.0.113.99");
  });

  it("CF-Connecting-IP funciona sem outros headers", () => {
    const req = mockReq({ headers: { "cf-connecting-ip": "203.0.113.99" } });
    expect(clientRateLimitKey(req)).toBe("203.0.113.99");
  });

  it("CF-Connecting-IP vazio cai para X-Cnc-Client-Ip", () => {
    const req = mockReq({
      headers: { "cf-connecting-ip": "   ", "x-cnc-client-ip": "203.0.113.42" },
    });
    expect(clientRateLimitKey(req)).toBe("203.0.113.42");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sensitiveAuthRateLimitKey — não aceita headers falsificados", () => {
  it("ignora CF e BFF headers em requests públicas", () => {
    const req = mockReq({
      headers: {
        "cf-connecting-ip": "198.51.100.22",
        "x-cnc-client-ip": "203.0.113.44",
        "x-forwarded-for": "198.51.100.55",
      },
      ip: "192.0.2.10",
    });
    expect(sensitiveAuthRateLimitKey(req)).toBe("192.0.2.10");
  });

  it("usa IP encaminhado apenas com credencial interna válida", () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "unit-test-secret");
    const req = mockReq({
      headers: {
        "user-agent": "cnc-internal/1.0",
        "x-internal-token": "unit-test-secret",
        "x-cnc-client-ip": "203.0.113.44",
      },
      ip: "192.0.2.10",
    });
    expect(sensitiveAuthRateLimitKey(req)).toBe("203.0.113.44");
  });

  it("não confia no header sem token válido e recusa IP inválido", () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "unit-test-secret");
    const req = mockReq({
      headers: {
        "user-agent": "cnc-internal/1.0",
        "x-internal-token": "outro-token",
        "x-cnc-client-ip": "203.0.113.44",
      },
      ip: "192.0.2.10",
    });
    expect(sensitiveAuthRateLimitKey(req)).toBe("192.0.2.10");

    req.headers["x-internal-token"] = "unit-test-secret";
    req.headers["x-cnc-client-ip"] = "not-an-ip";
    expect(sensitiveAuthRateLimitKey(req)).toBe("192.0.2.10");
  });
});

describe("limite por identidade mesmo com IP variável", () => {
  it("gera a mesma chave para o mesmo e-mail com capitalização diferente", () => {
    const a = mockReq({ headers: { "x-forwarded-for": "198.51.100.1" }, body: { email: " QA@EXAMPLE.COM " } });
    const b = mockReq({ headers: { "x-forwarded-for": "198.51.100.2" }, body: { email: "qa@example.com" } });
    expect(sensitiveAuthIdentityKey(a)).toBe(sensitiveAuthIdentityKey(b));
    expect(sensitiveAuthIdentityKey(a)).not.toContain("@");
    expect(sensitiveAuthIdentityKey(a)).toHaveLength(64);
  });

  it("não agrupa e-mails distintos na mesma identidade", () => {
    const a = mockReq({ body: { email: "first@example.com" } });
    const b = mockReq({ body: { email: "second@example.com" } });
    expect(sensitiveAuthIdentityKey(a)).not.toBe(sensitiveAuthIdentityKey(b));
  });
});
