import { describe, expect, it } from "vitest";

import { brandModelSlug, canonicalBrandSlug, canonicalBrandLabel } from "./slugify.js";

/**
 * Fixtures ESPELHADAS em
 * `frontend/lib/seo/brand-model-slug.test.ts#BRAND_MODEL_SLUG_FIXTURES`.
 * Se mudar uma lista, mudar a outra — é o contrato de sincronia que garante
 * que o slug gerado no backend (links/sitemap) resolva para a mesma página no
 * frontend.
 */
const FIXTURES = [
  ["Fiat", "fiat"],
  ["Chevrolet", "chevrolet"],
  ["Volkswagen", "volkswagen"],
  ["Hyundai", "hyundai"],
  ["Citroën", "citroen"],
  ["Land Rover", "land-rover"],
  ["Mercedes-Benz", "mercedes-benz"],
  ["HB20", "hb20"],
  ["HB 20", "hb-20"],
  ["HB20S", "hb20s"],
  ["Gol", "gol"],
  ["Golf", "golf"],
  ["Mogi Guaçu", "mogi-guacu"],
  ["  Fiat  ", "fiat"],
  ["FIAT", "fiat"],
  ["", ""],
  [null, ""],
  [undefined, ""],
];

describe("brandModelSlug (backend) — paridade com frontend", () => {
  it.each(FIXTURES)("slug(%p) === %p", (input, expected) => {
    expect(brandModelSlug(input)).toBe(expected);
  });

  it('"gol" !== "golf"', () => {
    expect(brandModelSlug("Gol")).not.toBe(brandModelSlug("Golf"));
  });
});

/**
 * Normalização canônica de MARCA (strip do prefixo de grupo FIPE). Fixtures
 * ESPELHADAS em `frontend/lib/seo/brand-model-slug.test.ts`.
 */
const BRAND_CANONICAL_FIXTURES = [
  // [entrada, slug, label]
  ["GM - Chevrolet", "chevrolet", "Chevrolet"],
  ["VW - VolksWagen", "volkswagen", "Volkswagen"],
  ["Chevrolet", "chevrolet", "Chevrolet"],
  ["volkswagen", "volkswagen", "Volkswagen"],
  ["Fiat", "fiat", "Fiat"],
  ["Land Rover", "land-rover", "Land Rover"],
  ["Mercedes-Benz", "mercedes-benz", "Mercedes-Benz"],
  ["Caoa Chery/Chery", "caoa-chery-chery", "Caoa Chery/Chery"],
];

describe("canonicalBrandSlug/Label — strip do prefixo de grupo FIPE (só marca)", () => {
  it.each(BRAND_CANONICAL_FIXTURES)("brand(%p) → slug %p / label %p", (input, slug, label) => {
    expect(canonicalBrandSlug(input)).toBe(slug);
    expect(canonicalBrandLabel(input)).toBe(label);
  });

  it("NÃO afeta modelos com espaço-hífen (via brandModelSlug): 'HB 20' segue 'hb-20'", () => {
    // canonicalBrandSlug nunca é aplicado a modelo; brandModelSlug preserva.
    expect(brandModelSlug("HB 20")).toBe("hb-20");
  });
});
