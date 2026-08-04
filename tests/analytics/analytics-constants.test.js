import { describe, it, expect } from "vitest";

import {
  deriveDeviceType,
  derivePlatform,
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

/**
 * `platform` foi adicionado em 2026-08-01 (migration 048) porque
 * `deriveDeviceType` colapsa iPhone e Android em "mobile" — e a decisão sobre
 * decodificar HEIC no servidor (dependência WASM, ~1-3s e centenas de MB por
 * foto) depende exatamente dessa divisão. O `accept` explícito do seletor já
 * resolve o iOS de graça; sem saber o peso do Android, não há critério.
 *
 * Balde GROSSO de propósito: sem versão de SO, sem modelo. Mesma granularidade
 * de device_type, mesmo compromisso de privacidade (UA bruto nunca é gravado).
 */
describe("derivePlatform", () => {
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD =
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1";
  const DESKTOP =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

  it("Samsung Android → android", () => {
    expect(derivePlatform(ANDROID_CHROME)).toBe("android");
  });

  it("iPhone → ios", () => {
    expect(derivePlatform(IPHONE_SAFARI)).toBe("ios");
  });

  it("iPad → ios", () => {
    expect(derivePlatform(IPAD)).toBe("ios");
  });

  it("desktop → other", () => {
    expect(derivePlatform(DESKTOP)).toBe("other");
  });

  /**
   * O caso que quebraria uma checagem ingênua: navegadores Android citam
   * "like Mac OS X" na string de compatibilidade do WebKit. Testar iOS antes
   * de Android classificaria Samsung como iPhone — e a decisão sobre a Etapa 2
   * sairia invertida.
   */
  it("Android com 'like Mac OS X' NÃO é classificado como ios", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Mac OS X) Chrome/120 Mobile";
    expect(derivePlatform(ua)).toBe("android");
  });

  it.each([null, undefined, "", "   "])("UA ausente (%s) → null, não 'other'", (ua) => {
    expect(derivePlatform(ua)).toBeNull();
  });

  it("granularidade grossa: nunca devolve versão nem modelo", () => {
    for (const ua of [ANDROID_CHROME, IPHONE_SAFARI, IPAD, DESKTOP]) {
      expect(["ios", "android", "other"]).toContain(derivePlatform(ua));
    }
  });
});
