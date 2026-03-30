import { describe, it, expect, vi } from "vitest";
import { accessTokenNeedsRefresh, getJwtExpiryMs } from "./jwt-access";

function jwtWithExp(expSec: number): string {
  const payload = JSON.stringify({ exp: expSec, sub: "test" });
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  return `header.${b64}.sig`;
}

describe("jwt-access", () => {
  it("getJwtExpiryMs retorna null sem token ou JWT inválido", () => {
    expect(getJwtExpiryMs(undefined)).toBeNull();
    expect(getJwtExpiryMs("")).toBeNull();
    expect(getJwtExpiryMs("not-a-jwt")).toBeNull();
  });

  it("getJwtExpiryMs lê exp do payload (segundos → ms)", () => {
    const token = jwtWithExp(1_700_000_000);
    expect(getJwtExpiryMs(token)).toBe(1_700_000_000_000);
  });

  it("accessTokenNeedsRefresh: sem token → true", () => {
    expect(accessTokenNeedsRefresh(undefined)).toBe(true);
  });

  it("accessTokenNeedsRefresh: token sem exp legível → false (opaco / sem refresh forçado)", () => {
    expect(accessTokenNeedsRefresh("opaque-token-value")).toBe(false);
  });

  it("accessTokenNeedsRefresh: exp no futuro além do skew → false", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = jwtWithExp(nowSec + 3600);
    expect(accessTokenNeedsRefresh(token, 120_000)).toBe(false);
  });

  it("accessTokenNeedsRefresh: exp dentro do skew → true", () => {
    vi.useFakeTimers();
    try {
      const fixed = new Date("2025-06-01T12:00:00.000Z");
      vi.setSystemTime(fixed);
      const nowSec = Math.floor(fixed.getTime() / 1000);
      const token = jwtWithExp(nowSec + 60);
      expect(accessTokenNeedsRefresh(token, 120_000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
