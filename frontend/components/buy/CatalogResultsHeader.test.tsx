// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogResultsHeader } from "./CatalogResultsHeader";

afterEach(cleanup);

describe("CatalogResultsHeader — declaração do território (DEC-03)", () => {
  it("mostra o aviso do raio quando o motor declarou território", () => {
    render(
      <CatalogResultsHeader
        totalResults={34}
        onPatch={vi.fn()}
        territoryNotice="Mostrando ofertas em até 25 km de Atibaia, incluindo 1 cidade vizinha"
      />
    );
    expect(screen.getByTestId("catalog-territory-notice")).toHaveTextContent(
      "em até 25 km de Atibaia"
    );
  });

  it("sem aviso, não renderiza linha nenhuma — nada de raio inventado no legado", () => {
    render(<CatalogResultsHeader totalResults={3} onPatch={vi.fn()} />);
    expect(screen.queryByTestId("catalog-territory-notice")).toBeNull();
    expect(screen.getByText(/ofertas encontradas/)).toBeInTheDocument();
  });

  it("aviso nulo é tratado como ausência", () => {
    render(<CatalogResultsHeader totalResults={3} onPatch={vi.fn()} territoryNotice={null} />);
    expect(screen.queryByTestId("catalog-territory-notice")).toBeNull();
  });
});

describe("CatalogResultsHeader — ordenação só no desktop (landing de modelo)", () => {
  it('sortVisibility="desktop": o select existe, escondido abaixo de lg', () => {
    render(<CatalogResultsHeader totalResults={6} onPatch={vi.fn()} sortVisibility="desktop" />);
    const label = screen.getByLabelText("Ordenar por").closest("label");
    expect(label?.className).toContain("hidden");
    expect(label?.className).toContain("lg:inline-flex");
  });

  it("default: select visível em qualquer largura (catálogo inalterado)", () => {
    render(<CatalogResultsHeader totalResults={6} onPatch={vi.fn()} />);
    const label = screen.getByLabelText("Ordenar por").closest("label");
    expect(label?.className.split(" ")).toContain("inline-flex");
    expect(label?.className).not.toContain("hidden");
  });
});
