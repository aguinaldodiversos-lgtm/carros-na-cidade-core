// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { HomeShortcuts } from "./HomeShortcuts";

const expectedActions = [
  ["Comprar", "/comprar"],
  ["Vender", "/anunciar"],
  ["FIPE", "/tabela-fipe"],
  ["Ofertas", "/comprar?below_fipe=true"],
  ["Planos", "/planos"],
  ["Simulador", "/simulador-financiamento"],
] as const;

afterEach(() => cleanup());

describe("HomeShortcuts — seis atalhos rápidos", () => {
  it("exibe os seis atalhos e preserva os links já existentes", () => {
    render(<HomeShortcuts />);
    const nav = screen.getByRole("navigation", { name: "Atalhos rápidos" });
    const links = within(nav).getAllByRole("link");

    expect(links).toHaveLength(6);
    expect(links.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual(
      expectedActions.map(([label, href]) => [label, href])
    );
  });

  it("usa calculadora branca no círculo azul do Simulador, com tamanho igual aos demais", () => {
    render(<HomeShortcuts />);
    const nav = screen.getByRole("navigation", { name: "Atalhos rápidos" });
    const simulator = within(nav).getByRole("link", { name: "Simulador" });
    const circle = simulator.querySelector("div.rounded-full");

    expect(simulator.textContent?.trim()).toBe("Simulador");
    expect(circle).not.toBeNull();
    expect(circle).toHaveClass(
      "h-14",
      "w-14",
      "sm:h-16",
      "sm:w-16",
      "bg-blue-600",
      "text-white",
      "hover:bg-blue-700",
      "active:scale-95"
    );
    const calculator = circle?.querySelector("svg");
    expect(calculator).not.toBeNull();
    expect(calculator).toHaveClass("h-6", "w-6", "sm:h-7", "sm:w-7");
    expect(calculator).toHaveAttribute("aria-hidden", "true");
  });

  it("mantém uma linha e rolagem no mobile, com distribuição em seis colunas no desktop", () => {
    render(<HomeShortcuts />);
    const nav = screen.getByRole("navigation", { name: "Atalhos rápidos" });
    const row = nav.querySelector("ul");

    expect(row).toHaveClass("flex", "overflow-x-auto", "sm:overflow-visible", "sm:gap-3");
    for (const item of row?.querySelectorAll("li") ?? []) {
      expect(item).toHaveClass("shrink-0", "sm:flex-1");
    }
  });
});
