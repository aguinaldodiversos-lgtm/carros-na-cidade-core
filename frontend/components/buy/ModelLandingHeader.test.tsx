// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ModelLandingHeader } from "./ModelLandingHeader";
import {
  buildModelLandingBreadcrumbs,
  buildModelLandingCopy,
  type ModelLandingIdentity,
  type ModelLandingSummary,
} from "@/lib/buy/model-landing";

const identity: ModelLandingIdentity = {
  citySlug: "braganca-paulista-sp",
  cityName: "Bragança Paulista",
  cityState: "SP",
  brandSlug: "hyundai",
  brandName: "Hyundai",
  modelSlug: "hb20",
  modelName: "HB20",
};

const full: ModelLandingSummary = {
  total: 4,
  belowFipe: 2,
  minPrice: 45900,
  maxPrice: 67900,
  minYear: 2014,
  maxYear: 2025,
};

function renderHeader(summary: ModelLandingSummary | null, regional = false) {
  return render(
    <ModelLandingHeader
      copy={buildModelLandingCopy(identity)}
      breadcrumbs={buildModelLandingBreadcrumbs(identity)}
      summary={summary}
      regional={regional}
      cityName={identity.cityName}
    />
  );
}

afterEach(cleanup);

describe("ModelLandingHeader — topo compacto da landing", () => {
  it("um único h1, dinâmico", () => {
    renderHeader(full);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Hyundai HB20 em Bragança Paulista - SP");
  });

  it("breadcrumb Home › Carros em {cidade} › {Marca} › {Modelo}, com links reais", () => {
    renderHeader(full);
    const nav = screen.getByRole("navigation", { name: "Navegação" });
    expect(
      within(nav).getByRole("link", { name: "Carros em Bragança Paulista" }).getAttribute("href")
    ).toBe("/carros-em/braganca-paulista-sp");
    expect(within(nav).getByRole("link", { name: "Hyundai" }).getAttribute("href")).toBe(
      "/cidade/braganca-paulista-sp/marca/hyundai"
    );
    // O item corrente não é link.
    expect(within(nav).queryByRole("link", { name: "HB20" })).toBeNull();
  });

  it("indicadores derivados do estoque", () => {
    renderHeader(full);
    const stats = screen.getByRole("list", { name: "Resumo dos anúncios" });
    const text = stats.textContent?.replace(/\u00a0/g, " ");
    expect(text).toContain("4 anúncios");
    expect(text).toContain("2 abaixo da FIPE");
    expect(text).toContain("Faixa de preço: R$ 45.900 – R$ 67.900");
    expect(text).toContain("Anos: 2014 a 2025");
  });

  it("indicador sem dado confiável não aparece (0 abaixo da FIPE, faixa de página parcial)", () => {
    renderHeader({
      total: 60,
      belowFipe: 0,
      minPrice: null,
      maxPrice: null,
      minYear: null,
      maxYear: null,
    });
    const items = within(screen.getByRole("list", { name: "Resumo dos anúncios" })).getAllByRole(
      "listitem"
    );
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("60 anúncios");
  });

  it("sem estoque: só identificação — nada de descrição de oferta nem indicadores", () => {
    renderHeader(null);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Resumo dos anúncios" })).toBeNull();
    expect(screen.queryByText(/usados e seminovos à venda/)).toBeNull();
  });

  it("aviso regional discreto, sem termo técnico (raio, km, política)", () => {
    renderHeader(full, true);
    const notice = screen.getByTestId("model-landing-regional-notice");
    expect(notice.textContent).toBe(
      "Resultados em Bragança Paulista e cidades próximas dentro da região."
    );
    expect(notice.textContent).not.toMatch(/km|raio|REGIONAL|search_policy/i);
  });

  it("todo o conjunto local → sem aviso regional", () => {
    renderHeader(full, false);
    expect(screen.queryByTestId("model-landing-regional-notice")).toBeNull();
  });
});
