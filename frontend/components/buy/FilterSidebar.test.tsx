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

  it("seção Localização renderiza atalho 'Região de [cidade]' quando há cidade no contexto", () => {
    renderSidebar({}, vi.fn());
    const regionLink = screen.getByTestId("sidebar-region-link");
    expect(regionLink).toBeTruthy();
    expect(regionLink.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("seção Localização renderiza atalho 'Apenas [cidade]' quando há cidade no contexto", () => {
    renderSidebar({}, vi.fn());
    const cityLink = screen.getByTestId("sidebar-city-link");
    expect(cityLink).toBeTruthy();
    expect(cityLink.getAttribute("href")).toBe("/carros-em/atibaia-sp");
  });

  it("renderiza seção Opcionais com hint 'Em breve' (UI presente, dispatch inerte)", () => {
    renderSidebar({}, vi.fn());
    const hint = screen.getAllByText(/Em breve/i);
    expect(hint.length).toBeGreaterThan(0);
  });

  it("renderiza seção 'Apenas anúncios com foto' (toggle visível)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.getByText(/Apenas anúncios com foto/i)).toBeTruthy();
    expect(screen.getByText(/Mostrar somente ofertas com fotos/i)).toBeTruthy();
  });

  it("renderiza seção Cor (não disabled — visível ao lado das demais)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.getByText(/^Cor$/i)).toBeTruthy();
    const colorSelect = document.getElementById("fs-color") as HTMLSelectElement | null;
    expect(colorSelect).toBeTruthy();
    // Não está com o atributo `disabled` aplicado (briefing pede destravar).
    expect(colorSelect?.disabled).toBe(false);
  });

  it("NÃO renderiza aside 'Quer vender seu carro?' (removido no briefing 2026-05-22)", () => {
    renderSidebar({}, vi.fn());
    expect(screen.queryByText(/Quer vender seu carro/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Anuncie agora/i })).toBeNull();
  });
});
