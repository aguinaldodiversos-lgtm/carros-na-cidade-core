import { describe, expect, it } from "vitest";
import {
  buildLocalSeoTransitionEntries,
  buildOpportunitiesTransitionEntries,
  rewriteCityHomeEntries,
} from "./_lib/transition-helpers";
import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";

describe("rewriteCityHomeEntries (cities.xml)", () => {
  it("reescreve /cidade/[slug] (path relativo) para a canônica /carros-em/[slug]", () => {
    const input: PublicSitemapEntry[] = [
      { loc: "/cidade/braganca-paulista-sp" },
      { loc: "/cidade/atibaia-sp" },
    ];
    const out = rewriteCityHomeEntries(input);
    expect(out.map((e) => e.loc)).toEqual([
      "/carros-em/braganca-paulista-sp",
      "/carros-em/atibaia-sp",
    ]);
  });

  // O sitemap não pode publicar URL que redireciona: `/comprar/cidade/[slug]`
  // agora responde 308, então listá-la seria anunciar um salto ao Googlebot.
  it("nunca emite a rota legada de cidade", () => {
    const out = rewriteCityHomeEntries([{ loc: "/cidade/atibaia-sp" }]);
    expect(out[0].loc).not.toContain("/comprar/cidade/");
  });

  it("descarta slug que não é cidade brasileira válida", () => {
    const out = rewriteCityHomeEntries([{ loc: "/cidade/xpto-zz" }, { loc: "/cidade/atibaia-sp" }]);
    expect(out.map((e) => e.loc)).toEqual(["/carros-em/atibaia-sp"]);
  });

  it("reescreve URL absoluta /cidade/[slug] preservando host", () => {
    const input: PublicSitemapEntry[] = [{ loc: "https://carrosnacidade.com/cidade/atibaia-sp" }];
    const out = rewriteCityHomeEntries(input);
    expect(out[0].loc).toBe("https://carrosnacidade.com/carros-em/atibaia-sp");
  });

  it("preserva entries que NÃO são home da cidade (ex.: subrotas /marca/, /modelo/)", () => {
    const input: PublicSitemapEntry[] = [
      { loc: "/cidade/sao-paulo-sp/marca/honda" },
      { loc: "/cidade/sao-paulo-sp/marca/honda/modelo/civic" },
      { loc: "/cidade/sao-paulo-sp/abaixo-da-fipe" },
      { loc: "/cidade/sao-paulo-sp/oportunidades" },
    ];
    const out = rewriteCityHomeEntries(input);
    expect(out.map((e) => e.loc)).toEqual([
      "/cidade/sao-paulo-sp/marca/honda",
      "/cidade/sao-paulo-sp/marca/honda/modelo/civic",
      "/cidade/sao-paulo-sp/abaixo-da-fipe",
      "/cidade/sao-paulo-sp/oportunidades",
    ]);
  });

  it("não quebra em entries com loc vazio ou inválido", () => {
    const input: PublicSitemapEntry[] = [
      { loc: "" },
      { loc: "lixo-sem-slash" },
      { loc: "/algum/outro/path" },
    ];
    const out = rewriteCityHomeEntries(input);
    expect(out.map((e) => e.loc)).toEqual(["", "lixo-sem-slash", "/algum/outro/path"]);
  });

  it("preserva metadados (lastmod, changefreq, priority) ao reescrever", () => {
    const input: PublicSitemapEntry[] = [
      {
        loc: "/cidade/atibaia-sp",
        lastmod: "2026-05-01T00:00:00.000Z",
        changefreq: "daily",
        priority: 0.8,
      },
    ];
    const out = rewriteCityHomeEntries(input);
    expect(out[0]).toEqual({
      loc: "/carros-em/atibaia-sp",
      lastmod: "2026-05-01T00:00:00.000Z",
      changefreq: "daily",
      priority: 0.8,
    });
  });
});

describe("local-seo.xml e opportunities.xml em transição", () => {
  it("local-seo.xml não publica /carros-em, /carros-baratos-em nem /carros-automaticos-em (todas canonicalizam para outras famílias)", () => {
    expect(buildLocalSeoTransitionEntries()).toEqual([]);
  });

  it("opportunities.xml não publica /cidade/[slug]/oportunidades (canonicaliza para /abaixo-da-fipe)", () => {
    expect(buildOpportunitiesTransitionEntries()).toEqual([]);
  });
});
