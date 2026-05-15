// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `server-only` é resolvido via alias para test/stubs/server-only.ts
// (ver vitest.config.ts) — não precisa de vi.mock.

import { RegionCtaLink } from "./RegionCtaLink";

const ORIGINAL_FLAG = process.env.REGIONAL_PAGE_ENABLED;

afterEach(() => {
  cleanup();
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.REGIONAL_PAGE_ENABLED;
  } else {
    process.env.REGIONAL_PAGE_ENABLED = ORIGINAL_FLAG;
  }
});

describe("RegionCtaLink — gate por feature flag", () => {
  it("retorna null quando REGIONAL_PAGE_ENABLED não está em 'true' exato", () => {
    process.env.REGIONAL_PAGE_ENABLED = "false";
    const { container } = render(
      <RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("retorna null quando flag ausente", () => {
    delete process.env.REGIONAL_PAGE_ENABLED;
    const { container } = render(
      <RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("retorna null quando flag é 'TRUE' (contrato estrito case-sensitive)", () => {
    process.env.REGIONAL_PAGE_ENABLED = "TRUE";
    const { container } = render(
      <RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("retorna null quando flag é '1'", () => {
    process.env.REGIONAL_PAGE_ENABLED = "1";
    const { container } = render(
      <RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("RegionCtaLink — renderização com flag ligada", () => {
  beforeEach(() => {
    process.env.REGIONAL_PAGE_ENABLED = "true";
  });

  it("renderiza Link com href para /carros-usados/regiao/[slug]", () => {
    render(<RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />);
    const link = screen.getByTestId("region-cta-link");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("texto visível inclui o nome da cidade", () => {
    render(<RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />);
    expect(screen.getByText(/Ver carros na região de Atibaia/i)).toBeInTheDocument();
  });

  it("aria-label inclui nome da cidade para acessibilidade", () => {
    render(<RegionCtaLink slug="campinas-sp" cityName="Campinas" />);
    const link = screen.getByTestId("region-cta-link");
    expect(link.getAttribute("aria-label")).toBe(
      "Ver carros na região de Campinas"
    );
  });

  it("encoda o slug no href", () => {
    // Defensivo: na prática slugs não têm caracteres especiais, mas o
    // componente passa por encodeURIComponent.
    render(<RegionCtaLink slug="rio-de-janeiro-rj" cityName="Rio de Janeiro" />);
    const link = screen.getByTestId("region-cta-link");
    expect(link.getAttribute("href")).toBe("/carros-usados/regiao/rio-de-janeiro-rj");
  });

  it("PR 2: é CTA primary filled (bg-primary, não outline neutro)", () => {
    render(<RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />);
    const link = screen.getByTestId("region-cta-link");
    expect(link.className).toMatch(/bg-primary/);
    expect(link.className).not.toMatch(/border-cnc-line/);
  });

  it("PR 2: tem microcopy explicando o motivo do CTA", () => {
    render(<RegionCtaLink slug="atibaia-sp" cityName="Atibaia" />);
    expect(screen.getByText(/mais opções perto de Atibaia/i)).toBeInTheDocument();
  });
});
