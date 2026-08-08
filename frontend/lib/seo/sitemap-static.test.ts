import { describe, expect, it } from "vitest";

import { getStaticSitemapEntries } from "@/lib/seo/sitemap-static";
import { buildSitemapXml } from "@/lib/seo/sitemap-xml";

/**
 * Contrato do sitemap: só entra URL que satisfaz TODAS estas condições —
 *
 *   HTTP 200 · indexável · autocanônica · conteúdo final · sem redirect
 *
 * O sitemap é uma AFIRMAÇÃO ao Google sobre quais URLs são as boas. Listar uma
 * que redireciona, ou cuja canonical aponta para outro lugar, é contradizer a
 * própria afirmação — e foi o que acontecia com `/anuncios`.
 */
const entries = getStaticSitemapEntries();
const locs = entries.map((e) => e.loc);

describe("sitemap estático — só destinos finais", () => {
  it("não lista /anuncios (hoje é 308 para /comprar)", () => {
    expect(locs).not.toContain("/anuncios");
    expect(locs.some((loc) => loc.startsWith("/anuncios"))).toBe(false);
  });

  it("não lista rotas legadas de cidade (hoje 308 para /carros-em)", () => {
    expect(locs.some((loc) => loc.startsWith("/comprar/cidade/"))).toBe(false);
    expect(locs.some((loc) => loc.startsWith("/cidade/"))).toBe(false);
  });

  it("mantém /comprar — deixou de redirecionar e virou vitrine nacional", () => {
    expect(locs).toContain("/comprar");
  });

  it("nenhuma URL carrega query string", () => {
    // `?sort=`, `?city_slug=`, filtros: todos são noindex ou normalizados por
    // redirect. Nenhum é destino final, logo nenhum entra aqui.
    for (const loc of locs) {
      expect(loc, loc).not.toContain("?");
      expect(loc, loc).not.toContain("&");
    }
  });

  it("nenhuma URL é a raiz de uma ferramenta noindex", () => {
    // `/simulador-financiamento` redireciona para a versão por cidade, que é
    // noindex. Saiu do sitemap em 2026-07-03 e não pode voltar.
    expect(locs).not.toContain("/simulador-financiamento");
  });

  it("todas são paths relativos absolutos, sem host embutido", () => {
    for (const loc of locs) {
      expect(loc.startsWith("/"), loc).toBe(true);
      expect(loc, loc).not.toContain("://");
    }
  });

  it("não há URL duplicada", () => {
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe("lastmod — nunca artificial", () => {
  it("nenhuma entrada estática declara lastmod", () => {
    // A versão anterior carimbava `new Date()` em todas, a cada request: o
    // sitemap afirmava que a página "Planos" tinha acabado de mudar, sempre.
    // Um lastmod que muda sempre não é dado — é ruído que ensina o Google a
    // ignorar o campo, inclusive onde ele é verdadeiro.
    for (const entry of entries) {
      expect(entry.lastmod, entry.loc).toBeUndefined();
    }
  });

  it("duas leituras seguidas produzem exatamente o mesmo XML", () => {
    // Se algum `new Date()` voltasse, este teste falharia de forma
    // intermitente — o que já é sinal suficiente.
    expect(buildSitemapXml(getStaticSitemapEntries())).toBe(
      buildSitemapXml(getStaticSitemapEntries())
    );
  });

  it("o XML gerado não contém tag lastmod", () => {
    expect(buildSitemapXml(entries)).not.toContain("<lastmod>");
  });
});

describe("XML bem formado", () => {
  it("abre com a declaração XML e o urlset", () => {
    const xml = buildSitemapXml(entries);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.endsWith("</urlset>")).toBe(true);
  });

  it("emite um <loc> por entrada", () => {
    const xml = buildSitemapXml(entries);
    expect(xml.split("<loc>").length - 1).toBe(entries.length);
  });
});
