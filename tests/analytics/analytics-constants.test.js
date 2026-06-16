import { describe, it, expect } from "vitest";

import {
  deriveDeviceType,
  hashUserAgent,
  isPayloadTooLarge,
  isValidEventType,
  normalizeEventInput,
  MAX_EVENT_BYTES,
} from "../../src/modules/analytics/analytics.constants.js";

describe("analytics.constants · event types", () => {
  it("aceita os tipos da whitelist e rejeita inválidos", () => {
    expect(isValidEventType("page_view")).toBe(true);
    expect(isValidEventType("whatsapp_click")).toBe(true);
    expect(isValidEventType("hack_event")).toBe(false);
    expect(isValidEventType(undefined)).toBe(false);
  });
});

describe("analytics.constants · device + hash anônimo", () => {
  it("deriva device_type do User-Agent", () => {
    expect(deriveDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile")).toBe("mobile");
    expect(deriveDeviceType("Mozilla/5.0 (iPad; CPU OS 17)")).toBe("tablet");
    expect(deriveDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(deriveDeviceType("")).toBe("unknown");
  });

  it("hashUserAgent é estável, não reversível e nulo sem UA", () => {
    const h1 = hashUserAgent("Mozilla/5.0 X");
    const h2 = hashUserAgent("Mozilla/5.0 X");
    expect(h1).toBe(h2);
    expect(h1).not.toContain("Mozilla");
    expect(hashUserAgent("")).toBe(null);
    expect(hashUserAgent(null)).toBe(null);
  });
});

describe("analytics.constants · normalizeEventInput", () => {
  it("normaliza um payload válido e coerge ids", () => {
    const r = normalizeEventInput({
      event_type: "ad_view",
      path: "/veiculo/fiat-uno",
      ad_id: "42",
      blog_post_id: "abc", // inválido → null
      city_slug: "sao-paulo-sp",
      session_id: "s-123",
      extra_field: "ignorado",
    });
    expect(r.ok).toBe(true);
    expect(r.value.event_type).toBe("ad_view");
    expect(r.value.ad_id).toBe(42);
    expect(r.value.blog_post_id).toBe(null);
    expect(r.value.city_slug).toBe("sao-paulo-sp");
    expect(r.value).not.toHaveProperty("extra_field");
  });

  it("rejeita event_type inválido", () => {
    const r = normalizeEventInput({ event_type: "nope" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/event_type/);
  });

  it("rejeita corpo não-objeto", () => {
    expect(normalizeEventInput(null).ok).toBe(false);
    expect(normalizeEventInput("x").ok).toBe(false);
    expect(normalizeEventInput([]).ok).toBe(false);
  });

  it("trunca campos string acima do limite", () => {
    const longPath = "/" + "a".repeat(2000);
    const r = normalizeEventInput({ event_type: "page_view", path: longPath });
    expect(r.ok).toBe(true);
    expect(r.value.path.length).toBeLessThanOrEqual(512);
  });
});

describe("analytics.constants · isPayloadTooLarge", () => {
  it("rejeita payload gigante", () => {
    const big = { event_type: "page_view", path: "x".repeat(MAX_EVENT_BYTES + 100) };
    expect(isPayloadTooLarge(big)).toBe(true);
  });
  it("aceita payload normal", () => {
    expect(isPayloadTooLarge({ event_type: "page_view", path: "/comprar" })).toBe(false);
  });
});
