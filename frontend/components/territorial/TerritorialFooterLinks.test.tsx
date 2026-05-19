// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `server-only` é resolvido via alias para test/stubs/server-only.ts
// (ver vitest.config.ts) — não precisa de vi.mock.

import { TerritorialFooterLinks } from "./TerritorialFooterLinks";

const ORIGINAL_FLAG = process.env.REGIONAL_PAGE_ENABLED;

afterEach(() => {
  cleanup();
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.REGIONAL_PAGE_ENABLED;
  } else {
    process.env.REGIONAL_PAGE_ENABLED = ORIGINAL_FLAG;
  }
});

describe("TerritorialFooterLinks — flag REGIONAL_PAGE_ENABLED desligada", () => {
  beforeEach(() => {
    delete process.env.REGIONAL_PAGE_ENABLED;
  });

  it("não renderiza CTA regional quando flag está off", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    expect(screen.queryByTestId("region-cta-link")).not.toBeInTheDocument();
  });

  it("estado vira CTA primary (fallback) quando regional está off", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    const stateLink = screen.getByTestId("state-cta-link");
    // Quando não há regional, o estado é o único caminho — recebe a classe
    // primary-filled (bg-primary). Verificamos pelo className para garantir
    // a hierarquia visual que o spec do PR 2 exige.
    expect(stateLink.className).toMatch(/bg-primary/);
    expect(stateLink.className).not.toMatch(/bg-white/);
  });

  it("microcopy reflete fallback estadual (sem mencionar região)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    expect(screen.getByText(/catálogo completo do estado/i)).toBeInTheDocument();
  });
});

describe("TerritorialFooterLinks — flag REGIONAL_PAGE_ENABLED ligada", () => {
  beforeEach(() => {
    process.env.REGIONAL_PAGE_ENABLED = "true";
  });

  it("renderiza ambos os CTAs (regional + estado)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    expect(screen.getByTestId("region-cta-link")).toBeInTheDocument();
    expect(screen.getByTestId("state-cta-link")).toBeInTheDocument();
  });

  it("regional é CTA primário (bg-primary, filled)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    const regionLink = screen.getByTestId("region-cta-link");
    expect(regionLink.className).toMatch(/bg-primary/);
    expect(regionLink.className).not.toMatch(/border-cnc-line/);
  });

  it("estado é CTA secundário (outline, sem bg-primary)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    const stateLink = screen.getByTestId("state-cta-link");
    expect(stateLink.className).toMatch(/border-cnc-line/);
    expect(stateLink.className).not.toMatch(/bg-primary/);
  });

  it("regional aparece ANTES do estado no DOM (ordem importa para o usuário scanning)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    const region = screen.getByTestId("region-cta-link");
    const state = screen.getByTestId("state-cta-link");
    expect(region.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("microcopy menciona região + estado quando regional está ativa", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    expect(screen.getByText(/mais opções perto de Atibaia/i)).toBeInTheDocument();
  });

  it("hrefs corretos com encoding e UF lowercase", () => {
    render(<TerritorialFooterLinks slug="rio-de-janeiro-rj" cityName="Rio de Janeiro" state="rj" />);
    expect(screen.getByTestId("region-cta-link").getAttribute("href")).toBe(
      "/carros-usados/regiao/rio-de-janeiro-rj"
    );
    expect(screen.getByTestId("state-cta-link").getAttribute("href")).toBe("/comprar/estado/rj");
  });

  it("não há link 'Brasil' (regra do PR 2 — CTA não aponta para Brasil)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state="SP" />);
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain("brasil");
  });
});

describe("TerritorialFooterLinks — estado nulo/vazio (defesa)", () => {
  beforeEach(() => {
    process.env.REGIONAL_PAGE_ENABLED = "true";
  });

  it("state null → não renderiza CTA estadual (mas regional permanece)", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state={null} />);
    expect(screen.getByTestId("region-cta-link")).toBeInTheDocument();
    expect(screen.queryByTestId("state-cta-link")).not.toBeInTheDocument();
  });

  it("state undefined → idem", () => {
    render(<TerritorialFooterLinks slug="atibaia-sp" cityName="Atibaia" state={undefined} />);
    expect(screen.queryByTestId("state-cta-link")).not.toBeInTheDocument();
  });
});
