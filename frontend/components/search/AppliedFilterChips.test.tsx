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
});
