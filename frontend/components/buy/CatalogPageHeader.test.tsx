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

function renderRegionalHeader(
  filters: AdsSearchFilters,
  onPatch: (patch: Partial<AdsSearchFilters>) => void
) {
  return render(
    <CatalogPageHeader
      city={city}
      filters={filters}
      totalResults={42}
      onPatch={onPatch}
      variant="regional"
      stateUf="SP"
      regionalEnabled
    />
  );
}

describe("CatalogPageHeader — variant 'regional' (briefing 2026-05-20)", () => {
  it("renderiza H1 'Carros usados em [cidade] e região'", () => {
    renderRegionalHeader({}, vi.fn());
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Carros usados em Atibaia e região/i);
  });

  it("subtítulo menciona '[cidade]' e 'cidades próximas'", () => {
    renderRegionalHeader({}, vi.fn());
    expect(screen.getByText(/cidades próximas/i)).toBeTruthy();
    // O nome da cidade aparece no subtítulo (verificação via DOM strong tag).
    const subtitleStrong = document.querySelectorAll("strong");
    const cityFound = Array.from(subtitleStrong).some((el) =>
      el.textContent?.includes("Atibaia")
    );
    expect(cityFound).toBe(true);
  });

  it("CTA primário 'Ver apenas carros em [cidade]' aponta para /carros-em/[slug]", () => {
    renderRegionalHeader({}, vi.fn());
    const cta = screen.getByTestId("regional-city-cta");
    expect(cta).toBeTruthy();
    expect(cta.textContent).toMatch(/Ver apenas carros em Atibaia/i);
    expect(cta.getAttribute("href")).toBe("/carros-em/atibaia-sp");
  });

  it("CTA secundário 'Ampliar para [estado]' aponta para /comprar/estado/sp", () => {
    renderRegionalHeader({}, vi.fn());
    const cta = screen.getByTestId("regional-state-cta");
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/comprar/estado/sp");
    expect(cta.textContent).toMatch(/ampliar/i);
  });

  it("placeholder da busca menciona 'região'", () => {
    renderRegionalHeader({}, vi.fn());
    const search = screen.getByRole("searchbox");
    expect(search.getAttribute("placeholder")).toMatch(/região/i);
  });

  it("breadcrumb inclui UF + cidade + 'Região'", () => {
    renderRegionalHeader({}, vi.fn());
    // CatalogBreadcrumb renderiza nav com itens em sequência. Verificamos
    // que os 4 níveis territoriais aparecem.
    expect(screen.getByRole("link", { name: "SP" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Atibaia" })).toBeTruthy();
    expect(screen.getByText("Região")).toBeTruthy();
  });

  it("renderiza os 8 chips canônicos (mesmo padrão da Cidade)", () => {
    renderRegionalHeader({}, vi.fn());
    expect(screen.getByRole("button", { name: "Até R$ 50 mil" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loja" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Particular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Oportunidade" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Destaque" })).toBeTruthy();
  });

  it("não exibe Select de Estado (UF é fixa pela região)", () => {
    renderRegionalHeader({}, vi.fn());
    expect(screen.queryByRole("combobox", { name: /estado/i })).toBeNull();
  });

  it("não exibe selos de plano comercial nos chips (Pro/Start/Grátis/verificada/premium)", () => {
    renderRegionalHeader({}, vi.fn());
    expect(screen.queryByRole("button", { name: /lojista pro/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /lojista start/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /verificada/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /premium/i })).toBeNull();
  });
});
