import { describe, it, expect } from "vitest";
import {
  VEHICLE_OPTIONS_CATALOG,
  VEHICLE_OPTION_CATEGORIES,
  VEHICLE_OPTION_KEYS,
  flattenVehicleOptions,
  isValidVehicleOptionKey,
  normalizeVehicleOptions,
} from "../../src/modules/ads/ad-options.catalog.js";

describe("ad-options.catalog — integridade", () => {
  it("keys são únicas em todo o catálogo", () => {
    const keys = VEHICLE_OPTIONS_CATALOG.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("toda categoria é uma das três canônicas e tem label não vazio sem HTML", () => {
    for (const item of VEHICLE_OPTIONS_CATALOG) {
      expect(VEHICLE_OPTION_CATEGORIES).toContain(item.category);
      expect(typeof item.label).toBe("string");
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.label).not.toMatch(/[<>]/); // sem HTML/script nos labels
    }
  });

  it("as três categorias têm itens", () => {
    for (const category of VEHICLE_OPTION_CATEGORIES) {
      const count = VEHICLE_OPTIONS_CATALOG.filter((i) => i.category === category).length;
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe("normalizeVehicleOptions", () => {
  it("entrada vazia/nula → {} (anúncio pode ser salvo sem opcionais)", () => {
    expect(normalizeVehicleOptions(null)).toEqual({});
    expect(normalizeVehicleOptions(undefined)).toEqual({});
    expect(normalizeVehicleOptions([])).toEqual({});
    expect(normalizeVehicleOptions({})).toEqual({});
    expect(normalizeVehicleOptions("lixo")).toEqual({});
  });

  it("lista achatada de opcionais de conforto → agrupado em comfort", () => {
    const result = normalizeVehicleOptions(["ar_condicionado", "central_multimidia"]);
    expect(result).toEqual({ comfort: ["ar_condicionado", "central_multimidia"] });
  });

  it("opcionais de dirigibilidade → agrupado em drivability", () => {
    const result = normalizeVehicleOptions(["cambio_automatico", "rodas_liga_leve"]);
    expect(result).toEqual({ drivability: ["cambio_automatico", "rodas_liga_leve"] });
  });

  it("opcionais de segurança → agrupado em safety", () => {
    const result = normalizeVehicleOptions(["airbag_duplo", "freios_abs"]);
    expect(result).toEqual({ safety: ["airbag_duplo", "freios_abs"] });
  });

  it("reagrupa pela categoria canônica mesmo se o cliente mandar na categoria errada", () => {
    const result = normalizeVehicleOptions({
      safety: ["ar_condicionado"], // conforto enviado como safety
      comfort: ["airbag_duplo"], // segurança enviado como comfort
    });
    expect(result).toEqual({ comfort: ["ar_condicionado"], safety: ["airbag_duplo"] });
  });

  it("ignora keys desconhecidas (não quebra o save)", () => {
    const result = normalizeVehicleOptions([
      "ar_condicionado",
      "key_que_nao_existe",
      "<script>",
      "freios_abs",
    ]);
    expect(result).toEqual({ comfort: ["ar_condicionado"], safety: ["freios_abs"] });
  });

  it("deduplica keys repetidas", () => {
    const result = normalizeVehicleOptions(["freios_abs", "freios_abs", "freios_abs"]);
    expect(result).toEqual({ safety: ["freios_abs"] });
  });

  it("ordena as keys pela ordem do catálogo, não pela ordem de entrada", () => {
    // central_multimidia (order alto) enviado antes de ar_condicionado (order 0)
    const result = normalizeVehicleOptions(["central_multimidia", "ar_condicionado"]);
    expect(result.comfort).toEqual(["ar_condicionado", "central_multimidia"]);
  });

  it("idempotente: normalizar o resultado agrupado dá o mesmo objeto", () => {
    const once = normalizeVehicleOptions(["airbag_duplo", "ar_condicionado", "cambio_automatico"]);
    const twice = normalizeVehicleOptions(once);
    expect(twice).toEqual(once);
  });
});

describe("flattenVehicleOptions / isValidVehicleOptionKey", () => {
  it("flatten devolve só keys válidas", () => {
    const flat = flattenVehicleOptions({
      comfort: ["ar_condicionado", "invalida"],
      safety: ["freios_abs"],
    });
    expect(flat).toEqual(["ar_condicionado", "freios_abs"]);
  });

  it("isValidVehicleOptionKey reconhece keys do catálogo", () => {
    expect(isValidVehicleOptionKey("freios_abs")).toBe(true);
    expect(isValidVehicleOptionKey("nope")).toBe(false);
    expect(VEHICLE_OPTION_KEYS).toContain("ar_condicionado");
  });
});
