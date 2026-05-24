// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/carros-em/atibaia-sp",
}));

vi.mock("@/hooks/useNearbyRegionRedirect", () => ({
  useNearbyRegionRedirect: () => ({
    state: { kind: "idle" },
    trigger: vi.fn(),
    reset: vi.fn(),
    resolvedLocation: null,
  }),
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
  extra: { regionalEnabled?: boolean; softFallbackMessage?: string } = {}
) {
  return render(
    <CatalogPageHeader
      city={city}
      filters={filters}
      totalResults={42}
      onPatch={vi.fn()}
      variant="cidade"
      stateUf="SP"
      regionalEnabled={extra.regionalEnabled ?? false}
      softFallbackMessage={extra.softFallbackMessage}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CatalogPageHeader — vitrine enxuta (briefing 2026-05-22)", () => {
  it("renderiza H1 'Carros usados em [cidade]' com a cidade em azul", () => {
    renderHeader({});
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Carros usados em Atibaia/i);
    const span = h1.querySelector("span.text-primary");
    expect(span?.textContent).toBe("Atibaia");
  });

  it("renderiza subtítulo curto 'Ofertas em [cidade] e região'", () => {
    renderHeader({});
    expect(screen.getByText(/Ofertas em Atibaia e região/i)).toBeTruthy();
  });

  it("NÃO renderiza chips de filtro rápido no topo (Até R$ 50 mil / SUV / Automático)", () => {
    renderHeader({});
    expect(screen.queryByRole("button", { name: "Até R$ 50 mil" })).toBeNull();
    expect(screen.queryByRole("button", { name: "SUV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Automático" })).toBeNull();
  });

  it("NÃO renderiza chips Loja/Particular/Oportunidade/Destaque/Abaixo da FIPE no topo", () => {
    // Estes chips agora vivem só na sidebar (Vendedor + Ofertas).
    renderHeader({});
    expect(screen.queryByRole("button", { name: "Loja" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Particular" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Oportunidade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Destaque" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abaixo da FIPE" })).toBeNull();
  });

  it("NÃO renderiza alerta amarelo de fallback territorial", () => {
    renderHeader(
      {},
      { softFallbackMessage: "Mostrando ofertas próximas em Bragança Paulista (SP)." }
    );
    // A frase de fallback aparece como texto cinza discreto via data-testid,
    // NÃO como banner amarelo com bg-cnc-warning.
    const node = screen.getByTestId("catalog-soft-fallback");
    expect(node).toBeTruthy();
    expect(node.className).not.toMatch(/bg-cnc-warning/);
    expect(node.className).toMatch(/text-cnc-muted/);
  });

  it("NÃO renderiza CTA pill 'Ampliar para [estado]' no topo", () => {
    // Briefing veta CTA de Estado no topo da Cidade.
    renderHeader({}, { regionalEnabled: true });
    expect(screen.queryByTestId("city-state-cta")).toBeNull();
    expect(screen.queryByTestId("city-region-cta")).toBeNull();
    expect(screen.queryByTestId("regional-city-cta")).toBeNull();
    expect(screen.queryByTestId("regional-state-cta")).toBeNull();
  });

  it("NÃO renderiza Select de Estado no topo (movido para a sidebar Localização)", () => {
    renderHeader({});
    expect(screen.queryByRole("combobox", { name: /estado/i })).toBeNull();
  });

  it("NÃO renderiza linha 'Filtros aplicados' nem microcopy 'Sem filtros aplicados'", () => {
    renderHeader({ brand: "Toyota" });
    expect(screen.queryByText(/Filtros aplicados/i)).toBeNull();
    expect(screen.queryByText(/Sem filtros avançados aplicados/i)).toBeNull();
  });

  it("renderiza SearchBar com placeholder por variant", () => {
    renderHeader({});
    const search = screen.getByRole("searchbox");
    expect(search.getAttribute("placeholder")).toMatch(/cidade/i);
  });

  it("desktop renderiza pill 'Atibaia, SP' + NearbyRegionButton no top-right", () => {
    renderHeader({}, { regionalEnabled: true });
    const pill = screen.getByTestId("catalog-city-pill");
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/Atibaia, SP/i);
  });

  it("variant 'cidade' renderiza link direto 'Ver carros na Região' (sem geo)", () => {
    // Briefing 2026-05-23: na Cidade o CTA territorial é link direto
    // para a Regional do slug atual — geo é redundante porque o slug
    // já é conhecido.
    renderHeader({}, { regionalEnabled: true });
    const link = screen.getByTestId("catalog-city-to-region-link");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(link.textContent).toMatch(/Ver carros na Região/i);
    // Não deve renderizar botão geo na Cidade (substituído pelo link).
    expect(screen.queryByTestId("nearby-region-button")).toBeNull();
  });
});

describe("CatalogPageHeader — variant 'regional'", () => {
  function renderRegional() {
    return render(
      <CatalogPageHeader
        city={city}
        filters={{}}
        totalResults={42}
        onPatch={vi.fn()}
        variant="regional"
        stateUf="SP"
        regionalEnabled
      />
    );
  }

  it("H1 'Carros usados em [cidade] e região'", () => {
    renderRegional();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /Carros usados em Atibaia e região/i
    );
  });

  it("subtítulo 'Ofertas em [cidade] e cidades próximas'", () => {
    renderRegional();
    expect(screen.getByText(/Ofertas em Atibaia e cidades próximas/i)).toBeTruthy();
  });

  it("placeholder de busca menciona 'região'", () => {
    renderRegional();
    const search = screen.getByRole("searchbox");
    expect(search.getAttribute("placeholder")).toMatch(/região/i);
  });

  it("breadcrumb inclui UF + cidade + 'Região'", () => {
    renderRegional();
    expect(screen.getByRole("link", { name: "SP" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Atibaia" })).toBeTruthy();
    expect(screen.getByText("Região")).toBeTruthy();
  });

  it("não renderiza CTAs pills de cidade ou de estado no topo", () => {
    renderRegional();
    expect(screen.queryByTestId("regional-city-cta")).toBeNull();
    expect(screen.queryByTestId("regional-state-cta")).toBeNull();
  });

  it("renderiza 2 CTAs geo (briefing 2026-05-23): 'Ver carros em minha região' + 'Ver carros da cidade'", () => {
    renderRegional();
    // Botão 1 (data-testid="nearby-region-regional-self-button")
    expect(screen.getByTestId("nearby-region-regional-self-button")).toBeTruthy();
    // Botão 2 (data-testid="nearby-region-regional-city-button")
    expect(screen.getByTestId("nearby-region-regional-city-button")).toBeTruthy();
    // Os 2 botões aparecem na seção: pelo label visível dentro do botão.
    expect(screen.getByRole("button", { name: /Ver carros em minha região/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver carros da cidade/i })).toBeTruthy();
  });
});

describe("CatalogPageHeader — variant 'estadual'", () => {
  function renderEstadual() {
    return render(
      <CatalogPageHeader
        city={{ slug: "estado-sp", name: "São Paulo", state: "SP", label: "São Paulo (SP)" }}
        filters={{}}
        totalResults={1234}
        onPatch={vi.fn()}
        variant="estadual"
        stateUf="SP"
      />
    );
  }

  it("H1 'Carros usados em [Estado]' (nome completo do estado em azul)", () => {
    renderEstadual();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /Carros usados em São Paulo/i
    );
  });

  it("subtítulo menciona 'cidades e regiões' + UF", () => {
    renderEstadual();
    expect(screen.getByText(/cidades e regiões de/i)).toBeTruthy();
  });

  it("placeholder 'Buscar marca, modelo ou cidade em [Estado]'", () => {
    renderEstadual();
    const search = screen.getByRole("searchbox");
    expect(search.getAttribute("placeholder")).toBe("Buscar marca, modelo ou cidade em São Paulo");
  });

  it("NÃO renderiza Select de Estado no topo (movido para sidebar Localização)", () => {
    renderEstadual();
    expect(screen.queryByRole("combobox", { name: /estado/i })).toBeNull();
  });
});
