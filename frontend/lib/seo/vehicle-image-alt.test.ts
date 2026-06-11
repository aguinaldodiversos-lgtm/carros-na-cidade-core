import { describe, it, expect } from "vitest";
import { buildVehicleImageAlt, splitCityState } from "./vehicle-image-alt";

describe("splitCityState", () => {
  it("separa 'Cidade (UF)'", () => {
    expect(splitCityState("Atibaia (SP)")).toEqual({ city: "Atibaia", state: "SP" });
  });
  it("sem UF", () => {
    expect(splitCityState("Atibaia")).toEqual({ city: "Atibaia", state: "" });
  });
  it("normaliza UF para maiúsculas", () => {
    expect(splitCityState("Bragança Paulista (sp)")).toEqual({
      city: "Bragança Paulista",
      state: "SP",
    });
  });
});

describe("buildVehicleImageAlt", () => {
  it("gera o padrão completo", () => {
    expect(
      buildVehicleImageAlt({
        brand: "Chevrolet",
        model: "Onix",
        year: "2024/2025",
        city: "Atibaia",
        state: "SP",
      })
    ).toBe("Chevrolet Onix 2024 usado em Atibaia - SP");
  });

  it("sem estado", () => {
    expect(
      buildVehicleImageAlt({ brand: "Fiat", model: "Argo", year: 2022, city: "Jundiaí" })
    ).toBe("Fiat Argo 2022 usado em Jundiaí");
  });

  it("sem cidade omite o local", () => {
    expect(buildVehicleImageAlt({ brand: "VW", model: "Gol", year: "2019" })).toBe(
      "VW Gol 2019 usado"
    );
  });

  it("vazio quando não há nada", () => {
    expect(buildVehicleImageAlt({})).toBe("");
  });
});
