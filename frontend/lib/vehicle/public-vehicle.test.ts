import { describe, expect, it } from "vitest";

import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { adaptAdDetailToVehicle } from "@/lib/vehicle/public-vehicle";

/**
 * Cobertura das reconciliações que eliminam dados públicos contraditórios
 * sinalizados na rodada de credibilidade (anúncio Onix):
 *   - Título não duplica o ano (que já é exibido em meta separada)
 *   - Câmbio "Mec." na versão sobrescreve transmission "automatico"
 *   - Carroceria deduzida do modelo ("Onix Hatch") sobrescreve body_type
 *     "sedan" vindo errado do backend
 *   - Anunciante com `seller_type=dealer` ou `dealership_name` é tratado
 *     como loja (não "particular")
 */

function makeAd(overrides: Partial<PublicAdDetail> = {}): PublicAdDetail {
  return {
    id: 1,
    slug: "onix-hatch",
    title: "Chevrolet Onix Hatch 2020",
    description: "Onix em ótimo estado.",
    price: 65000,
    city: "São Paulo",
    state: "SP",
    brand: "Chevrolet",
    model: "ONIX HATCH",
    version: "1.0 Mec.",
    year: 2020,
    mileage: 41000,
    body_type: "sedan",
    fuel_type: "Flex",
    transmission: "automatico",
    below_fipe: false,
    highlight_until: null,
    plan: "free",
    advertiser_id: 10,
    city_slug: "sao-paulo-sp",
    seller_name: "Loja Boa Praça",
    seller_type: "dealer",
    dealership_name: null,
    color: "Prata",
    phone: null,
    whatsapp: null,
    whatsapp_number: null,
    image_url: null,
    cover_image: null,
    thumbnail: null,
    photo: null,
    images: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("adaptAdDetailToVehicle — reconciliação anti-incoerência", () => {
  it("não duplica o ano no título quando ele já está em ad.title", () => {
    const v = adaptAdDetailToVehicle(makeAd({ title: "Chevrolet Onix Hatch 2020" }));
    expect(v.fullName).toBe("Chevrolet Onix Hatch");
    expect(v.fullName).not.toMatch(/2020/);
  });

  it("não duplica o ano no formato 'YYYY/YYYY'", () => {
    const v = adaptAdDetailToVehicle(makeAd({ title: "Chevrolet Onix 2020/2021" }));
    expect(v.fullName).not.toMatch(/20\d{2}/);
  });

  it("respeita 'Mec.' na versão e não declara câmbio automático", () => {
    const v = adaptAdDetailToVehicle(makeAd({ version: "1.0 Mec.", transmission: "automatico" }));
    expect(v.transmission).toBe("Manual");
    expect(v.optionalItems).toContain("Câmbio Manual");
  });

  it("respeita 'Aut.' na versão quando o backend manda 'manual' por engano", () => {
    const v = adaptAdDetailToVehicle(makeAd({ version: "2.0 16V Aut.", transmission: "manual" }));
    expect(v.transmission).toBe("Automático");
  });

  it("usa modelo 'ONIX HATCH' como fonte para carroceria, não 'sedan'", () => {
    const v = adaptAdDetailToVehicle(makeAd({ model: "ONIX HATCH", body_type: "sedan" }));
    expect(v.bodyType).toBe("Hatch");
    expect(v.optionalItems).toContain("Carroceria Hatch");
    expect(v.optionalItems).not.toContain("Carroceria sedan");
  });

  it("identifica loja via seller_kind='dealer' do backend (trust pass)", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ seller_kind: "dealer", dealership_id: null, plan: "free" })
    );
    expect(v.seller.type).toBe("dealer");
  });

  it("identifica loja via dealership_id válido", () => {
    const v = adaptAdDetailToVehicle(makeAd({ seller_kind: null, dealership_id: 42 }));
    expect(v.seller.type).toBe("dealer");
  });

  it("identifica loja via account_type=CNPJ sem dealership_id (loja sem advertiser)", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ seller_kind: null, dealership_id: null, account_type: "CNPJ" })
    );
    expect(v.seller.type).toBe("dealer");
  });

  it("dealership_name SEM outros sinais → private (regressão 'ittmotors')", () => {
    // Caso real: backend antigo deixava nome comercial em dealership_name
    // mas o usuário era CPF e não havia advertiser registrado. Frontend
    // NUNCA pode classificar como loja por nome.
    const v = adaptAdDetailToVehicle(
      makeAd({
        seller_kind: null,
        seller_type: null,
        dealership_id: null,
        dealership_name: "ittmotors",
        account_type: "CPF",
      })
    );
    expect(v.seller.type).toBe("private");
  });

  it("preserva 'particular' quando não há sinais de loja", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({
        seller_type: "private",
        dealership_name: null,
        plan: "free",
        seller_name: "João da Silva",
      })
    );
    expect(v.seller.type).toBe("private");
  });

  it("não cria item de carroceria quando body_type não é informado e modelo não traz token", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ model: "Civic", body_type: null, title: "Honda Civic" })
    );
    expect(v.optionalItems.find((i) => i.startsWith("Carroceria"))).toBeUndefined();
  });
});

