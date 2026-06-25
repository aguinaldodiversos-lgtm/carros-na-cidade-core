import { describe, it, expect } from "vitest";
import {
  buildSelectedOptionGroups,
  countSelectedOptions,
  extractSelectedKeys,
  getCatalogGroups,
  VEHICLE_OPTION_CATEGORIES,
} from "./vehicle-options";

describe("vehicle-options — getCatalogGroups", () => {
  it("retorna as três categorias na ordem canônica, com itens", () => {
    const groups = getCatalogGroups();
    expect(groups.map((g) => g.category)).toEqual(VEHICLE_OPTION_CATEGORIES);
    expect(groups[0].label).toBe("Conforto");
    expect(groups[1].label).toBe("Dirigibilidade");
    expect(groups[2].label).toBe("Segurança");
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe("vehicle-options — extractSelectedKeys (tolerante a formatos)", () => {
  it("objeto agrupado → keys válidas", () => {
    const keys = extractSelectedKeys({ comfort: ["ar_condicionado"], safety: ["freios_abs"] });
    expect(keys.sort()).toEqual(["ar_condicionado", "freios_abs"]);
  });

  it("array achatado → keys válidas", () => {
    expect(extractSelectedKeys(["freios_abs"])).toEqual(["freios_abs"]);
  });

  it("string JSON → parseada", () => {
    expect(extractSelectedKeys('{"safety":["freios_abs"]}')).toEqual(["freios_abs"]);
  });

  it("descarta keys inválidas e entradas não-string", () => {
    expect(extractSelectedKeys(["freios_abs", "lixo", 42, null])).toEqual(["freios_abs"]);
  });

  it("null/indefinido/string inválida → []", () => {
    expect(extractSelectedKeys(null)).toEqual([]);
    expect(extractSelectedKeys(undefined)).toEqual([]);
    expect(extractSelectedKeys("não-json")).toEqual([]);
  });
});

describe("vehicle-options — buildSelectedOptionGroups (exibição pública)", () => {
  it("vazio → [] (UI cai no fallback derivado)", () => {
    expect(buildSelectedOptionGroups(null)).toEqual([]);
    expect(buildSelectedOptionGroups({})).toEqual([]);
  });

  it("agrupa por categoria, com labels canônicos, na ordem do catálogo", () => {
    const groups = buildSelectedOptionGroups({
      comfort: ["central_multimidia", "ar_condicionado"],
      safety: ["freios_abs"],
    });
    expect(groups).toHaveLength(2);

    const comfort = groups.find((g) => g.category === "comfort")!;
    expect(comfort.label).toBe("Conforto");
    // ar_condicionado (order 0) vem antes de central_multimidia
    expect(comfort.items.map((i) => i.label)).toEqual(["Ar-condicionado", "Central multimídia"]);

    const safety = groups.find((g) => g.category === "safety")!;
    expect(safety.items.map((i) => i.label)).toEqual(["Freios ABS"]);
  });

  it("NÃO inclui categorias vazias", () => {
    const groups = buildSelectedOptionGroups({ safety: ["airbag_duplo"] });
    expect(groups.map((g) => g.category)).toEqual(["safety"]);
  });

  it("usa o label canônico do catálogo (nunca texto vindo do cliente)", () => {
    const groups = buildSelectedOptionGroups({ comfort: ["ar_condicionado"] });
    expect(groups[0].items[0].label).toBe("Ar-condicionado");
  });
});

describe("vehicle-options — countSelectedOptions", () => {
  it("conta apenas keys válidas", () => {
    expect(
      countSelectedOptions({ comfort: ["ar_condicionado", "lixo"], safety: ["freios_abs"] })
    ).toBe(2);
  });
});
