import { describe, expect, it } from "vitest";

import {
  detectMalformedCity,
  suggestCanonicalSlug,
} from "../../scripts/audit/lib/detect-malformed-city.mjs";

describe("detectMalformedCity — cidades válidas não são flagadas", () => {
  it("Atibaia/SP completa → não malformed", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-sp",
      state: "SP",
    });
    expect(result.isMalformed).toBe(false);
    expect(result.severity).toBe("ok");
  });

  it("São Paulo/SP com acento → não malformed", () => {
    const result = detectMalformedCity({
      name: "São Paulo",
      slug: "sao-paulo-sp",
      state: "SP",
    });
    expect(result.isMalformed).toBe(false);
  });
});

describe("detectMalformedCity — CRITICAL (slug/state ausente)", () => {
  it("slug ausente → critical", () => {
    const result = detectMalformedCity({ name: "Atibaia", state: "SP" });
    expect(result.severity).toBe("critical");
    expect(result.issues.some((i) => i.code === "slug_missing")).toBe(true);
  });

  it("state ausente → critical", () => {
    const result = detectMalformedCity({ name: "Atibaia", slug: "atibaia-sp" });
    expect(result.severity).toBe("critical");
  });

  it("state com 3 letras → critical", () => {
    const result = detectMalformedCity({ name: "Atibaia", slug: "atibaia-sp", state: "SPP" });
    expect(result.severity).toBe("critical");
  });

  it("state fora do Brasil → critical", () => {
    const result = detectMalformedCity({ name: "Foo", slug: "foo-zz", state: "ZZ" });
    expect(result.severity).toBe("critical");
  });
});

describe("detectMalformedCity — HIGH (mojibake, slug sufixo errado)", () => {
  it("nome com mojibake 'SÆo' → high", () => {
    const result = detectMalformedCity({
      name: "SÆo Paulo",
      slug: "sao-paulo-sp",
      state: "SP",
    });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "name_mojibake")).toBe(true);
  });

  it("nome com mojibake 'Ã£' → high", () => {
    const result = detectMalformedCity({
      name: "SÃ£o Paulo",
      slug: "sao-paulo-sp",
      state: "SP",
    });
    expect(result.severity).toBe("high");
  });

  it("sufixo do slug não bate com state → high", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-rj", // mas state é SP
      state: "SP",
    });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "slug_state_mismatch")).toBe(true);
  });

  it("slug sem sufixo de UF → high", () => {
    const result = detectMalformedCity({ name: "Atibaia", slug: "atibaia", state: "SP" });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "slug_no_uf_suffix")).toBe(true);
  });

  it("slug com caracteres inválidos (uppercase) → high", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "Atibaia-SP",
      state: "SP",
    });
    expect(result.severity).toBe("high");
  });
});

describe("detectMalformedCity — MEDIUM (inconsistência ads vs cities)", () => {
  it("ads.state diverge de cities.state → medium", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-sp",
      state: "SP",
      ad_state: "MG",
      ad_city: "Atibaia",
    });
    expect(result.severity).toBe("medium");
    expect(result.issues.some((i) => i.code === "ad_state_mismatch")).toBe(true);
  });

  it("ads.city diverge de cities.name → medium", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-sp",
      state: "SP",
      ad_city: "Bragança",
    });
    expect(result.severity).toBe("medium");
  });
});

describe("detectMalformedCity — sugestão de slug canônico", () => {
  it("sugere 'atibaia-sp' para Atibaia/SP", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-rj", // errado
      state: "SP",
    });
    expect(result.suggestedSlug).toBe("atibaia-sp");
  });

  it("normaliza acento na sugestão: São Paulo → sao-paulo-sp", () => {
    expect(suggestCanonicalSlug("São Paulo", "SP")).toBe("sao-paulo-sp");
  });

  it("normaliza espaço/cedilla: Bragança Paulista → braganca-paulista-sp", () => {
    expect(suggestCanonicalSlug("Bragança Paulista", "SP")).toBe("braganca-paulista-sp");
  });

  it("UF inválida → sugestão null", () => {
    expect(suggestCanonicalSlug("Atibaia", "ZZ")).toBeNull();
  });
});

describe("detectMalformedCity — robustez", () => {
  it("row null não joga", () => {
    expect(() => detectMalformedCity(null)).not.toThrow();
  });

  it("state em lowercase é aceito (normaliza)", () => {
    const result = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-sp",
      state: "sp",
    });
    expect(result.isMalformed).toBe(false);
  });

  it("autoFixable=true só para severities baixas", () => {
    const high = detectMalformedCity({ name: "Atibaia", slug: "atibaia-rj", state: "SP" });
    expect(high.autoFixable).toBe(false);
    const medium = detectMalformedCity({
      name: "Atibaia",
      slug: "atibaia-sp",
      state: "SP",
      ad_state: "MG",
    });
    expect(medium.autoFixable).toBe(true);
  });
});
