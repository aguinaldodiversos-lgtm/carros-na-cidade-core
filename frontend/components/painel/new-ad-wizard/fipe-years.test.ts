import { describe, it, expect } from "vitest";

import {
  extractModelBase,
  extractPrimaryYear,
  fabricationYearChoices,
  uniqueModelBases,
  uniqueModelYears,
  variantsOfBase,
  versionsForYear,
} from "./fipe-years";

describe("extractPrimaryYear", () => {
  it("captura o primeiro ano de 4 dígitos do nome", () => {
    expect(extractPrimaryYear("2014 Gasolina")).toBe(2014);
    expect(extractPrimaryYear("2013 Etanol")).toBe(2013);
    expect(extractPrimaryYear("Sem ano")).toBeNull();
  });
});

describe("extractModelBase — colapsa nomes plenos da FIPE pública em modelo base", () => {
  it("primeira palavra para nomes simples", () => {
    expect(extractModelBase("Gol (novo) 1.0 Mi Total Flex 8V 2p")).toBe("GOL");
    expect(extractModelBase("Polo 1.0 Flex 12V 5p")).toBe("POLO");
    expect(extractModelBase("AMAROK CD2.0 16V/S CD2.0 16V TDI 4x2 Die")).toBe("AMAROK");
  });

  it("preserva 2ª palavra quando 1ª é um prefixo curto (NEW/GRAND/AMG)", () => {
    expect(extractModelBase("New Beetle 2.0 Mi Mec./Aut.")).toBe("NEW BEETLE");
    expect(extractModelBase("Grand Saveiro Xtreme/Street 1.6/1.8/2.0")).toBe(
      "GRAND SAVEIRO"
    );
  });

  it("normaliza pontuação e parênteses sem perder identidade do modelo", () => {
    expect(extractModelBase("up! 1.0 Total Flex 12V 5p")).toBe("UP!");
    expect(extractModelBase("CC 2.0 16V TSI Aut.")).toBe("CC");
  });

  it("string vazia/só espaço retorna ''", () => {
    expect(extractModelBase("")).toBe("");
    expect(extractModelBase("   ")).toBe("");
  });
});

describe("uniqueModelBases — reduz drasticamente o select de Modelo", () => {
  it("VW: 547 variantes parallelum → ~37 modelos base, ordenados pt-BR", () => {
    const flat = [
      { code: "1", name: "Gol 1.0 Mi" },
      { code: "2", name: "Gol G5 1.6" },
      { code: "3", name: "Polo 1.6" },
      { code: "4", name: "AMAROK 2.0 TDI" },
      { code: "5", name: "Amarok V6 3.0" },
      { code: "6", name: "Saveiro Cross" },
      { code: "7", name: "New Beetle 2.0" },
      { code: "8", name: "Grand Saveiro 1.6" },
    ];
    const bases = uniqueModelBases(flat);
    expect(bases).toEqual([
      "AMAROK",
      "GOL",
      "GRAND SAVEIRO",
      "NEW BEETLE",
      "POLO",
      "SAVEIRO",
    ]);
  });

  it("array vazio devolve []", () => {
    expect(uniqueModelBases([])).toEqual([]);
  });
});

describe("variantsOfBase — filtra variantes do modelo escolhido", () => {
  const sample = [
    { code: "1", name: "Gol 1.0 Mi" },
    { code: "2", name: "Gol G5 1.6" },
    { code: "3", name: "Polo 1.6" },
    { code: "4", name: "Polo Sedan 2.0" },
  ];

  it("retorna apenas variantes que pertencem à base", () => {
    expect(variantsOfBase(sample, "GOL")).toEqual([
      { code: "1", name: "Gol 1.0 Mi" },
      { code: "2", name: "Gol G5 1.6" },
    ]);
  });

  it("base ausente → array vazio (não vaza variantes de outras bases)", () => {
    expect(variantsOfBase(sample, "")).toEqual([]);
    expect(variantsOfBase(sample, "AMAROK")).toEqual([]);
  });
});

describe("uniqueModelYears", () => {
  it("ordena anos descendentes e elimina duplicatas", () => {
    expect(
      uniqueModelYears([
        { code: "2014-1", name: "2014 Gasolina" },
        { code: "2014-3", name: "2014 Diesel" },
        { code: "2013-1", name: "2013 Gasolina" },
      ])
    ).toEqual([2014, 2013]);
  });
});

describe("versionsForYear", () => {
  it("filtra variações por ano", () => {
    expect(
      versionsForYear(
        [
          { code: "2014-1", name: "2014 Gasolina" },
          { code: "2014-3", name: "2014 Diesel" },
          { code: "2013-1", name: "2013 Gasolina" },
        ],
        2014
      )
    ).toEqual([
      { code: "2014-1", name: "2014 Gasolina" },
      { code: "2014-3", name: "2014 Diesel" },
    ]);
  });

  it("year=null → array vazio", () => {
    expect(versionsForYear([{ code: "x", name: "2014" }], null)).toEqual([]);
  });
});

describe("fabricationYearChoices", () => {
  it("modelYear=null → []", () => {
    expect(fabricationYearChoices(null)).toEqual([]);
  });

  it("janela [modelYear-1, modelYear+1] limitada ao ano corrente+1", () => {
    const now = new Date().getFullYear();
    const result = fabricationYearChoices(now);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBeLessThanOrEqual(now + 1);
  });
});
