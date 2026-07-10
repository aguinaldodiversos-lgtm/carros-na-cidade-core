// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const triggerGeo = vi.fn();
vi.mock("@/hooks/useNearbyRegionRedirect", () => ({
  useNearbyRegionRedirect: () => ({
    state: { kind: "idle" },
    trigger: triggerGeo,
    reset: vi.fn(),
    resolvedLocation: null,
  }),
}));

import { FilterSidebar } from "./FilterSidebar";
import type { AdsSearchFilters } from "@/lib/search/ads-search";

const baseProps = {
  brandOptions: [{ label: "Todas", value: "" }],
  modelOptions: [{ label: "Todos", value: "" }],
  popularBrands: [],
  totalResults: 42,
  onClear: vi.fn(),
  city: { slug: "atibaia-sp", name: "Atibaia", state: "SP", label: "Atibaia · SP" } as const,
};

function renderSidebar(
  filters: AdsSearchFilters,
  onPatch: (patch: Partial<AdsSearchFilters>) => void
) {
  return render(<FilterSidebar filters={filters} onPatch={onPatch} {...baseProps} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FilterSidebar — chips de filtros canônicos (Fase 3)", () => {
  it("exibe os 5 chips públicos (Destaques, Oportunidades, Abaixo da FIPE, Lojas, Particulares)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.getByRole("button", { name: "Destaques" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Oportunidades" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abaixo da FIPE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lojas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Particulares" })).toBeTruthy();
  });

  it("NÃO exibe chips de plano comercial interno (Lojista Pro / Lojista Start / Grátis)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByRole("button", { name: /lojista pro/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /lojista start/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^grátis$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^plano /i })).toBeNull();
  });

  it("clique em 'Destaques' chama onPatch com priority_tier=4 e page=1", () => {
    const onPatch = vi.fn();
    renderSidebar({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Destaques" }));
    expect(onPatch).toHaveBeenCalledWith({ priority_tier: 4, page: 1 });
  });

  it("clique em 'Destaques' já ativo desliga (toggle): chama onPatch com priority_tier=undefined", () => {
    const onPatch = vi.fn();
    renderSidebar({ priority_tier: 4 }, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Destaques" }));
    expect(onPatch).toHaveBeenCalledWith({ priority_tier: undefined, page: 1 });
  });

  it("clique em 'Oportunidades' chama onPatch com opportunity=true e page=1", () => {
    const onPatch = vi.fn();
    renderSidebar({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Oportunidades" }));
    expect(onPatch).toHaveBeenCalledWith({ opportunity: true, page: 1 });
  });

  it("clique em 'Oportunidades' ativo desliga", () => {
    const onPatch = vi.fn();
    renderSidebar({ opportunity: true }, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Oportunidades" }));
    expect(onPatch).toHaveBeenCalledWith({ opportunity: undefined, page: 1 });
  });

  it("clique em 'Abaixo da FIPE' chama onPatch com below_fipe=true e page=1", () => {
    const onPatch = vi.fn();
    renderSidebar({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Abaixo da FIPE" }));
    expect(onPatch).toHaveBeenCalledWith({ below_fipe: true, page: 1 });
  });

  it("clique em 'Lojas' chama onPatch com seller_kind='dealer'", () => {
    const onPatch = vi.fn();
    renderSidebar({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Lojas" }));
    expect(onPatch).toHaveBeenCalledWith({ seller_kind: "dealer", page: 1 });
  });

  it("clique em 'Particulares' chama onPatch com seller_kind='private'", () => {
    const onPatch = vi.fn();
    renderSidebar({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Particulares" }));
    expect(onPatch).toHaveBeenCalledWith({ seller_kind: "private", page: 1 });
  });

  it("Lojas e Particulares são mutuamente exclusivos via toggle do mesmo seller_kind", () => {
    // Estado 'dealer' ativo. Clique em Lojas desliga (undefined). Clique em
    // Particulares (a partir de undefined) liga 'private'. Cada clique
    // produz UMA mutação — o pareamento mutex emerge do estado, não do chip.
    const onPatch = vi.fn();
    const { rerender } = renderSidebar({ seller_kind: "dealer" }, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Lojas" }));
    expect(onPatch).toHaveBeenLastCalledWith({ seller_kind: undefined, page: 1 });

    rerender(<FilterSidebar filters={{}} onPatch={onPatch} {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Particulares" }));
    expect(onPatch).toHaveBeenLastCalledWith({ seller_kind: "private", page: 1 });
  });

  it("chip ativo tem aria-pressed=true; inativo tem aria-pressed=false", () => {
    renderSidebar({ priority_tier: 4, opportunity: true }, vi.fn());
    expect(screen.getByRole("button", { name: "Destaques" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "Oportunidades" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Abaixo da FIPE" }).getAttribute("aria-pressed")
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Lojas" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });
});

describe("FilterSidebar — seções do briefing 2026-05-22", () => {
  it("renderiza títulos de seções Ofertas / Vendedor / Localização", () => {
    renderSidebar({}, vi.fn());
    expect(screen.getByText(/^Ofertas$/i)).toBeTruthy();
    expect(screen.getByText(/^Vendedor$/i)).toBeTruthy();
    expect(screen.getByText(/^Localização$/i)).toBeTruthy();
  });

  it("seção Localização renderiza botão 'Ver carros perto de mim' que dispara hook geo", () => {
    triggerGeo.mockClear();
    renderSidebar({}, vi.fn());
    const geoBtn = screen.getByTestId("sidebar-nearby-region-button");
    expect(geoBtn).toBeTruthy();
    expect(geoBtn.textContent).toMatch(/Ver carros perto de mim/i);
    fireEvent.click(geoBtn);
    expect(triggerGeo).toHaveBeenCalledTimes(1);
  });

  it("seção Localização NÃO renderiza mais o atalho 'Região' (substituído por Distância)", () => {
    // Âncora regional (2026-07-05): a Região saiu do painel; distância a
    // substituiu. Nenhum link para a página de região aposentada.
    render(
      <FilterSidebar
        filters={{}}
        onPatch={vi.fn()}
        {...baseProps}
        radiusKm={40}
        onRadiusChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId("sidebar-region-link")).toBeNull();
    expect(screen.queryByText(/Região de/i)).toBeNull();
  });

  it("seção Localização renderiza o slider 'Distância (km)' (25/50/75/100, padrão 50)", () => {
    const onRadiusChange = vi.fn();
    render(
      <FilterSidebar
        filters={{}}
        onPatch={vi.fn()}
        {...baseProps}
        radiusKm={50}
        onRadiusChange={onRadiusChange}
      />
    );
    const slider = screen.getByTestId("sidebar-distance-slider");
    expect(slider).toBeTruthy();
    expect(slider.getAttribute("role")).toBe("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("50");
    expect(slider.getAttribute("aria-valuemin")).toBe("25");
    expect(slider.getAttribute("aria-valuemax")).toBe("100");
    // Presets 25/50/75/100 presentes e sincronizados.
    ["25 km", "50 km", "75 km", "100 km"].forEach((name) => {
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe(
        name === "50 km" ? "true" : "false"
      );
    });
    // Clicar num preset dispara onRadiusChange com o novo valor.
    fireEvent.click(screen.getByRole("button", { name: "75 km" }));
    expect(onRadiusChange).toHaveBeenCalledWith(75);
  });

  it("slider de Distância navega por teclado (setas) e comita o novo raio", () => {
    const onRadiusChange = vi.fn();
    render(
      <FilterSidebar
        filters={{}}
        onPatch={vi.fn()}
        {...baseProps}
        radiusKm={50}
        onRadiusChange={onRadiusChange}
      />
    );
    const slider = screen.getByTestId("sidebar-distance-slider");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onRadiusChange).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onRadiusChange).toHaveBeenLastCalledWith(100);
  });

  it("slider 'Distância (km)' NÃO aparece sem onRadiusChange (fora da página de cidade)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByTestId("sidebar-distance-slider")).toBeNull();
  });

  it("seção Localização renderiza atalho 'Apenas [cidade]' quando há cidade no contexto", () => {
    renderSidebar({}, vi.fn());
    const cityLink = screen.getByTestId("sidebar-city-link");
    expect(cityLink).toBeTruthy();
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
  });

  // Briefing P0 2026-05-24 removeu Opcionais/Cor/"Apenas com foto" do
  // sidebar público — backend não consome features[]/color/has_photo e
  // o hint "Em breve — backend irá incorporar X" expunha nome interno.
  it("NÃO renderiza seção Opcionais (filtro inerte removido P0 2026-05-24)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByText(/^Opcionais$/i)).toBeNull();
    expect(screen.queryByText(/Em breve.*incorporar/i)).toBeNull();
  });

  it("NÃO renderiza seção 'Apenas anúncios com foto' (filtro inerte removido P0 2026-05-24)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByText(/Apenas anúncios com foto/i)).toBeNull();
    expect(screen.queryByText(/Mostrar somente ofertas com fotos/i)).toBeNull();
  });

  it("NÃO renderiza seção Cor (filtro inerte removido P0 2026-05-24)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByText(/^Cor$/i)).toBeNull();
    expect(document.getElementById("fs-color")).toBeNull();
  });

  it("NÃO renderiza aside 'Quer vender seu carro?' (removido no briefing 2026-05-22)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByText(/Quer vender seu carro/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Anuncie agora/i })).toBeNull();
  });
});
