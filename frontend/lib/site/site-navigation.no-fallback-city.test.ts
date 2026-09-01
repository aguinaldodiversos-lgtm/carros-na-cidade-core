import { describe, expect, it } from "vitest";

import {
  buildFooterNavSections,
  buildHeaderNavSections,
  getTerritorialRoutesForCity,
  FOOTER_NAV_SECTIONS,
  HEADER_NAV_SECTIONS,
  SITE_ROUTES,
} from "@/lib/site/site-navigation";

/**
 * NENHUMA string de runtime pode produzir `sao-paulo-sp` como cidade de
 * fallback — SEO Fase 4.1A, achado P1-2.
 *
 * ── A regressão que este arquivo trava ───────────────────────────────────────
 * `getTerritorialRoutesForCity` começava com
 *
 *     const slug = (citySlug || DEFAULT_PUBLIC_CITY_SLUG).trim() || DEFAULT_PUBLIC_CITY_SLUG;
 *
 * e `DEFAULT_PUBLIC_CITY_SLUG` era o literal `sao-paulo-sp`. São Paulo tem ZERO
 * anúncios ativos, então o gate territorial responde 404 nas seis rotas de
 * cidade. Como o Googlebot nunca carrega o cookie `cnc_city`, o crawler recebia
 * SEMPRE a substituição — cinco links mortos por página, medidos em produção em
 * 2026-08-31 na home e na página de marca.
 *
 * A correção NÃO é trocar por `atibaia-sp`: isso só moveria o defeito para o
 * dia em que Atibaia ficasse sem estoque. Ausência de cidade tem de significar
 * ausência de link territorial.
 */

/** Toda URL emitida por um conjunto de rotas territoriais. */
function allHrefs(routes: Record<string, string>): string[] {
  return Object.values(routes);
}

function sectionHrefs(sections: ReturnType<typeof buildFooterNavSections>): string[] {
  return sections.flatMap((section) => section.links.map((link) => link.href));
}

describe("rotas territoriais — sem cidade não há cidade inventada", () => {
  it.each([null, undefined, "", "   "])(
    "slug ausente (%p) não vira nenhuma cidade — cai nas rotas-índice",
    (slug) => {
      const routes = getTerritorialRoutesForCity(slug as string | null);

      expect(allHrefs(routes).join(" ")).not.toContain("sao-paulo-sp");
      expect(routes).toEqual({
        comprar: "/comprar",
        comprarBelowFipe: "/comprar",
        fipe: "/tabela-fipe",
        financing: "/simulador-financiamento",
        cidade: "/comprar",
        regional: "/comprar",
        blog: "/blog",
      });
    }
  );

  it("cidade pública real produz as rotas territoriais dela", () => {
    const routes = getTerritorialRoutesForCity("atibaia-sp");

    expect(routes.comprar).toBe("/carros-em/atibaia-sp");
    expect(routes.comprarBelowFipe).toBe("/carros-baratos-em/atibaia-sp");
    expect(routes.fipe).toBe("/tabela-fipe/atibaia-sp");
    expect(routes.blog).toBe("/blog/atibaia-sp");
  });

  it("cidade que saiu do conjunto público (isPublicCity=false) degrada", () => {
    const routes = getTerritorialRoutesForCity("altaneira-ce", { isPublicCity: false });

    expect(allHrefs(routes).join(" ")).not.toContain("altaneira-ce");
    expect(routes.fipe).toBe("/tabela-fipe");
    expect(routes.blog).toBe("/blog");
  });

  it("`isPublicCity: undefined` (conjunto carregando) mantém o territorial — fail-open", () => {
    const routes = getTerritorialRoutesForCity("atibaia-sp", { isPublicCity: undefined });
    expect(routes.comprar).toBe("/carros-em/atibaia-sp");
  });
});

describe("constantes de navegação não carregam cidade fixa", () => {
  it("SITE_ROUTES não menciona nenhum slug de cidade", () => {
    const serialized = JSON.stringify(SITE_ROUTES);
    expect(serialized).not.toContain("sao-paulo-sp");
    // Guard genérico: nenhum `-uf` de cidade no chrome global.
    expect(serialized).not.toMatch(/\/(carros-em|carros-baratos-em)\/[a-z-]+-[a-z]{2}/);
  });

  it("FOOTER_NAV_SECTIONS e HEADER_NAV_SECTIONS não emitem cidade fixa", () => {
    const hrefs = [...sectionHrefs(FOOTER_NAV_SECTIONS), ...sectionHrefs(HEADER_NAV_SECTIONS)];
    expect(hrefs.join(" ")).not.toContain("sao-paulo-sp");
  });
});

describe("rodapé — o mesmo sinal do cabeçalho", () => {
  it("sem cidade, nenhum link do rodapé aponta para cidade", () => {
    const hrefs = sectionHrefs(buildFooterNavSections(null));
    expect(hrefs.join(" ")).not.toContain("sao-paulo-sp");
    expect(
      hrefs.some((h) => /^\/(carros-em|carros-baratos-em|tabela-fipe|blog)\/[a-z]/.test(h))
    ).toBe(false);
  });

  it("cidade não-pública no rodapé degrada igual ao cabeçalho", () => {
    const footer = sectionHrefs(
      buildFooterNavSections("altaneira-ce", {}, undefined, { isPublicCity: false })
    );
    const header = sectionHrefs(buildHeaderNavSections("altaneira-ce", { isPublicCity: false }));

    expect(footer.join(" ")).not.toContain("altaneira-ce");
    expect(header.join(" ")).not.toContain("altaneira-ce");
  });

  it("cidade pública aparece nos links territoriais do rodapé", () => {
    const hrefs = sectionHrefs(
      buildFooterNavSections("atibaia-sp", {}, undefined, { isPublicCity: true })
    );

    // "Buscar" e "Carros por cidade" seguem o INVENTÁRIO (não passado aqui) e
    // por isso apontam para `/comprar`. Os que seguem a cidade ativa são estes:
    expect(hrefs).toContain("/carros-baratos-em/atibaia-sp");
    expect(hrefs).toContain("/tabela-fipe/atibaia-sp");
    expect(hrefs).toContain("/blog/atibaia-sp");
  });
});
