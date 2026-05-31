import { describe, expect, it } from "vitest";
import {
  isHighlightActive,
  ADMIN_PRIORITY_COLUMN_LABEL,
  ADMIN_PRIORITY_COLUMN_HINT,
} from "./ads-display";

const NOW = Date.parse("2026-05-29T12:00:00.000Z");

describe("isHighlightActive", () => {
  it("false quando highlight_until é null/undefined/vazio", () => {
    expect(isHighlightActive(null, NOW)).toBe(false);
    expect(isHighlightActive(undefined, NOW)).toBe(false);
    expect(isHighlightActive("", NOW)).toBe(false);
  });

  it("false quando highlight_until é inválido", () => {
    expect(isHighlightActive("not-a-date", NOW)).toBe(false);
  });

  it("true quando highlight_until é futuro", () => {
    expect(isHighlightActive("2026-05-30T00:00:00.000Z", NOW)).toBe(true);
  });

  it("false quando highlight_until é passado", () => {
    expect(isHighlightActive("2026-05-28T00:00:00.000Z", NOW)).toBe(false);
  });

  it("false na igualdade exata com now (strict >)", () => {
    expect(isHighlightActive(new Date(NOW).toISOString(), NOW)).toBe(false);
  });

  it("usa Date.now() como default quando nowMs não é passado", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isHighlightActive(future)).toBe(true);
    expect(isHighlightActive(past)).toBe(false);
  });
});

describe("labels da coluna Prioridade", () => {
  it("usa rótulo 'Prioridade interna' (anti-confusão Fase 3.3)", () => {
    expect(ADMIN_PRIORITY_COLUMN_LABEL).toBe("Prioridade interna");
    expect(ADMIN_PRIORITY_COLUMN_HINT).toMatch(/destaque.+peso.+4/i);
  });
});
