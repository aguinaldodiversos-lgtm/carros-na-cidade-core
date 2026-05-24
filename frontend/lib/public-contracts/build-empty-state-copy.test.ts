// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildEmptyStateCopy } from "./build-empty-state-copy";

describe("buildEmptyStateCopy — briefing P2 2026-05-25", () => {
  it.each([
    "city-no-ads",
    "region-no-ads",
    "state-no-ads",
    "search-no-results",
    "filters-no-results",
    "detail-not-found",
  ] as const)("variant '%s' devolve title e body não-vazios", (variant) => {
    const copy = buildEmptyStateCopy(variant, { label: "Atibaia" });
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  it("city-no-ads sem label NÃO interpola undefined", () => {
    const copy = buildEmptyStateCopy("city-no-ads", {});
    expect(copy.title).not.toContain("undefined");
    expect(copy.title).not.toContain("null");
  });

  it("city-no-ads com label injeta o nome no title", () => {
    const copy = buildEmptyStateCopy("city-no-ads", { label: "Atibaia" });
    expect(copy.title).toContain("Atibaia");
  });

  it("detail-not-found cobre cópia 'Veículo não encontrado' (alinhada com /veiculo not-found.tsx)", () => {
    const copy = buildEmptyStateCopy("detail-not-found");
    expect(copy.title).toContain("Veículo não encontrado");
  });

  describe("strings proibidas pelo briefing P0/P1/P2", () => {
    const variants = [
      "city-no-ads",
      "region-no-ads",
      "state-no-ads",
      "search-no-results",
      "filters-no-results",
      "detail-not-found",
    ] as const;

    const forbidden = [
      "backend",
      "features[]",
      "has_photo",
      "DeployModel",
      "SÆo Paulo",
      "R$ 0",
    ];

    for (const variant of variants) {
      for (const word of forbidden) {
        it(`variant '${variant}' NÃO contém '${word}'`, () => {
          const copy = buildEmptyStateCopy(variant, { label: "Atibaia" });
          const joined = `${copy.title} ${copy.body} ${copy.cta?.label ?? ""}`;
          expect(joined).not.toContain(word);
        });
      }
    }
  });
});
