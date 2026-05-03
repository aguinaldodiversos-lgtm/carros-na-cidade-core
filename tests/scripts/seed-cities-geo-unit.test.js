import { describe, expect, it } from "vitest";
import {
  normalizeSourceEntry,
  ufFromCodigoIbge,
} from "../../scripts/seed-cities-geo.mjs";

describe("ufFromCodigoIbge", () => {
  it("traduz codigos numericos IBGE para siglas (canonicas)", () => {
    expect(ufFromCodigoIbge(35)).toBe("SP");
    expect(ufFromCodigoIbge(33)).toBe("RJ");
    expect(ufFromCodigoIbge(53)).toBe("DF");
    expect(ufFromCodigoIbge(43)).toBe("RS");
    expect(ufFromCodigoIbge(11)).toBe("RO");
  });

  it("aceita codigo como string numerica", () => {
    expect(ufFromCodigoIbge("35")).toBe("SP");
  });

  it("retorna null para codigo invalido (nao explode)", () => {
    expect(ufFromCodigoIbge(999)).toBeNull();
    expect(ufFromCodigoIbge(undefined)).toBeNull();
    expect(ufFromCodigoIbge(null)).toBeNull();
    expect(ufFromCodigoIbge("foo")).toBeNull();
  });
});

describe("normalizeSourceEntry", () => {
  it("converte entry tipica do dataset (kelvins-format) para shape interno", () => {
    const entry = {
      codigo_ibge: 3550308,
      nome: "São Paulo",
      latitude: -23.5505,
      longitude: -46.6333,
      capital: 1,
      codigo_uf: 35,
    };
    expect(normalizeSourceEntry(entry)).toEqual({
      slug: "sao-paulo-sp",
      latitude: -23.5505,
      longitude: -46.6333,
    });
  });

  it("normaliza acentos no nome (Atibaia, Brasília, etc)", () => {
    expect(normalizeSourceEntry({
      codigo_ibge: 1,
      nome: "Brasília",
      latitude: -15.7795,
      longitude: -47.9297,
      codigo_uf: 53,
    })).toEqual({
      slug: "brasilia-df",
      latitude: -15.7795,
      longitude: -47.9297,
    });
  });

  it("converte espacos e caracteres especiais para hifens (slug oficial do projeto)", () => {
    expect(normalizeSourceEntry({
      codigo_ibge: 1,
      nome: "Embu das Artes",
      latitude: -23.65,
      longitude: -46.85,
      codigo_uf: 35,
    })?.slug).toBe("embu-das-artes-sp");
  });

  it("retorna null para entry sem nome ou sem geo (degrade gracioso)", () => {
    expect(normalizeSourceEntry(null)).toBeNull();
    expect(normalizeSourceEntry({})).toBeNull();
    expect(normalizeSourceEntry({ nome: "", codigo_uf: 35, latitude: 1, longitude: 1 })).toBeNull();
    expect(normalizeSourceEntry({ nome: "Foo", codigo_uf: 35, latitude: null, longitude: 1 })).toBeNull();
    expect(normalizeSourceEntry({ nome: "Foo", codigo_uf: 35, latitude: 1, longitude: null })).toBeNull();
    expect(normalizeSourceEntry({ nome: "Foo", codigo_uf: 35, latitude: "abc", longitude: 1 })).toBeNull();
  });

  it("retorna null para codigo_uf invalido", () => {
    expect(normalizeSourceEntry({
      codigo_ibge: 1,
      nome: "Cidade Inexistente",
      latitude: -10,
      longitude: -50,
      codigo_uf: 999,
    })).toBeNull();
  });

  it("aceita latitude/longitude como strings numericas (coercao explicita)", () => {
    const result = normalizeSourceEntry({
      codigo_ibge: 1,
      nome: "Foo",
      latitude: "-23.5",
      longitude: "-46.6",
      codigo_uf: 35,
    });
    expect(result).toEqual({
      slug: "foo-sp",
      latitude: -23.5,
      longitude: -46.6,
    });
  });
});
