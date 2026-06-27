import { describe, expect, it } from "vitest";

import { resolvePerMinuteMax } from "./rateLimit.middleware.js";

describe("resolvePerMinuteMax — override de rate limit por env", () => {
  it("usa o fallback quando a env é ausente/vazia/inválida", () => {
    expect(resolvePerMinuteMax(undefined, 200)).toBe(200);
    expect(resolvePerMinuteMax("", 200)).toBe(200);
    expect(resolvePerMinuteMax("abc", 200)).toBe(200);
    expect(resolvePerMinuteMax("0", 200)).toBe(200);
    expect(resolvePerMinuteMax("-5", 200)).toBe(200);
  });

  it("usa o valor da env quando é inteiro positivo", () => {
    expect(resolvePerMinuteMax("500", 200)).toBe(500);
    expect(resolvePerMinuteMax("120", 200)).toBe(120);
  });

  it("aplica o cap defensivo", () => {
    expect(resolvePerMinuteMax("999999", 200)).toBe(5000);
    expect(resolvePerMinuteMax("999999", 200, 1000)).toBe(1000);
  });

  it("default público de cidades é 200 (money pages SEO, não 30 agressivo)", () => {
    // Documenta a decisão: cap antigo 30/min derrubava SSR de cluster em noindex.
    expect(resolvePerMinuteMax(undefined, 200)).toBe(200);
  });
});
