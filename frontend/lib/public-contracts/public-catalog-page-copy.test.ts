// @vitest-environment node
import { describe, expect, it } from "vitest";

import { publicCatalogPageCopy, type CatalogPageVariant } from "./public-catalog-page-copy";

describe("publicCatalogPageCopy — briefing P2 2026-05-25", () => {
  const variants: CatalogPageVariant[] = [
    "home",
    "state",
    "city",
    "region",
    "fipe",
    "simulator",
    "anunciar",
  ];

  it.each(variants)("variant '%s' devolve title+subtitle não-vazios", (variant) => {
    const copy = publicCatalogPageCopy(variant, { label: "São Paulo" });
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.subtitle.length).toBeGreaterThan(0);
  });

  it("state com label → 'Carros usados em <label>'", () => {
    const copy = publicCatalogPageCopy("state", { label: "São Paulo" });
    expect(copy.title).toContain("São Paulo");
  });

  it("region com label → 'Carros usados em <label> e região'", () => {
    const copy = publicCatalogPageCopy("region", { label: "Atibaia" });
    expect(copy.title).toContain("Atibaia");
    expect(copy.title).toContain("região");
  });

  it("simulator é estimativa, não promessa", () => {
    const copy = publicCatalogPageCopy("simulator", { label: "Atibaia" });
    expect(copy.subtitle.toLowerCase()).toContain("estimativa");
  });

  describe("nunca textos técnicos / dados de teste em copy oficial", () => {
    const forbidden = [
      "backend",
      "features[]",
      "has_photo",
      "DeployModel",
      "SÆo Paulo",
      "R$ 0",
      "TODO",
    ];

    for (const variant of variants) {
      for (const word of forbidden) {
        it(`variant '${variant}' NÃO contém '${word}'`, () => {
          const copy = publicCatalogPageCopy(variant, { label: "São Paulo" });
          const joined = `${copy.title} ${copy.subtitle} ${copy.metaTitle ?? ""} ${
            copy.metaDescription ?? ""
          }`;
          expect(joined).not.toContain(word);
        });
      }
    }
  });

  it("sem label NÃO interpola 'undefined' / 'null'", () => {
    for (const variant of variants) {
      const copy = publicCatalogPageCopy(variant, {});
      expect(copy.title).not.toContain("undefined");
      expect(copy.title).not.toContain("null");
      expect(copy.subtitle).not.toContain("undefined");
      expect(copy.subtitle).not.toContain("null");
    }
  });
});
