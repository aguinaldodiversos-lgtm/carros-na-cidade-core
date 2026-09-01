import { describe, expect, it } from "vitest";

import { getStaticSitemapEntries } from "@/lib/seo/sitemap-static";

/**
 * Contrato de entrada do `core.xml` — SEO Fase 4.1A, achados P1-3 e §14.
 *
 * Uma URL só pode constar no sitemap institucional se satisfizer TODAS estas
 * condições:
 *
 *     HTTP 200 · indexável · autocanônica · conteúdo final · sem redirect
 *
 * `/tabela-fipe` violava três delas de uma vez. Medido em produção em
 * 2026-08-31: respondia 200 com a metadata do LAYOUT RAIZ (canonical `/`, a
 * home), sem conteúdo próprio, e despachava para `/tabela-fipe/sao-paulo-sp`,
 * que é 404. Era a única violação entre as 53 URLs dos sitemaps.
 *
 * Este arquivo trava a lista por ROTAS-ÍNDICE conhecidas: qualquer rota que só
 * escolhe cidade e redireciona não pode voltar para cá.
 */

/**
 * Rotas que existem apenas para resolver a cidade e redirecionar. Nenhuma tem
 * conteúdo próprio; todas terminam em `/<rota>/[cidade]`.
 */
const REDIRECT_ONLY_ROUTES = ["/tabela-fipe", "/simulador-financiamento"];

describe("core.xml — critério de entrada", () => {
  const entries = getStaticSitemapEntries();
  const locs = entries.map((e) => e.loc);

  it("não contém rota que é só redirect", () => {
    for (const route of REDIRECT_ONLY_ROUTES) {
      expect(locs).not.toContain(route);
    }
  });

  it("não contém URL com segmento de cidade — território tem sitemap próprio", () => {
    for (const loc of locs) {
      expect(loc).not.toMatch(/^\/(carros-em|carros-baratos-em|carros-automaticos-em)\//);
      expect(loc).not.toContain("sao-paulo-sp");
    }
  });

  it("todo `loc` é caminho interno absoluto, sem query e sem barra final", () => {
    for (const loc of locs) {
      expect(loc.startsWith("/")).toBe(true);
      expect(loc).not.toContain("?");
      if (loc !== "/") expect(loc.endsWith("/")).toBe(false);
    }
  });

  it("não há duplicatas", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("mantém as institucionais que cumprem o critério", () => {
    expect(locs).toEqual(expect.arrayContaining(["/", "/comprar", "/blog", "/planos"]));
  });

  it("nenhuma entrada carimba `lastmod` — sem data confiável, omitir", () => {
    for (const entry of entries) {
      expect(entry.lastmod).toBeUndefined();
    }
  });
});
