import { describe, expect, it } from "vitest";

import { decideCityIndexable } from "./regional-radius.service.js";

describe("decideCityIndexable — blindagem anti-escala (self-canonical sempre)", () => {
  it("estoque próprio >= minAds → indexável", () => {
    expect(decideCityIndexable({ ownCount: 3, minAds: 3 })).toBe(true);
    expect(decideCityIndexable({ ownCount: 17, minAds: 3 })).toBe(true);
  });

  it("estoque próprio < minAds → NÃO indexável (mesmo servindo carros da vizinhança)", () => {
    expect(decideCityIndexable({ ownCount: 0, minAds: 3 })).toBe(false); // cidade vazia
    expect(decideCityIndexable({ ownCount: 2, minAds: 3 })).toBe(false); // 1-2 próprios
  });

  it("expansão por distância NÃO altera a indexação (só conta estoque próprio)", () => {
    // Cidade vazia coberta por muitos carros da vizinhança segue noindex.
    expect(decideCityIndexable({ ownCount: 0, minAds: 3 })).toBe(false);
  });
});
