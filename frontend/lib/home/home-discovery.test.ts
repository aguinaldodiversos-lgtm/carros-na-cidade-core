import { describe, expect, it } from "vitest";

import { deriveHomeDiscovery, type SampleAd } from "./home-discovery";

function ad(partial: Partial<SampleAd>): SampleAd {
  return { price: null, year: null, body_type: null, below_fipe: false, ...partial };
}

describe("deriveHomeDiscovery", () => {
  it("retorna vazio sem anúncios ou sem UF", () => {
    expect(deriveHomeDiscovery([], "SP")).toEqual({ profiles: [] });
    expect(deriveHomeDiscovery([ad({ price: 50000 })], "")).toEqual({ profiles: [] });
  });

  it("mostra um chip de perfil só quando há anúncio de lastro na amostra", () => {
    const ads: SampleAd[] = [
      ad({ price: 30000, year: 2015, body_type: "hatch" }),
      ad({ price: 65000, year: 2020, body_type: "suv", below_fipe: true }),
      ad({ price: 120000, year: 2022, body_type: "suv" }),
    ];

    const out = deriveHomeDiscovery(ads, "SP");
    const keys = out.profiles.map((p) => p.key);

    expect(keys).toContain("primeiro-carro"); // 30k <= 50k
    expect(keys).toContain("familia"); // há SUV
    expect(keys).toContain("uber-99"); // 2020 & 65k
    expect(keys).toContain("economicos"); // 30k <= 60k
    expect(keys).toContain("abaixo-fipe"); // um below_fipe

    // hrefs vão DIRETO para a vitrine estadual — nada de `/comprar?state=SP`,
    // que só existia para o redirector reenviar o visitante ao mesmo destino.
    for (const p of out.profiles) {
      expect(p.href.startsWith("/comprar/estado/sp")).toBe(true);
      expect(p.href).not.toContain("state=SP");
    }
  });

  // Segunda UF: um destino fixo passaria no caso acima e falha aqui.
  it("o chip segue a UF pedida", () => {
    const ads: SampleAd[] = [ad({ price: 30000, year: 2019, body_type: "hatch" })];
    const out = deriveHomeDiscovery(ads, "MG");
    expect(out.profiles.length).toBeGreaterThan(0);
    for (const p of out.profiles) {
      expect(p.href.startsWith("/comprar/estado/mg")).toBe(true);
    }
  });

  it("oculta perfis sem lastro na amostra", () => {
    // Só um carro caro, antigo, sedan, sem below_fipe → nenhum chip bate.
    const ads: SampleAd[] = [ad({ price: 85000, year: 2014, body_type: "sedan" })];
    const keys = deriveHomeDiscovery(ads, "SP").profiles.map((p) => p.key);

    expect(keys).not.toContain("primeiro-carro"); // 85k > 50k
    expect(keys).not.toContain("economicos"); // 85k > 60k
    expect(keys).not.toContain("familia"); // sem SUV
    expect(keys).not.toContain("uber-99"); // 2014 < 2016
    expect(keys).not.toContain("abaixo-fipe"); // sem below_fipe
    expect(keys).toEqual([]);
  });
});
