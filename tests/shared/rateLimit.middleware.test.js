import { describe, it, expect } from "vitest";
import { clientRateLimitKey } from "../../src/shared/middlewares/rateLimit.middleware.js";

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
