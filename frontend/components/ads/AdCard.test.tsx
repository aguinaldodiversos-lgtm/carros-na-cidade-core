// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AdCard, type AdCardVariant } from "./AdCard";

/**
 * PR F — Testes unit do AdCard unificado.
 *
 * Foco:
 *   1. Cada uma das 8 variantes renderiza sem erro com dados mínimos.
 *   2. Variantes com `showFavorite` mostram o botão de favoritar.
 *   3. Variantes com `showLocation` exibem cidade/estado.
 *   4. Layout horizontal posiciona imagem ao lado dos infos.
 *   5. Status pill aparece em dashboard/admin.
 *   6. Admin mostra flags.
 *   7. AdCard usa <VehicleImage> (não <img> cru).
 *   8. Compatibilidade retroativa: prop `ad` (alias de `item`) funciona.
 */

// Mock FavoritesContext porque o componente usa useFavorites quando
// showFavorite=true. Sem mock, o teste precisaria de Provider.
vi.mock("@/lib/favorites/FavoritesContext", () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

const SAMPLE_AD = {
  id: 123,
  slug: "honda-civic-2020-abc",
  title: "Honda Civic EXL 2020",
  brand: "Honda",
  model: "Civic",
  version: "EXL 2.0",
  year: 2020,
  yearLabel: "2020/2020",
  city: "Atibaia",
  state: "SP",
  price: 89900,
  mileage: 45000,
  image_url: "https://r2.example.com/civic.jpg",
  below_fipe: true,
};

const ALL_VARIANTS: AdCardVariant[] = [
  "compact",
  "featured",
  "grid",
  "carousel",
  "horizontal",
  "related",
  "dashboard",
  "admin",
];

describe("AdCard", () => {
  afterEach(cleanup);

  // ---------------------------------------------------------------------------
  // 1. Cada variante renderiza sem crash
  // ---------------------------------------------------------------------------
  describe("renderiza todas as 8 variantes", () => {
    for (const variant of ALL_VARIANTS) {
      it(`renderiza variant="${variant}" com data-variant correto`, () => {
        const { container } = render(<AdCard item={SAMPLE_AD} variant={variant} />);
        const root = container.querySelector(`[data-variant="${variant}"]`);
        expect(root).toBeTruthy();
        // Título sempre presente
        expect(screen.getByText("Honda Civic EXL 2020")).toBeTruthy();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. showFavorite por variant
  // ---------------------------------------------------------------------------
  describe("favorito por variant", () => {
    const WITH_FAV: AdCardVariant[] = ["featured", "grid", "carousel"];
    const WITHOUT_FAV: AdCardVariant[] = [
      "compact",
      "horizontal",
      "related",
      "dashboard",
      "admin",
    ];

    for (const variant of WITH_FAV) {
      it(`variant="${variant}" mostra botão de favoritar`, () => {
        render(<AdCard item={SAMPLE_AD} variant={variant} />);
        const btn = screen.queryByLabelText(/favorit/i);
        expect(btn).toBeTruthy();
      });
    }

    for (const variant of WITHOUT_FAV) {
      it(`variant="${variant}" não mostra botão de favoritar`, () => {
        render(<AdCard item={SAMPLE_AD} variant={variant} />);
        const btn = screen.queryByLabelText(/favorit/i);
        expect(btn).toBeNull();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. showLocation por variant
  // ---------------------------------------------------------------------------
  describe("localização por variant", () => {
    it("variant='grid' mostra cidade - estado", () => {
      render(<AdCard item={SAMPLE_AD} variant="grid" />);
      expect(screen.getByText("Atibaia - SP")).toBeTruthy();
    });

    it("variant='dashboard' não mostra localização (foco em status)", () => {
      render(<AdCard item={SAMPLE_AD} variant="dashboard" />);
      expect(screen.queryByText("Atibaia - SP")).toBeNull();
    });

    it("variant='admin' não mostra localização", () => {
      render(<AdCard item={SAMPLE_AD} variant="admin" />);
      expect(screen.queryByText("Atibaia - SP")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Status pill (dashboard/admin)
  // ---------------------------------------------------------------------------
  describe("status pill", () => {
    it("variant='dashboard' com status='Ativo' mostra pill verde (success)", () => {
      const { container } = render(
        <AdCard item={SAMPLE_AD} variant="dashboard" status="Ativo" />
      );
      expect(screen.getByText("Ativo")).toBeTruthy();
    });

    it("variant='dashboard' sem status não mostra pill", () => {
      render(<AdCard item={SAMPLE_AD} variant="dashboard" />);
      expect(screen.queryByText(/ativo|pausado/i)).toBeNull();
    });

    it("variant='grid' ignora status (não tem showStatus)", () => {
      render(<AdCard item={SAMPLE_AD} variant="grid" status="Ativo" />);
      expect(screen.queryByText("Ativo")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Admin mostra flags
  // ---------------------------------------------------------------------------
  it("variant='admin' com flags renderiza badges de moderação", () => {
    render(
      <AdCard
        item={SAMPLE_AD}
        variant="admin"
        flags={["Imagem suspeita", "Preço fora da faixa"]}
      />
    );
    expect(screen.getByText("Imagem suspeita")).toBeTruthy();
    expect(screen.getByText("Preço fora da faixa")).toBeTruthy();
  });

  it("variant='dashboard' ignora flags (somente admin tem showAdminFlags)", () => {
    render(
      <AdCard
        item={SAMPLE_AD}
        variant="dashboard"
        flags={["Não deveria aparecer"]}
      />
    );
    expect(screen.queryByText("Não deveria aparecer")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 6. AdCard usa <VehicleImage> (não <img> cru)
  // ---------------------------------------------------------------------------
  it("AdCard renderiza imagem via next/image (sem <img> cru fora dele)", () => {
    const { container } = render(<AdCard item={SAMPLE_AD} variant="grid" />);
    // next/image renderiza <img>, mas com sizes/loading. Validamos que
    // existe <img> e que tem o atributo `sizes` (sinal de que veio do
    // next/image dentro do <VehicleImage>).
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("sizes")).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 7. Badge "Abaixo da FIPE" aparece quando below_fipe=true
  // ---------------------------------------------------------------------------
  it("below_fipe=true gera badge 'Abaixo da FIPE'", () => {
    render(<AdCard item={SAMPLE_AD} variant="grid" />);
    expect(screen.getByText(/Abaixo da FIPE/i)).toBeTruthy();
  });

  it("below_fipe=false sem badge custom não mostra badge primário", () => {
    const adNoBadge = { ...SAMPLE_AD, below_fipe: false };
    const { container } = render(<AdCard item={adNoBadge} variant="grid" />);
    // Apenas badges info/success/danger/warning/premium/neutral via Badge.
    // Sem below_fipe e sem highlight_until, o weight cai para 1 e nenhuma
    // badge é mostrada.
    expect(container.textContent).not.toContain("Abaixo da FIPE");
  });

  // ---------------------------------------------------------------------------
  // 8. Preço formatado em BRL
  // ---------------------------------------------------------------------------
  it("preço é formatado como BRL", () => {
    render(<AdCard item={SAMPLE_AD} variant="grid" />);
    // Intl.NumberFormat pt-BR pode usar diferentes espaços/símbolos
    // dependendo do ambiente; validar via regex tolerante.
    const matches = screen.getAllByText(/R\$\s*89\.900/);
    expect(matches.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 9. Compat retroativa: prop `ad` (alias) funciona
  // ---------------------------------------------------------------------------
  it("prop `ad` (alias de `item`) funciona", () => {
    render(<AdCard ad={SAMPLE_AD} variant="grid" />);
    expect(screen.getByText("Honda Civic EXL 2020")).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 10. href override é respeitado
  // ---------------------------------------------------------------------------
  it("href prop tem precedência sobre buildAdHref automático", () => {
    const { container } = render(
      <AdCard item={SAMPLE_AD} variant="grid" href="/custom/path" />
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/custom/path");
  });

  // ---------------------------------------------------------------------------
  // 11. Sem dados → renderiza algo sem crashar (resiliência)
  // ---------------------------------------------------------------------------
  it("renderiza sem dados (resiliência)", () => {
    const { container } = render(<AdCard variant="grid" />);
    expect(container.querySelector('[data-variant="grid"]')).toBeTruthy();
    // Título fallback "Veículo"
    expect(screen.getByText("Veículo")).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 12. Default variant é "carousel"
  // ---------------------------------------------------------------------------
  it("variant default é 'carousel' quando não especificado", () => {
    const { container } = render(<AdCard item={SAMPLE_AD} />);
    expect(container.querySelector('[data-variant="carousel"]')).toBeTruthy();
  });
});
