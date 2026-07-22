import { describe, expect, it } from "vitest";
import { buildAdHref, buildAdSlug, coerceScalarField } from "./build-ad-href";

describe("coerceScalarField — blindagem contra a armadilha de aranha", () => {
  it("array/objeto → '' (nunca concatena)", () => {
    expect(coerceScalarField(["Honda Civic", "Nissan Kicks"])).toBe("");
    expect(coerceScalarField([100, 101])).toBe("");
    expect(coerceScalarField({} as unknown)).toBe("");
  });

  it("escalares preservam o comportamento anterior", () => {
    expect(coerceScalarField(" Honda Civic ")).toBe("Honda Civic");
    expect(coerceScalarField(2020)).toBe("2020");
    expect(coerceScalarField(null)).toBe("");
    expect(coerceScalarField(undefined)).toBe("");
    expect(coerceScalarField(Number.NaN)).toBe("");
  });
});

describe("buildAdSlug / buildAdHref — comportamento escalar preservado", () => {
  it("usa o slug estável quando presente", () => {
    const slug = "honda-civic-2020-1719849382733";
    expect(buildAdSlug({ slug })).toBe(slug);
    expect(buildAdHref({ slug })).toBe(`/veiculo/${slug}`);
  });

  it("compõe slug a partir de campos escalares quando não há slug", () => {
    const ad = { brand: "Honda", model: "Civic", year: 2020, id: 42 };
    expect(buildAdSlug(ad)).toBe("honda-civic-2020-42");
    expect(buildAdHref(ad)).toBe("/veiculo/honda-civic-2020-42?ref=42");
  });
});

describe("buildAdSlug / buildAdHref — campos ARRAY não geram slug-monstro", () => {
  it("model/id array NÃO concatenam múltiplos modelos no slug", () => {
    const ad = {
      model: ["Honda Civic", "Nissan Kicks", "Jeep Renegade"],
      id: [100, 101, 102],
    } as unknown as Parameters<typeof buildAdSlug>[0];

    const slug = buildAdSlug(ad);
    expect(slug).not.toContain("honda");
    expect(slug).not.toContain("nissan");
    expect(slug).not.toContain("renegade");
    // Sem nenhum escalar válido, cai no fallback determinístico.
    expect(slug).toBe("veiculo-sem-id");
  });

  it("title array não vaza para o href, e id array não vira ?ref concatenado", () => {
    const ad = {
      title: ["Honda Civic", "Nissan Kicks"],
      id: [100, 101],
    } as unknown as Parameters<typeof buildAdHref>[0];

    const href = buildAdHref(ad);
    expect(href).toBe("/veiculo/veiculo-sem-id");
    expect(href).not.toContain("honda");
    expect(href).not.toContain("100-101");
    expect(href).not.toContain("ref=");
  });
});
