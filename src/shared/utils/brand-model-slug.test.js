import { describe, expect, it } from "vitest";

import { brandModelSlug } from "./slugify.js";

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
