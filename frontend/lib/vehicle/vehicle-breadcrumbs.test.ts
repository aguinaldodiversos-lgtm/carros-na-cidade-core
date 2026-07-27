import { describe, expect, it } from "vitest";

import { buildVehicleBreadcrumbs } from "./vehicle-breadcrumbs";
import { buildBreadcrumbJsonLd } from "@/lib/seo/page-structured-data";
import type { VehicleDetail } from "./public-vehicle";

function veiculo(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    city: "Atibaia (SP)",
    citySlug: "atibaia-sp",
    model: "Onix Hatch 1.0",
    ...over,
  } as VehicleDetail;
}

describe("buildVehicleBreadcrumbs", () => {
  it("monta Home > Comprar > Cidade (UF) > Modelo", () => {
    expect(buildVehicleBreadcrumbs(veiculo())).toEqual([
      { name: "Home", href: "/" },
      { name: "Comprar", href: "/comprar" },
      { name: "Atibaia (SP)", href: "/carros-em/atibaia-sp" },
      { name: "Onix Hatch 1.0" },
    ]);
  });

  it("a cidade linka a URL CANÔNICA /carros-em/[slug]", () => {
    // Não `/cidade/` nem `/comprar/cidade/` — ambas canonicalizam para esta.
    const [, , cidade] = buildVehicleBreadcrumbs(veiculo({ citySlug: "braganca-paulista-sp" }));
    expect(cidade.href).toBe("/carros-em/braganca-paulista-sp");
  });

  it("o último item NÃO tem href (é a página atual)", () => {
    const trilha = buildVehicleBreadcrumbs(veiculo());
    expect(trilha[trilha.length - 1]).not.toHaveProperty("href");
  });

  /**
   * `deriveCitySlug` devolve "" quando o anúncio não tem cidade (briefing P0
   * 2026-05-24: não inventar "sao-paulo-sp"). Emitir o item aqui geraria link
   * quebrado para `/carros-em/` e poluiria o BreadcrumbList.
   */
  it("OMITE a cidade quando não há slug", () => {
    const trilha = buildVehicleBreadcrumbs(
      veiculo({ citySlug: "", city: "Localização não informada" })
    );
    expect(trilha).toHaveLength(3);
    expect(trilha.map((i) => i.name)).toEqual(["Home", "Comprar", "Onix Hatch 1.0"]);
    expect(trilha.some((i) => i.href?.startsWith("/carros-em/"))).toBe(false);
  });

  it('OMITE quando o rótulo é "Localização não informada" mesmo com slug', () => {
    const trilha = buildVehicleBreadcrumbs(
      veiculo({ citySlug: "algo-sp", city: "Localização não informada" })
    );
    expect(trilha).toHaveLength(3);
  });

  it("escapa slug com caractere especial no href", () => {
    const [, , cidade] = buildVehicleBreadcrumbs(veiculo({ citySlug: "coração-sp" }));
    expect(cidade.href).toBe(`/carros-em/${encodeURIComponent("coração-sp")}`);
  });

  it("tolera campos ausentes sem quebrar", () => {
    const trilha = buildVehicleBreadcrumbs({} as VehicleDetail);
    expect(trilha[0]).toEqual({ name: "Home", href: "/" });
    expect(trilha).toHaveLength(3);
  });
});

describe("BreadcrumbList do JSON-LD reflete a cidade", () => {
  it("emite 4 posições, com a cidade em 3ª e URL absoluta", () => {
    const jsonLd = buildBreadcrumbJsonLd(buildVehicleBreadcrumbs(veiculo()));

    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    expect(jsonLd.itemListElement).toHaveLength(4);

    const cidade = jsonLd.itemListElement[2];
    expect(cidade.position).toBe(3);
    expect(cidade.name).toBe("Atibaia (SP)");
    expect(String(cidade.item)).toMatch(/^https?:\/\/[^/]+\/carros-em\/atibaia-sp$/);
  });

  it("sem cidade, o BreadcrumbList tem 3 posições e nenhuma /carros-em/", () => {
    const jsonLd = buildBreadcrumbJsonLd(buildVehicleBreadcrumbs(veiculo({ citySlug: "" })));
    expect(jsonLd.itemListElement).toHaveLength(3);
    expect(JSON.stringify(jsonLd)).not.toContain("/carros-em/");
  });
});
