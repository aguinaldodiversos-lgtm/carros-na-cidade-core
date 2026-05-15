// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TERRITORIAL_PREFS_COOKIE,
  clearTerritorialPrefs,
  parseTerritorialPrefsCookieHeader,
  readTerritorialPrefsFromCookie,
  writeTerritorialPrefs,
} from "./territorial-prefs";

beforeEach(() => {
  // Limpa cookies entre testes — jsdom mantém document.cookie persistente
  // dentro do mesmo arquivo.
  document.cookie = `${TERRITORIAL_PREFS_COOKIE}=;path=/;max-age=0`;
});

afterEach(() => {
  document.cookie = `${TERRITORIAL_PREFS_COOKIE}=;path=/;max-age=0`;
});

describe("writeTerritorialPrefs", () => {
  it("escreve cookie com slug + region + state + source + timestamp ISO", () => {
    const out = writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      regionSlug: "atibaia-sp",
      state: "SP",
      source: "geolocation",
    });

    expect(out).not.toBeNull();
    expect(out?.city_slug).toBe("atibaia-sp");
    expect(out?.region_slug).toBe("atibaia-sp");
    expect(out?.state).toBe("SP");
    expect(out?.source).toBe("geolocation");
    expect(out?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const back = readTerritorialPrefsFromCookie();
    expect(back?.city_slug).toBe("atibaia-sp");
  });

  it("normaliza state UF para uppercase", () => {
    const out = writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      state: "sp",
      source: "manual",
    });
    expect(out?.state).toBe("SP");
  });

  it("rejeita slug malformado (vira undefined)", () => {
    const out = writeTerritorialPrefs({
      citySlug: "S!@#$%",
      state: "SP",
      source: "manual",
    });
    expect(out?.city_slug).toBeUndefined();
  });

  it("rejeita UF inválida (vira undefined)", () => {
    const out = writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      state: "XYZ",
      source: "manual",
    });
    expect(out?.state).toBeUndefined();
  });

  it("source desconhecida vira 'default' (contrato estrito)", () => {
    const out = writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      state: "SP",
      // @ts-expect-error testando coerção
      source: "twitter",
    });
    expect(out?.source).toBe("default");
  });

  it("cookie NÃO contém latitude/longitude (proteção LGPD)", () => {
    writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      state: "SP",
      source: "geolocation",
    });
    // Verifica direto o document.cookie.
    const raw = document.cookie;
    expect(raw.toLowerCase()).not.toContain("latitude");
    expect(raw.toLowerCase()).not.toContain("longitude");
    expect(raw.toLowerCase()).not.toContain("lat=");
    expect(raw.toLowerCase()).not.toContain("lng=");
  });
});

describe("readTerritorialPrefsFromCookie", () => {
  it("retorna null quando o cookie não existe", () => {
    expect(readTerritorialPrefsFromCookie()).toBeNull();
  });

  it("retorna null quando cookie é JSON malformado", () => {
    document.cookie = `${TERRITORIAL_PREFS_COOKIE}=${encodeURIComponent("not-json")};path=/`;
    expect(readTerritorialPrefsFromCookie()).toBeNull();
  });

  it("normaliza durante leitura (UF lowercase no cookie vira uppercase)", () => {
    const value = encodeURIComponent(
      JSON.stringify({
        city_slug: "atibaia-sp",
        state: "sp",
        source: "geolocation",
        updated_at: "2026-05-15T00:00:00.000Z",
      })
    );
    document.cookie = `${TERRITORIAL_PREFS_COOKIE}=${value};path=/`;

    const prefs = readTerritorialPrefsFromCookie();
    expect(prefs?.state).toBe("SP");
  });
});

describe("clearTerritorialPrefs", () => {
  it("remove o cookie", () => {
    writeTerritorialPrefs({
      citySlug: "atibaia-sp",
      state: "SP",
      source: "geolocation",
    });
    expect(readTerritorialPrefsFromCookie()).not.toBeNull();

    clearTerritorialPrefs();
    expect(readTerritorialPrefsFromCookie()).toBeNull();
  });
});

describe("parseTerritorialPrefsCookieHeader (SSR helper)", () => {
  it("parsea cookie header do request server-side", () => {
    const value = encodeURIComponent(
      JSON.stringify({
        city_slug: "atibaia-sp",
        region_slug: "atibaia-sp",
        state: "SP",
        source: "manual",
        updated_at: "2026-05-15T00:00:00.000Z",
      })
    );
    const header = `other=stuff; ${TERRITORIAL_PREFS_COOKIE}=${value}; more=stuff`;
    const prefs = parseTerritorialPrefsCookieHeader(header);
    expect(prefs?.city_slug).toBe("atibaia-sp");
    expect(prefs?.region_slug).toBe("atibaia-sp");
    expect(prefs?.source).toBe("manual");
  });

  it("retorna null quando o cookie não está no header", () => {
    expect(parseTerritorialPrefsCookieHeader("other=stuff")).toBeNull();
  });

  it("retorna null quando o header é vazio/null", () => {
    expect(parseTerritorialPrefsCookieHeader("")).toBeNull();
    expect(parseTerritorialPrefsCookieHeader(null)).toBeNull();
    expect(parseTerritorialPrefsCookieHeader(undefined)).toBeNull();
  });
});
