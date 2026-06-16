import { describe, expect, it } from "vitest";

import { inferPageEvent } from "@/lib/analytics/track";

describe("inferPageEvent — mapeia rota → tipo de evento (Fase 4.4)", () => {
  it("home e comprar → page_view", () => {
    expect(inferPageEvent("/")?.event_type).toBe("page_view");
    expect(inferPageEvent("/comprar")?.event_type).toBe("page_view");
  });

  it("cidade → city_page_view com city_slug", () => {
    const e = inferPageEvent("/carros-em/sao-paulo-sp");
    expect(e?.event_type).toBe("city_page_view");
    expect(e?.city_slug).toBe("sao-paulo-sp");
  });

  it("região → region_page_view com region_slug", () => {
    const e = inferPageEvent("/carros-usados/regiao/atibaia-sp");
    expect(e?.event_type).toBe("region_page_view");
    expect(e?.region_slug).toBe("atibaia-sp");
  });

  it("abaixo da FIPE → below_fipe_page_view", () => {
    const e = inferPageEvent("/carros-baratos-em/campinas-sp");
    expect(e?.event_type).toBe("below_fipe_page_view");
    expect(e?.city_slug).toBe("campinas-sp");
  });

  it("loja → seller_store_view", () => {
    const e = inferPageEvent("/lojas/auto-center-x");
    expect(e?.event_type).toBe("seller_store_view");
    expect(e?.entity_id).toBe("auto-center-x");
  });

  it("veículo e blog → null (têm tracker dedicado com id)", () => {
    expect(inferPageEvent("/veiculo/fiat-uno-2015")).toBe(null);
    expect(inferPageEvent("/blog")).toBe(null);
    expect(inferPageEvent("/blog/10-melhores-rotas-de-carro")).toBe(null);
  });

  it("áreas privadas → null (não rastreia /admin /painel /api)", () => {
    expect(inferPageEvent("/admin/analytics")).toBe(null);
    expect(inferPageEvent("/painel/anuncios")).toBe(null);
    expect(inferPageEvent("/api/x")).toBe(null);
  });

  it("ignora querystring e barra final", () => {
    expect(inferPageEvent("/carros-em/sao-paulo-sp/?utm_source=x")?.event_type).toBe(
      "city_page_view"
    );
  });
});
