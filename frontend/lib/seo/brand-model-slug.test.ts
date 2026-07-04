// @vitest-environment node
import { describe, expect, it } from "vitest";

import { brandModelSlug, canonicalBrandSlug, canonicalBrandLabel } from "./brand-model-slug";

/**
 * Fixtures compartilhadas com o backend
 * (`src/read-models/cities/territorial-cluster.logic.test.js` e
 * `src/shared/utils/slugify.test.js`). Mantê-las idênticas é o contrato de
 * sincronia: link/sitemap gerado de um lado resolve para a mesma página do
 * outro. Se mudar aqui, mudar lá.
 */
export const BRAND_MODEL_SLUG_FIXTURES: Array<[string | null | undefined, string]> = [
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

describe("brandModelSlug — slug canônico de marca/modelo", () => {
  it.each(BRAND_MODEL_SLUG_FIXTURES)("slug(%p) === %p", (input, expected) => {
    expect(brandModelSlug(input)).toBe(expected);
  });

  it('NÃO colapsa "gol" e "golf" (proteção contra match por substring)', () => {
    expect(brandModelSlug("Gol")).not.toBe(brandModelSlug("Golf"));
  });

  it("acentos são removidos (NFD strip), espaços viram hífen", () => {
    expect(brandModelSlug("Citroën")).toBe("citroen");
    expect(brandModelSlug("São José dos Campos")).toBe("sao-jose-dos-campos");
  });
});

/** Fixtures ESPELHADAS no backend (`src/shared/utils/brand-model-slug.test.js`). */
const BRAND_CANONICAL_FIXTURES: Array<[string, string, string]> = [
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

  it("modelo 'HB 20' segue 'hb-20' (não sofre strip de marca)", () => {
    expect(brandModelSlug("HB 20")).toBe("hb-20");
  });
});
