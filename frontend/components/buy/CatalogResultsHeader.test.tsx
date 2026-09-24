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
