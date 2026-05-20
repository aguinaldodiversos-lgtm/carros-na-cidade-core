// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `server-only` é resolvido via alias para test/stubs/server-only.ts
// (ver vitest.config.ts).

import { AlsoInRegionBlock } from "./AlsoInRegionBlock";

afterEach(() => {
  cleanup();
});

describe("AlsoInRegionBlock", () => {
  it("renderiza CTA para a Página Regional com href canônico", () => {
    render(<AlsoInRegionBlock slug="atibaia-sp" cityName="Atibaia" />);
    const cta = screen.getByTestId("also-in-region-cta");
    expect(cta).toHaveAttribute("href", "/carros-usados/regiao/atibaia-sp");
    expect(cta.textContent).toMatch(/região/i);
  });

  it("usa microcopy 'Poucas opções' quando cidade tem ao menos 1 anúncio", () => {
    render(
      <AlsoInRegionBlock slug="atibaia-sp" cityName="Atibaia" cityAdsTotal={3} />
    );
    expect(screen.getByRole("heading").textContent).toMatch(/poucas/i);
  });

  it("usa microcopy 'Sem ofertas' quando cidade está vazia", () => {
    render(
      <AlsoInRegionBlock slug="atibaia-sp" cityName="Atibaia" cityAdsTotal={0} />
    );
    expect(screen.getByRole("heading").textContent).toMatch(/sem ofertas/i);
  });

  it("não renderiza quando slug ausente", () => {
    const { container } = render(
      <AlsoInRegionBlock slug="" cityName="Atibaia" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("inclui aria-label descritivo no CTA", () => {
    render(<AlsoInRegionBlock slug="campinas-sp" cityName="Campinas" />);
    const cta = screen.getByTestId("also-in-region-cta");
    expect(cta.getAttribute("aria-label")).toBe(
      "Ver veículos na região de Campinas"
    );
  });
});
