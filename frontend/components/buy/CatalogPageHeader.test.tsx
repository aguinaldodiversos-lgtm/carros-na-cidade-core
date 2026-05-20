// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/carros-em/atibaia-sp",
}));

import { CatalogPageHeader } from "./CatalogPageHeader";
import type { AdsSearchFilters } from "@/lib/search/ads-search";

const city = {
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
  label: "Atibaia · SP",
} as const;

function renderHeader(
  filters: AdsSearchFilters,
  onPatch: (patch: Partial<AdsSearchFilters>) => void,
  extra: { regionalEnabled?: boolean } = {}
) {
  return render(
    <CatalogPageHeader
      city={city}
      filters={filters}
      totalResults={42}
      onPatch={onPatch}
      variant="cidade"
      stateUf="SP"
      regionalEnabled={extra.regionalEnabled ?? false}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CatalogPageHeader — chips de filtros (briefing 2026-05-20)", () => {
  it("renderiza os 8 chips alinhados ao briefing", () => {
    renderHeader({}, vi.fn());
    expect(screen.getByRole("button", { name: "Até R$ 50 mil" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SUV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Automático" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abaixo da FIPE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loja" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Particular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Oportunidade" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Destaque" })).toBeTruthy();
  });

  it("não exibe chips de plano comercial (Lojista Pro / Start / Grátis / Loja verificada)", () => {
    renderHeader({}, vi.fn());
    expect(screen.queryByRole("button", { name: /lojista pro/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /lojista start/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^grátis$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /verificada/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /premium/i })).toBeNull();
  });

  it("clique em 'Loja' aplica seller_kind='dealer'", () => {
    const onPatch = vi.fn();
    renderHeader({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Loja" }));
    expect(onPatch).toHaveBeenCalledWith({ seller_kind: "dealer", page: 1 });
  });

  it("clique em 'Particular' aplica seller_kind='private'", () => {
    const onPatch = vi.fn();
    renderHeader({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Particular" }));
    expect(onPatch).toHaveBeenCalledWith({ seller_kind: "private", page: 1 });
  });

  it("clique em 'Oportunidade' aplica opportunity=true", () => {
    const onPatch = vi.fn();
    renderHeader({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Oportunidade" }));
    expect(onPatch).toHaveBeenCalledWith({ opportunity: true, page: 1 });
  });

  it("clique em 'Destaque' aplica priority_tier=4", () => {
    const onPatch = vi.fn();
    renderHeader({}, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Destaque" }));
    expect(onPatch).toHaveBeenCalledWith({ priority_tier: 4, page: 1 });
  });

  it("clique em 'Loja' já ativo remove o filtro (toggle)", () => {
    const onPatch = vi.fn();
    renderHeader({ seller_kind: "dealer" }, onPatch);
    fireEvent.click(screen.getByRole("button", { name: "Loja" }));
    expect(onPatch).toHaveBeenCalledWith({ seller_kind: undefined, page: 1 });
  });
});

describe("CatalogPageHeader — CTA territorial (variant cidade)", () => {
  it("não renderiza o CTA regional quando regionalEnabled=false", () => {
    renderHeader({}, vi.fn(), { regionalEnabled: false });
    expect(screen.queryByTestId("city-region-cta")).toBeNull();
  });

  it("renderiza o CTA 'Veículos na região de [cidade]' quando regionalEnabled=true", () => {
    renderHeader({}, vi.fn(), { regionalEnabled: true });
    const cta = screen.getByTestId("city-region-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/região de Atibaia/i);
    expect(cta.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("CTA 'Ampliar para [estado]' permanece visível independente da flag regional", () => {
    renderHeader({}, vi.fn(), { regionalEnabled: true });
    expect(screen.getByText(/ampliar para são paulo/i)).toBeTruthy();
  });
});
