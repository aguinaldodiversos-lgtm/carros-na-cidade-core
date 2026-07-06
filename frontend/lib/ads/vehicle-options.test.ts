import { describe, it, expect } from "vitest";
import {
  buildSelectedOptionGroups,
  buildTrustBadges,
  countSelectedOptions,
  extractSelectedKeys,
  getCatalogGroups,
  TRUST_BADGE_KEYS,
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

describe("vehicle-options — buildSelectedOptionGroups (excludeKeys)", () => {
  it("remove as chaves listadas em excludeKeys dos grupos", () => {
    const groups = buildSelectedOptionGroups(
      { drivability: ["unico_dono", "rodas_liga_leve"] },
      { excludeKeys: ["unico_dono"] }
    );
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain("rodas_liga_leve");
    expect(keys).not.toContain("unico_dono");
  });

  it("omite a categoria inteira quando todas as chaves foram excluídas", () => {
    const groups = buildSelectedOptionGroups(
      { drivability: ["unico_dono"] },
      { excludeKeys: ["unico_dono"] }
    );
    expect(groups).toEqual([]);
  });
});

describe("vehicle-options — buildTrustBadges (selos de procedência)", () => {
  it("retorna só as chaves de procedência selecionadas, em ordem canônica", () => {
    const badges = buildTrustBadges({
      drivability: ["rodas_liga_leve", "chave_reserva", "unico_dono"],
      safety: ["laudo_cautelar_aprovado"],
    });
    // ordem canônica de TRUST_BADGE_KEYS: unico_dono antes de chave_reserva antes de laudo
    expect(badges.map((b) => b.key)).toEqual([
      "unico_dono",
      "chave_reserva",
      "laudo_cautelar_aprovado",
    ]);
    // usa o label canônico do catálogo
    expect(badges[0].label).toBe("Único dono");
  });

  it("todas as TRUST_BADGE_KEYS existem no catálogo (label resolvível)", () => {
    const badges = buildTrustBadges({ everything: TRUST_BADGE_KEYS });
    expect(badges).toHaveLength(TRUST_BADGE_KEYS.length);
    for (const b of badges) expect(b.label.length).toBeGreaterThan(0);
  });

  it("vazio quando nenhuma chave de procedência foi marcada", () => {
    expect(buildTrustBadges({ comfort: ["ar_condicionado"] })).toEqual([]);
    expect(buildTrustBadges(null)).toEqual([]);
  });
});

describe("vehicle-options — countSelectedOptions", () => {
  it("conta apenas keys válidas", () => {
    expect(
      countSelectedOptions({ comfort: ["ar_condicionado", "lixo"], safety: ["freios_abs"] })
    ).toBe(2);
  });
});
