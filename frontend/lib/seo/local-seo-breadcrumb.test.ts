import { describe, it, expect } from "vitest";
import { buildBaratosBreadcrumbJsonLd } from "./local-seo-metadata";
import type { LocalSeoLandingModel } from "./local-seo-data";

function model(over: Partial<LocalSeoLandingModel> = {}): LocalSeoLandingModel {
  return {
    slug: "sao-paulo-sp",
    cityName: "São Paulo",
    state: "SP",
    ...over,
  } as LocalSeoLandingModel;
}

describe("buildBaratosBreadcrumbJsonLd (§4.3.1)", () => {
  it("emite BreadcrumbList Início → UF → Carros baratos em [Cidade]", () => {
    const ld = buildBaratosBreadcrumbJsonLd(model());
    expect(ld).toBeTruthy();
    expect(ld!["@type"]).toBe("BreadcrumbList");
    const items = ld!.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("Início");
    expect(items[1].name).toBe("SP");
    expect(items[2].name).toBe("Carros baratos em São Paulo");
    expect(String(items[2].item)).toMatch(/\/carros-baratos-em\/sao-paulo-sp$/);
  });

  it("sem UF: pula o nó de estado", () => {
    const ld = buildBaratosBreadcrumbJsonLd(model({ state: "" }));
    const items = ld!.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[1].name).toBe("Carros baratos em São Paulo");
  });

  it("sem slug/cidade → null", () => {
    expect(buildBaratosBreadcrumbJsonLd(model({ slug: "" }))).toBe(null);
    expect(buildBaratosBreadcrumbJsonLd(model({ cityName: "" }))).toBe(null);
  });
});
