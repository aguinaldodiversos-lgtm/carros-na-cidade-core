// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { VehicleGrid } from "@/components/buy/VehicleGrid";

afterEach(cleanup);

/**
 * A quarta coluna anda com o SHELL LARGO, não com a rota.
 *
 * A Fase 5.0B estreou `columns="wide"` em `/carros-em/[slug]`; quando o shell de
 * 1600px virou o único shell do catálogo, as cinco rotas de
 * `BuyMarketplacePageClient` passaram a recebê-lo. O que estes testes guardam
 * NÃO mudou de valor, só de motivo: a quarta coluna continua sendo consequência
 * do container largo, e "default" continua sendo o grid de quem não tem esse
 * container. Trocar `lg:grid-cols-3` por `lg:grid-cols-4` no default levaria 4
 * cards para dentro de 864px — 201px por card, medido em runtime.
 *
 * A geometria está documentada em `VehicleGrid.tsx`. O que prova a coluna no
 * navegador é `e2e/catalog-city-clean-grid.spec.ts`, medindo caixa; aqui só se
 * prova que a classe certa foi emitida.
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
    // A quarta coluna NÃO pode vazar para o grid de container estreito.
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

  it('"wide": acrescenta a quarta coluna a partir de 1392px', () => {
    const { container } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="wide" />
    );
    const cls = gridClass(container);

    expect(cls).toContain("min-[1392px]:grid-cols-4");
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
    // `gap-3` (mobile) e `sm:gap-4` (tablet) são os que a fase protege — e são
    // idênticos nas duas variantes. O `lg:gap-5` some na "wide": o shell largo
    // usa 16px entre cards a partir de `lg`, o que é parte do orçamento que faz
    // a quarta coluna caber em 1440. Mobile e tablet não enxergam essa mudança.
    expect(cls).toContain("gap-3");
    expect(cls).toContain("sm:gap-4");
    expect(cls).not.toContain("lg:gap-5");
  });

  it("mobile e tablet são byte a byte iguais entre as duas variantes", () => {
    // Recorta de cada classe só os utilitários que valem abaixo de `lg`. Se um
    // dia a variante "wide" mexer em qualquer coisa de mobile ou tablet, este
    // teste falha — é ele que sustenta a promessa "mobile INALTERADO".
    const abaixoDeLg = (cls: string) =>
      cls
        .split(" ")
        .filter((c) => !c.startsWith("lg:") && !c.startsWith("min-["))
        .join(" ");

    const { container: def } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="default" />
    );
    const clsDefault = gridClass(def);
    cleanup();
    const { container: wide } = render(
      <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns="wide" />
    );

    expect(abaixoDeLg(gridClass(wide))).toBe(abaixoDeLg(clsDefault));
  });

  it("nenhuma variante emite 4 colunas em breakpoint nomeado do Tailwind", () => {
    for (const columns of ["default", "wide"] as const) {
      cleanup();
      const { container } = render(
        <VehicleGrid items={ITEMS} inferWeight={inferWeight} columns={columns} />
      );
      const cls = gridClass(container);
      // A quarta coluna tem de vir do breakpoint arbitrário medido (1392), e não
      // de `lg:` (1024), `xl:` (1280) ou `2xl:` (1536) — nenhum deles coincide
      // com a largura em que a conta do shell fecha.
      expect(cls).not.toContain("lg:grid-cols-4");
      expect(cls).not.toContain("xl:grid-cols-4");
      expect(cls).not.toContain("2xl:grid-cols-4");
    }
  });
});
