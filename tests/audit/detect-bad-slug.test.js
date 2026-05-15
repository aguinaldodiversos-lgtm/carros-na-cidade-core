import { describe, expect, it } from "vitest";

import {
  detectBadSlug,
  suggestAdSlug,
} from "../../scripts/audit/lib/detect-bad-slug.mjs";

describe("detectBadSlug — slugs válidos não são flagados", () => {
  it("'honda-civic-lxr-2019-12345' não é bad", () => {
    const result = detectBadSlug({
      slug: "honda-civic-lxr-2019-12345",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.isBad).toBe(false);
    expect(result.severity).toBe("ok");
  });
});

describe("detectBadSlug — CRITICAL", () => {
  it("slug vazio → critical", () => {
    const result = detectBadSlug({ slug: "" });
    expect(result.severity).toBe("critical");
    expect(result.suggested).toBeDefined();
  });

  it("slug null → critical", () => {
    expect(detectBadSlug({ slug: null }).severity).toBe("critical");
  });

  it("slug 'wp-admin' (reservado) → critical", () => {
    const result = detectBadSlug({ slug: "wp-admin", brand: "Honda", model: "Civic" });
    expect(result.severity).toBe("critical");
  });

  it("slug 'admin/foo' (reservado prefix) → critical", () => {
    expect(detectBadSlug({ slug: "admin/foo" }).severity).toBe("critical");
  });
});

describe("detectBadSlug — HIGH", () => {
  it("slug com caracteres inválidos (espaço, !, %) → high", () => {
    const result = detectBadSlug({ slug: "honda civic 2019!" });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "slug_invalid_chars")).toBe(true);
  });

  it("slug muito longo (> 200 chars) → high", () => {
    const longSlug = "a-".repeat(120);
    expect(detectBadSlug({ slug: longSlug }).severity).toBe("high");
  });

  it("slug all-digits → high", () => {
    expect(detectBadSlug({ slug: "12345678" }).severity).toBe("high");
  });

  it("slug com acento → high (não passa SLUG_VALID_CHARS)", () => {
    expect(detectBadSlug({ slug: "civic-ônix" }).severity).toBe("high");
  });
});

describe("detectBadSlug — MEDIUM (sem marca/modelo no slug)", () => {
  it("slug genérico sem brand/model → medium", () => {
    const result = detectBadSlug({
      slug: "veiculo-12345",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).toBe("medium");
  });

  it("slug que inclui brand passa", () => {
    const result = detectBadSlug({
      slug: "honda-veiculo-12345",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).not.toBe("medium");
  });
});

describe("detectBadSlug — LOW (estética)", () => {
  it("slug com dashes duplicados → low", () => {
    const result = detectBadSlug({
      slug: "honda--civic-2019",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).toBe("low");
  });

  it("slug com dash inicial → low", () => {
    const result = detectBadSlug({
      slug: "-honda-civic",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).toBe("low");
  });

  it("slug com underscore → low", () => {
    const result = detectBadSlug({
      slug: "honda_civic_2019",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).toBe("low");
  });

  it("slug com uppercase → low", () => {
    const result = detectBadSlug({
      slug: "Honda-Civic-2019",
      brand: "Honda",
      model: "Civic",
    });
    expect(result.severity).toBe("low");
  });
});

describe("suggestAdSlug — sugestões canônicas", () => {
  it("brand+model+year+id forma slug semantic", () => {
    expect(
      suggestAdSlug({ brand: "Honda", model: "Civic", year: 2019, id: 42 })
    ).toBe("honda-civic-2019-42");
  });

  it("normaliza acento", () => {
    expect(suggestAdSlug({ brand: "Citroën", model: "C4", id: 1 })).toBe("citroen-c4-1");
  });

  it("sem brand/model → null", () => {
    expect(suggestAdSlug({})).toBeNull();
  });
});
