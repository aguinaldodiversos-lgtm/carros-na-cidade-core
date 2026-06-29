// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { HomeVehicleCard, type VehicleItem } from "./HomeVehicleCard";

/**
 * Regressão do adapter da home (bug do selo "Particular" em todo card).
 *
 * Antes, `toBaseAdData` descartava `seller_kind`, então `resolveSellerKind`
 * caía no default "private" e TODO card mostrava "PARTICULAR" — mesmo os de
 * loja. Estes testes travam o repasse do tipo de vendedor e a decisão de
 * NÃO exibir a pílula de loja na home (só o badge).
 */

vi.mock("@/lib/favorites/FavoritesContext", () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

const BASE: VehicleItem = {
  id: 1,
  slug: "honda-civic-2020-abc",
  title: "Honda Civic EXL 2020",
  brand: "Honda",
  model: "Civic",
  year: 2020,
  price: 89900,
  city: "Atibaia",
  state: "SP",
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

describe("HomeVehicleCard — selo de tipo de vendedor", () => {
  afterEach(cleanup);

  it("seller_kind='dealer' renderiza badge 'LOJA' (não 'PARTICULAR')", () => {
    render(<HomeVehicleCard item={{ ...BASE, seller_kind: "dealer" }} variant="highlight" />);
    expect(screen.getByText("LOJA")).toBeTruthy();
    expect(screen.queryByText("PARTICULAR")).toBeNull();
  });

  it("seller_kind='private' renderiza badge 'PARTICULAR'", () => {
    render(<HomeVehicleCard item={{ ...BASE, seller_kind: "private" }} variant="highlight" />);
    expect(screen.getByText("PARTICULAR")).toBeTruthy();
    expect(screen.queryByText("LOJA")).toBeNull();
  });

  it("sem sinal de vendedor cai em 'PARTICULAR' (default seguro)", () => {
    render(<HomeVehicleCard item={BASE} variant="highlight" />);
    expect(screen.getByText("PARTICULAR")).toBeTruthy();
  });

  it("account_type='CNPJ' (fallback) também vira 'LOJA'", () => {
    render(<HomeVehicleCard item={{ ...BASE, account_type: "CNPJ" }} variant="highlight" />);
    expect(screen.getByText("LOJA")).toBeTruthy();
  });

  it("loja com destaque + abaixo da FIPE emite os 3 selos (DESTAQUE, ABAIXO DA FIPE, LOJA)", () => {
    render(
      <HomeVehicleCard
        item={{ ...BASE, seller_kind: "dealer", below_fipe: true, highlight_until: FUTURE }}
        variant="highlight"
      />
    );
    expect(screen.getByText("DESTAQUE")).toBeTruthy();
    expect(screen.getByText("ABAIXO DA FIPE")).toBeTruthy();
    expect(screen.getByText("LOJA")).toBeTruthy();
  });

  it("NÃO renderiza a pílula de loja na home (showDealerPill=false), só o badge", () => {
    render(
      <HomeVehicleCard
        item={{ ...BASE, seller_kind: "dealer", dealership_id: 42 }}
        variant="highlight"
      />
    );
    // Badge presente...
    expect(screen.getByText("LOJA")).toBeTruthy();
    // ...mas a pílula laranja (DealerPill → "Loja parceira") NÃO.
    expect(screen.queryByText(/Loja parceira/i)).toBeNull();
  });
});
