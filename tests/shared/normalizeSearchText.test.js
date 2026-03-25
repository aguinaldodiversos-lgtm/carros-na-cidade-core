import { describe, it, expect } from "vitest";
import { normalizeSearchText } from "../../src/shared/utils/normalizeSearchText.js";

describe("normalizeSearchText", () => {
  it("remove acentos e compara trechos como no autocomplete", () => {
    expect(normalizeSearchText("São Paulo")).toBe("sao paulo");
    expect(normalizeSearchText("Campinas")).toContain("campinas");
  });
});
