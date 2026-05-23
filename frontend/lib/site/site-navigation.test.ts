import { describe, expect, it } from "vitest";

import {
  buildFooterNavSections,
  FOOTER_NAV_SECTIONS,
  type SiteNavSectionId,
} from "./site-navigation";

const EXPECTED_FOOTER_SECTIONS: SiteNavSectionId[] = [
  "comprar",
  "modelos",
  "cidades",
  "ferramentas",
  "vender",
  "institucional",
];

describe("buildFooterNavSections — 6 colunas do briefing 2026-05-22", () => {
  it("retorna exatamente 6 colunas na ordem esperada", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    expect(sections.map((s) => s.id)).toEqual(EXPECTED_FOOTER_SECTIONS);
  });

  it("Comprar tem 4 itens: Ver anúncios, Below FIPE, Por cidade, Por região", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const comprar = sections.find((s) => s.id === "comprar");
    const labels = comprar?.links.map((l) => l.label) ?? [];
    expect(labels).toEqual([
      "Ver anúncios",
      "Oportunidades abaixo da FIPE",
      "Carros por cidade",
      "Carros por região",
    ]);
  });

  it("Modelos mais buscados tem os 5 modelos exigidos pelo briefing", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const modelos = sections.find((s) => s.id === "modelos");
    const labels = modelos?.links.map((l) => l.label) ?? [];
    expect(labels).toEqual([
      "Volkswagen T-Cross",
      "Honda Civic",
      "Toyota Corolla",
      "Hyundai HB20",
      "Jeep Compass",
    ]);
  });

  it("Modelos linkam para busca /comprar?q=[modelo]", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const modelos = sections.find((s) => s.id === "modelos");
    const tcross = modelos?.links.find((l) => l.label === "Volkswagen T-Cross");
    expect(tcross?.href).toBe("/comprar?q=T-Cross");
  });

  it("Cidades com mais carros tem 6 cidades, todas linkando para /carros-em/", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const cidades = sections.find((s) => s.id === "cidades");
    expect(cidades?.links).toHaveLength(6);
    for (const link of cidades?.links ?? []) {
      expect(link.href).toMatch(/^\/carros-em\//);
    }
  });

  it("Ferramentas tem FIPE, Simulador, Dicas e Blog", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const ferramentas = sections.find((s) => s.id === "ferramentas");
    const labels = ferramentas?.links.map((l) => l.label) ?? [];
    expect(labels).toEqual([
      "Tabela FIPE",
      "Simulador de financiamento",
      "Dicas de segurança",
      "Blog",
    ]);
  });

  it("Vender tem Anuncie grátis, Lojista, Planos", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const vender = sections.find((s) => s.id === "vender");
    const labels = vender?.links.map((l) => l.label) ?? [];
    expect(labels).toEqual(["Anuncie grátis", "Área do lojista", "Planos e destaques"]);
  });

  it("Institucional inclui legais (Privacy + Terms) e operacionais (Ajuda, Segurança)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const inst = sections.find((s) => s.id === "institucional");
    const labels = inst?.links.map((l) => l.label) ?? [];
    expect(labels).toContain("Sobre");
    expect(labels).toContain("Contato");
    expect(labels).toContain("Central de ajuda");
    expect(labels).toContain("Política de privacidade");
    expect(labels).toContain("Termos de uso");
  });
});

describe("buildFooterNavSections — contexto territorial", () => {
  it("sem contexto: 'Carros por região' aponta para /comprar (catálogo)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "regiao");
    expect(link?.href).toBe("/comprar");
  });

  it("contexto cidade (citySlug): 'Carros por região' aponta para /carros-usados/regiao/[slug]", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", { citySlug: "atibaia-sp" });
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "regiao");
    expect(link?.href).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("contexto cidade: 'Carros por cidade' usa o citySlug ativo, não o default", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", { citySlug: "campinas-sp" });
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "cidade");
    expect(link?.href).toBe("/carros-em/campinas-sp");
  });

  it("contexto só com UF: 'Carros por região' aponta para /carros-usados/[uf] (estadual)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", { stateUf: "MG" });
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "regiao");
    expect(link?.href).toBe("/carros-usados/mg");
  });

  it("contexto cidade tem precedência sobre UF", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {
      citySlug: "atibaia-sp",
      stateUf: "SP",
    });
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "regiao");
    expect(link?.href).toBe("/carros-usados/regiao/atibaia-sp");
  });
});

describe("buildFooterNavSections — copy proibido pelo briefing", () => {
  it("não contém o copy 'anúncios verificados' em nenhum label", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    for (const section of sections) {
      for (const link of section.links) {
        expect(link.label.toLowerCase()).not.toContain("verificados");
        expect(link.label.toLowerCase()).not.toContain("verificada");
      }
    }
  });

  it("não tem coluna 'Conteúdo' (substituída por 'Ferramentas')", () => {
    const sections = buildFooterNavSections("sao-paulo-sp");
    expect(sections.find((s) => s.id === "conteudo")).toBeUndefined();
    expect(sections.find((s) => s.id === "ferramentas")).toBeDefined();
  });
});

describe("FOOTER_NAV_SECTIONS — export default", () => {
  it("usa cidade padrão e tem as 6 seções", () => {
    expect(FOOTER_NAV_SECTIONS.map((s) => s.id)).toEqual(EXPECTED_FOOTER_SECTIONS);
  });
});