describe("adaptAdDetailToVehicle — combustível duplicado no H1/fullName", () => {
  it("colapsa 'Flex Flex' para um único 'Flex'", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ title: "Chevrolet Onix Hatch LT 1.0 6V Flex Flex", fuel_type: "Flex" })
    );
    expect(v.fullName).toBe("Chevrolet Onix Hatch LT 1.0 6V Flex");
    // não deve haver dois "Flex" seguidos em nenhuma parte visível
    expect(/\bflex\s+flex\b/i.test(v.fullName)).toBe(false);
  });

  it("colapsa 'Diesel Diesel' e 'Gasolina Gasolina'", () => {
    expect(
      adaptAdDetailToVehicle(makeAd({ title: "Ford Ranger XLT 3.2 Diesel Diesel" })).fullName
    ).toBe("Ford Ranger XLT 3.2 Diesel");
    expect(
      adaptAdDetailToVehicle(makeAd({ title: "VW Gol 1.6 Gasolina Gasolina" })).fullName
    ).toBe("VW Gol 1.6 Gasolina");
  });

  it("NÃO remove o combustível quando ele aparece uma única vez", () => {
    expect(adaptAdDetailToVehicle(makeAd({ title: "Chevrolet Onix 1.0 Flex" })).fullName).toBe(
      "Chevrolet Onix 1.0 Flex"
    );
    expect(adaptAdDetailToVehicle(makeAd({ title: "Ford Ranger 3.2 Diesel" })).fullName).toBe(
      "Ford Ranger 3.2 Diesel"
    );
  });

  it("deduplica também na versão (subtítulo)", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ title: "Fiat Argo", version: "1.0 Flex Flex", fuel_type: "Flex" })
    );
    expect(v.version).toBe("1.0 Flex");
  });
});

describe("adaptAdDetailToVehicle — minimização de dados do vendedor (LGPD)", () => {
  it("pessoa física expõe SOMENTE o primeiro nome", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({
        seller_type: "private",
        seller_kind: "private",
        dealership_id: null,
        account_type: "CPF",
        seller_name: "Rafael Souza",
      })
    );
    expect(v.seller.type).toBe("private");
    expect(v.seller.name).toBe("Rafael");
    expect(v.seller.name).not.toContain("Souza");
  });

  it("loja mantém o nome comercial completo", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({
        seller_type: "dealer",
        seller_kind: "dealer",
        seller_name: "AutoCar Veículos Premium",
      })
    );
    expect(v.seller.type).toBe("dealer");
    expect(v.seller.name).toBe("AutoCar Veículos Premium");
  });
});

describe("adaptAdDetailToVehicle — selos de procedência x opcionais", () => {
  it("extrai selos de procedência e os remove dos grupos de opcionais", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({
        vehicle_options: {
          drivability: ["unico_dono", "rodas_liga_leve"],
          safety: ["freios_abs"],
        },
      })
    );

    // selo de procedência extraído
    expect(v.trustBadges.map((b) => b.key)).toContain("unico_dono");
    // e NÃO aparece mais entre os opcionais (Dirigibilidade)
    const optionKeys = v.vehicleOptionGroups.flatMap((g) => g.items.map((i) => i.key));
    expect(optionKeys).toContain("rodas_liga_leve");
    expect(optionKeys).not.toContain("unico_dono");
  });

  it("sem opcionais → selos e grupos vazios", () => {
    const v = adaptAdDetailToVehicle(makeAd({ vehicle_options: null }));
    expect(v.trustBadges).toEqual([]);
    expect(v.vehicleOptionGroups).toEqual([]);
  });
});

/**
 * P2-E (Contract Lock) 2026-05-25 — garante que `adaptAdDetailToVehicle`
 * delega a formatação de preço/território ao contrato público
 * (`formatPricePublic` + `buildPublicTerritoryLabel`) e não regride para
 * as cópias locais antigas (que retornavam "R$ 0" e "São Paulo (SP)"
 * sintético).
 */
describe("adaptAdDetailToVehicle — contrato público P2-E", () => {
  it("nunca renderiza 'R$ 0' quando price=0", () => {
    const v = adaptAdDetailToVehicle(makeAd({ price: 0 }));
    expect(v.price).not.toMatch(/R\$\s?0(?![0-9])/);
    expect(v.price).toBe("Sob consulta");
  });

  it("nunca renderiza 'R$ 0' quando price=null", () => {
    const v = adaptAdDetailToVehicle(makeAd({ price: null }));
    expect(v.price).toBe("Sob consulta");
  });

  it("formata price válido como 'R$ 65.000'", () => {
    const v = adaptAdDetailToVehicle(makeAd({ price: 65000 }));
    expect(v.price).toMatch(/R\$\s?65\.000/);
  });

  it("city ausente vira 'Localização não informada' (sem default 'São Paulo (SP)')", () => {
    const v = adaptAdDetailToVehicle(makeAd({ city: null, state: null }));
    expect(v.city).toBe("Localização não informada");
    expect(v.city).not.toMatch(/São Paulo/i);
  });

  it("city + state preenchidos viram 'Cidade (UF)' via contrato", () => {
    const v = adaptAdDetailToVehicle(makeAd({ city: "Atibaia", state: "SP" }));
    expect(v.city).toBe("Atibaia (SP)");
  });

  it("state em minúsculo é normalizado para uppercase no display", () => {
    const v = adaptAdDetailToVehicle(makeAd({ city: "Curitiba", state: "pr" }));
    expect(v.city).toBe("Curitiba (PR)");
  });
});

