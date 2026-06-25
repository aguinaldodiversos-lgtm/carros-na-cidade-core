import { describe, it, expect } from "vitest";
import { computeAdQuality, ratingForScore } from "./ad-quality";

const FULL = {
  photos: 5,
  hasPrice: true,
  hasDescription: true,
  hasCity: true,
  hasOptionals: true,
};

describe("computeAdQuality", () => {
  it("scores a complete ad as 100 / Muito boa", () => {
    const q = computeAdQuality(FULL);
    expect(q.score).toBe(100);
    expect(q.rating).toBe("Muito boa");
    expect(q.checks).toHaveLength(5);
    expect(q.checks.every((c) => c.ok)).toBe(true);
  });

  it("applies the documented weights (foto 25 / preço 20 / descrição 20 / cidade 20 / opcionais 15)", () => {
    expect(computeAdQuality({ ...FULL, photos: 0 }).score).toBe(75);
    expect(computeAdQuality({ ...FULL, hasPrice: false }).score).toBe(80);
    expect(computeAdQuality({ ...FULL, hasDescription: false }).score).toBe(80);
    expect(computeAdQuality({ ...FULL, hasCity: false }).score).toBe(80);
    expect(computeAdQuality({ ...FULL, hasOptionals: false }).score).toBe(85);
  });

  it("missing optionals does not block — still Muito boa", () => {
    const q = computeAdQuality({ ...FULL, hasOptionals: false });
    expect(q.score).toBe(85);
    expect(q.rating).toBe("Muito boa");
    expect(q.checks.find((c) => c.key === "optionals")?.ok).toBe(false);
  });

  it("classifies bands correctly", () => {
    expect(ratingForScore(100)).toBe("Muito boa");
    expect(ratingForScore(80)).toBe("Muito boa");
    expect(ratingForScore(79)).toBe("Boa");
    expect(ratingForScore(60)).toBe("Boa");
    expect(ratingForScore(59)).toBe("Regular");
    expect(ratingForScore(40)).toBe("Regular");
    expect(ratingForScore(39)).toBe("Incompleta");
    expect(ratingForScore(0)).toBe("Incompleta");
  });

  it("an empty ad scores 0 / Incompleta", () => {
    const q = computeAdQuality({
      photos: 0,
      hasPrice: false,
      hasDescription: false,
      hasCity: false,
      hasOptionals: false,
    });
    expect(q.score).toBe(0);
    expect(q.rating).toBe("Incompleta");
  });
});
