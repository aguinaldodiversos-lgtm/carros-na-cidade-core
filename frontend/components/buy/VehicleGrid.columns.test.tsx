// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { VehicleGrid } from "@/components/buy/VehicleGrid";

afterEach(cleanup);

/**
 * A quarta coluna é DE UMA ROTA SÓ.
 *
 * `VehicleGrid` é montado por `BuyMarketplacePageClient`, que serve cinco
 * rotas. A Fase 5.0B pediu 4 cards no desktop apenas em `/carros-em/[slug]`.
 * Trocar `lg:grid-cols-3` por `lg:grid-cols-4` teria mudado as cinco de uma vez
 * — é exatamente esse acidente que estes testes tornam impossível de passar
 * despercebido.
 *
 * A geometria por trás do breakpoint está documentada em `VehicleGrid.tsx`:
 * com o container de 1280px o card tem 275px; espremer 4 colunas ali dá 201px.
 * A quarta coluna só cabe quando o container cresce para 1600px (281px/card).
 */

const ITEMS = Array.from({ length: 8 }, (_, i) => ({
  id: `ad-${i}`,
  slug: `carro-${i}`,
  title: `Carro ${i}`,
  price: 50000 + i,
})) as never[];

function gridClass(container: HTMLElement): string {
  const grid = container.querySelector("div.grid");
  return grid?.getAttribute("class") ?? "";
}

const inferWeight = () => 1 as const;

describe("VehicleGrid — densidade de colunas por variante", () => {
  it("padrão: 1 / 2 / 3 colunas — o comportamento histórico", () => {
    const { container } = render(<VehicleGrid items={ITEMS} inferWeight={inferWeight} />);
    const cls = gridClass(container);

    expect(cls).toContain("grid-cols-1");
    expect(cls).toContain("sm:grid-cols-2");
    expect(cls).toContain("lg:grid-cols-3");
    // A quarta coluna NÃO pode vazar para as demais rotas.
    expect(cls).not.toContain("grid-cols-4");
  });

  it('omitir a prop é idêntico a columns="default"', () => {
    const { container: semProp } = render(<VehicleGrid items={ITEMS} inferWeight={inferWeight} />);
    const a = gridClass(semProp);
    cleanup();
    const { container: comProp } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="default" />
    );
    expect(gridClass(comProp)).toBe(a);
  });

  it('"wide": acrescenta a quarta coluna SÓ a partir de 1600px', () => {
    const { container } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="wide" />
    );
    const cls = gridClass(container);

    expect(cls).toContain("min-[1600px]:grid-cols-4");
  });

  it('"wide" preserva mobile e tablet INTOCADOS', () => {
    const { container } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="wide" />
    );
    const cls = gridClass(container);

    // 1 coluna no mobile, 2 no tablet, 3 no desktop intermediário — iguais ao
    // padrão. A fase proibiu explicitamente mexer em mobile.
    expect(cls).toContain("grid-cols-1");
    expect(cls).toContain("sm:grid-cols-2");
    expect(cls).toContain("lg:grid-cols-3");
    expect(cls).toContain("gap-3");
    expect(cls).toContain("sm:gap-4");
    expect(cls).toContain("lg:gap-5");
  });

  it('a única diferença entre "default" e "wide" é a quarta coluna', () => {
    const { container: def } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="default" />
    );
    const clsDefault = gridClass(def);
    cleanup();
    const { container: wide } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="wide" />
    );
    const clsWide = gridClass(wide);

    expect(clsWide.replace(" min-[1600px]:grid-cols-4", "")).toBe(clsDefault);
  });

  it("nenhuma variante emite breakpoint de 4 colunas abaixo de 1600px", () => {
    for (const columns of ["default", "wide"] as const) {
      cleanup();
      const { container } = render(
        <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns={columns} />
      );
      const cls = gridClass(container);
      // Nem `lg:` (1024), nem `xl:` (1280), nem `2xl:` (1536) podem virar 4.
      expect(cls).not.toContain("lg:grid-cols-4");
      expect(cls).not.toContain("xl:grid-cols-4");
      expect(cls).not.toContain("2xl:grid-cols-4");
    }
  });
});
