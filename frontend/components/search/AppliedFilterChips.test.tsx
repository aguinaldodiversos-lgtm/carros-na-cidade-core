// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppliedFilterChips } from "./AppliedFilterChips";
import type { AdsSearchFilters } from "../../lib/search/ads-search";

describe("AppliedFilterChips", () => {
  afterEach(cleanup);
  const noop = vi.fn();

  it("renders nothing when no filters are active", () => {
    const { container } = render(
      <AppliedFilterChips filters={{}} onRemove={noop} onClearAll={noop} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders brand chip", () => {
    render(<AppliedFilterChips filters={{ brand: "Fiat" }} onRemove={noop} onClearAll={noop} />);
    expect(screen.getByText(/Marca: Fiat/)).toBeDefined();
  });

  it("renders multiple chips for complex filters", () => {
    const filters: AdsSearchFilters = {
      brand: "VW",
      model: "Gol",
      fuel_type: "Flex",
      below_fipe: true,
    };
    render(<AppliedFilterChips filters={filters} onRemove={noop} onClearAll={noop} />);
    expect(screen.getByText(/Marca: VW/)).toBeDefined();
    expect(screen.getByText(/Modelo: Gol/)).toBeDefined();
    expect(screen.getByText(/Combustível: Flex/)).toBeDefined();
    expect(screen.getByText("Abaixo da FIPE ×")).toBeDefined();
  });

  it("calls onRemove with correct patch when removing brand", () => {
    const onRemove = vi.fn();
    render(
      <AppliedFilterChips
        filters={{ brand: "Fiat", model: "Uno" }}
        onRemove={onRemove}
        onClearAll={noop}
      />
    );

    fireEvent.click(screen.getByText(/Marca: Fiat/));
    expect(onRemove).toHaveBeenCalledWith({
      brand: undefined,
      model: undefined,
      page: 1,
    });
  });

  it("calls onRemove with correct patch when removing price range", () => {
    const onRemove = vi.fn();
    render(
      <AppliedFilterChips
        filters={{ min_price: 10000, max_price: 50000 }}
        onRemove={onRemove}
        onClearAll={noop}
      />
    );

    const priceChip = screen.getByText(/Preço:/);
    fireEvent.click(priceChip);
    expect(onRemove).toHaveBeenCalledWith({
      min_price: undefined,
      max_price: undefined,
      page: 1,
    });
  });

  it("renders locked chips as spans (not clickable)", () => {
    render(
      <AppliedFilterChips
        filters={{ brand: "Fiat", city: "Campinas" }}
        onRemove={noop}
        onClearAll={noop}
        lockedKeys={["brand"]}
      />
    );

    const brandChip = screen.getByText("Marca: Fiat");
    expect(brandChip.tagName).toBe("SPAN");

    const cityChip = screen.getByText(/Cidade: Campinas/);
    expect(cityChip.tagName).toBe("BUTTON");
  });

  it("shows clear all button when removable chips exist", () => {
    render(<AppliedFilterChips filters={{ brand: "Fiat" }} onRemove={noop} onClearAll={noop} />);
    expect(screen.getByText("Limpar filtros")).toBeDefined();
  });

  it("calls onClearAll when clear button clicked", () => {
    const onClearAll = vi.fn();
    render(
      <AppliedFilterChips filters={{ brand: "Fiat" }} onRemove={noop} onClearAll={onClearAll} />
    );

    fireEvent.click(screen.getByText("Limpar filtros"));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it("hides clear all when all chips are locked", () => {
    render(
      <AppliedFilterChips
        filters={{ brand: "Fiat" }}
        onRemove={noop}
        onClearAll={noop}
        lockedKeys={["brand"]}
      />
    );
    expect(screen.queryByText("Limpar filtros")).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────
  // Filtros canônicos da Fase 3 (seller_kind / opportunity /
  // priority_tier). Faltavam aqui pelo mesmo motivo que faltavam no
  // hasFilters, no countQuery e na whitelist da cache key.
  // ──────────────────────────────────────────────────────────────────

  it("renderiza chip de seller_kind com o rótulo da sidebar", () => {
    render(
      <AppliedFilterChips filters={{ seller_kind: "private" }} onRemove={noop} onClearAll={noop} />
    );
    expect(screen.getByText("Particulares ×")).toBeDefined();

    cleanup();
    render(
      <AppliedFilterChips filters={{ seller_kind: "dealer" }} onRemove={noop} onClearAll={noop} />
    );
    expect(screen.getByText("Lojas ×")).toBeDefined();
  });

  it("remove seller_kind com patch correto", () => {
    const onRemove = vi.fn();
    render(
      <AppliedFilterChips
        filters={{ seller_kind: "private" }}
        onRemove={onRemove}
        onClearAll={noop}
      />
    );

    fireEvent.click(screen.getByText("Particulares ×"));
    expect(onRemove).toHaveBeenCalledWith({ seller_kind: undefined, page: 1 });
  });

  it("renderiza e remove chip de opportunity", () => {
    const onRemove = vi.fn();
    render(
      <AppliedFilterChips filters={{ opportunity: true }} onRemove={onRemove} onClearAll={noop} />
    );

    fireEvent.click(screen.getByText("Oportunidades ×"));
    expect(onRemove).toHaveBeenCalledWith({ opportunity: undefined, page: 1 });
  });

  it("renderiza priority_tier pelo nome da camada, não pelo número", () => {
    const tiers: Array<[1 | 2 | 3 | 4, string]> = [
      [4, "Destaques ×"],
      [3, "Lojista Pro ×"],
      [2, "Lojista Start ×"],
      [1, "Anúncios grátis ×"],
    ];

    for (const [tier, label] of tiers) {
      render(
        <AppliedFilterChips filters={{ priority_tier: tier }} onRemove={noop} onClearAll={noop} />
      );
      expect(screen.getByText(label)).toBeDefined();
      cleanup();
    }
  });

  it("remove priority_tier com patch correto", () => {
    const onRemove = vi.fn();
    render(
      <AppliedFilterChips filters={{ priority_tier: 4 }} onRemove={onRemove} onClearAll={noop} />
    );

    fireEvent.click(screen.getByText("Destaques ×"));
    expect(onRemove).toHaveBeenCalledWith({ priority_tier: undefined, page: 1 });
  });

  it("respeita lockedKeys nos filtros novos (chip vira span)", () => {
    render(
      <AppliedFilterChips
        filters={{ seller_kind: "dealer", opportunity: true }}
        onRemove={noop}
        onClearAll={noop}
        lockedKeys={["seller_kind"]}
      />
    );

    expect(screen.getByText("Lojas").tagName).toBe("SPAN");
    expect(screen.getByText("Oportunidades ×").tagName).toBe("BUTTON");
  });

  it("className extra não quebra o container e não vaza quando vazio", () => {
    const { container } = render(
      <AppliedFilterChips
        filters={{ seller_kind: "dealer" }}
        onRemove={noop}
        onClearAll={noop}
        className="pb-1 pt-1"
      />
    );
    expect(container.firstElementChild?.className).toContain("pb-1");
    expect(container.firstElementChild?.className).toContain("flex-wrap");

    cleanup();
    // Sem filtro → null, mesmo com className (não gera div de espaço fantasma)
    const empty = render(
      <AppliedFilterChips filters={{}} onRemove={noop} onClearAll={noop} className="pb-1 pt-1" />
    );
    expect(empty.container.innerHTML).toBe("");
  });
});
