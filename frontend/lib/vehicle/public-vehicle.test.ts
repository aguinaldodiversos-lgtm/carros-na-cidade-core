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
    const v = adaptAdDetailToVehicle(
      makeAd({ version: "1.0 Mec.", transmission: "automatico" })
    );
    expect(v.transmission).toBe("Manual");
    expect(v.optionalItems).toContain("Câmbio Manual");
  });

  it("respeita 'Aut.' na versão quando o backend manda 'manual' por engano", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ version: "2.0 16V Aut.", transmission: "manual" })
    );
    expect(v.transmission).toBe("Automático");
  });

  it("usa modelo 'ONIX HATCH' como fonte para carroceria, não 'sedan'", () => {
    const v = adaptAdDetailToVehicle(makeAd({ model: "ONIX HATCH", body_type: "sedan" }));
    expect(v.bodyType).toBe("Hatch");
    expect(v.optionalItems).toContain("Carroceria Hatch");
    expect(v.optionalItems).not.toContain("Carroceria sedan");
  });

  it("identifica loja via seller_type=dealer mesmo sem dealership_name", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ seller_type: "dealer", dealership_name: null, plan: "free" })
    );
    expect(v.seller.type).toBe("dealer");
  });

  it("identifica loja via dealership_name quando seller_type vem vazio", () => {
    const v = adaptAdDetailToVehicle(
      makeAd({ seller_type: null, dealership_name: "AutoCar Veículos" })
    );
    expect(v.seller.type).toBe("dealer");
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
