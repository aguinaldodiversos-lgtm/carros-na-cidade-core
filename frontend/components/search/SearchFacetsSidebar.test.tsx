// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SearchFacetsSidebar } from "./SearchFacetsSidebar";
import type { AdsFacetsResponse, AdsSearchFilters } from "../../lib/search/ads-search";

const baseFacets: AdsFacetsResponse["facets"] = {
  brands: [
    { brand: "Fiat", total: 120 },
    { brand: "VW", total: 95 },
    { brand: "Chevrolet", total: 80 },
    { brand: "Toyota", total: 70 },
    { brand: "Honda", total: 60 },
    { brand: "Hyundai", total: 50 },
  ],
  models: [
    { brand: "Fiat", model: "Uno", total: 40 },
    { brand: "Fiat", model: "Argo", total: 30 },
    { brand: "VW", model: "Gol", total: 35 },
  ],
  fuelTypes: [
    { fuel_type: "Flex", total: 200 },
    { fuel_type: "Diesel", total: 50 },
  ],
  bodyTypes: [
    { body_type: "Hatch", total: 100 },
    { body_type: "Sedan", total: 80 },
  ],
};

describe("SearchFacetsSidebar", () => {
  afterEach(cleanup);
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders brand select with facet options", () => {
    render(
      <SearchFacetsSidebar facets={baseFacets} filters={{}} onChange={onChange} />
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it("calls onChange with brand when brand is selected", () => {
    render(
      <SearchFacetsSidebar facets={baseFacets} filters={{}} onChange={onChange} />
    );

    const selects = screen.getAllByRole("combobox");
    const brandSelect = selects[0];
    fireEvent.change(brandSelect, { target: { value: "Fiat" } });

    expect(onChange).toHaveBeenCalledWith({
      brand: "Fiat",
      model: undefined,
      page: 1,
    });
  });

  it("calls onChange with sort when sort pill is clicked", () => {
    render(
      <SearchFacetsSidebar facets={baseFacets} filters={{}} onChange={onChange} />
    );

    fireEvent.click(screen.getByText("Mais barato"));
    expect(onChange).toHaveBeenCalledWith({ sort: "price_asc", page: 1 });
  });

  it("calls onChange when popular brand is clicked", () => {
    render(
      <SearchFacetsSidebar facets={baseFacets} filters={{}} onChange={onChange} />
    );

    const fiatElements = screen.getAllByText("Fiat");
    const fiatButton = fiatElements.find(
      (el) => el.closest("button") && !el.closest("select")
    );
    expect(fiatButton).toBeDefined();
    fireEvent.click(fiatButton!.closest("button")!);
    expect(onChange).toHaveBeenCalledWith({
      brand: "Fiat",
      model: undefined,
      page: 1,
    });
  });

  it("syncs local state when filters prop changes", () => {
    const { rerender } = render(
      <SearchFacetsSidebar facets={baseFacets} filters={{}} onChange={onChange} />
    );

    rerender(
      <SearchFacetsSidebar
        facets={baseFacets}
        filters={{ brand: "VW" }}
        onChange={onChange}
      />
    );

    const selects = screen.getAllByRole("combobox");
    expect((selects[0] as HTMLSelectElement).value).toBe("VW");
  });

  it("hides brand select when brand is locked", () => {
    const { container } = render(
      <SearchFacetsSidebar
        facets={baseFacets}
        filters={{ brand: "Fiat" }}
        onChange={onChange}
        lockedKeys={["brand"]}
      />
    );

    const selects = container.querySelectorAll("select");
    const brandOptions = Array.from(selects).filter((s) => {
      const opts = Array.from(s.options).map((o) => o.value);
      return opts.includes("Fiat") && opts.includes("VW");
    });
    expect(brandOptions.length).toBe(0);
  });

  it("renders with null facets without crashing", () => {
    render(
      <SearchFacetsSidebar facets={null} filters={{}} onChange={onChange} />
    );
    expect(screen.getAllByText("Filtros rápidos").length).toBeGreaterThan(0);
  });
});
