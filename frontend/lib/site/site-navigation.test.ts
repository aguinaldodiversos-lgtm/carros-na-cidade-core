import { describe, expect, it } from "vitest";

import {
  buildFooterNavSections,
  FOOTER_NAV_SECTIONS,
  type FooterInventoryInput,
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

/** Colunas que existem sempre — não dependem de inventário. */
const STATIC_FOOTER_SECTIONS: SiteNavSectionId[] = [
  "comprar",
  "ferramentas",
  "vender",
  "institucional",
];

/** Inventário real de produção (Atibaia é a única cidade com estoque). */
const INVENTORY: FooterInventoryInput = {
  cities: [
    { slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 },
    { slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP", total: 3 },
  ],
  models: [
    {
      label: "Hyundai HB20 Sense Plus",
      brandSlug: "hyundai",
      modelSlug: "hb20-sense-plus-1-0-flex-12v-mec",
      total: 2,
    },
    { label: "Fiat Argo Drive", brandSlug: "fiat", modelSlug: "argo-drive-1-0-flex", total: 1 },
  ],
  modelsCity: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
};

describe("buildFooterNavSections — 6 colunas do briefing 2026-05-22", () => {
  it("retorna exatamente 6 colunas na ordem esperada (com inventário)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
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

  it("Modelos vêm do inventário e linkam para a página de cluster real", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
    const modelos = sections.find((s) => s.id === "modelos");
    expect(modelos?.links.map((l) => l.label)).toEqual([
      "Hyundai HB20 Sense Plus",
      "Fiat Argo Drive",
    ]);
    expect(modelos?.links[0].href).toBe(
      "/cidade/atibaia-sp/marca/hyundai/modelo/hb20-sense-plus-1-0-flex-12v-mec"
    );
  });

  it("título dos modelos nomeia a cidade — o dado é de UMA cidade", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
    expect(sections.find((s) => s.id === "modelos")?.title).toBe("Modelos disponíveis em Atibaia");
  });

  it("nenhum modelo linka para /comprar?q= (busca sem resultado garantido)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
    for (const link of sections.find((s) => s.id === "modelos")?.links ?? []) {
      expect(link.href).not.toContain("/comprar?q=");
      expect(link.href).toMatch(/^\/cidade\/[^/]+\/marca\/[^/]+\/modelo\/[^/]+$/);
    }
  });

  it("Cidades vêm do inventário, todas linkando para /carros-em/", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
    const cidades = sections.find((s) => s.id === "cidades");
    expect(cidades?.links.map((l) => l.label)).toEqual(["Atibaia", "Bragança Paulista"]);
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

  it("'Carros por cidade' segue o contexto QUANDO a cidade tem estoque", () => {
    const sections = buildFooterNavSections(
      "sao-paulo-sp",
      { citySlug: "braganca-paulista-sp" },
      INVENTORY
    );
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "cidade");
    expect(link?.href).toBe("/carros-em/braganca-paulista-sp");
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

describe("FOOTER_NAV_SECTIONS — export default (sem inventário)", () => {
  it("mantém só as colunas estáticas: sem dado, nada de título órfão", () => {
    expect(FOOTER_NAV_SECTIONS.map((s) => s.id)).toEqual(STATIC_FOOTER_SECTIONS);
  });
});

/**
 * Regressão 2026-07-28 — o rodapé é chrome GLOBAL: aparece em toda página.
 * Ele listava 6 cidades com ZERO anúncios e 5 modelos dos quais só um existia,
 * e nenhum link para Atibaia (única cidade com estoque). O Search Console
 * reportava "Nenhuma página de referência detectada" para /carros-em/atibaia-sp
 * — o site inteiro não linkava a própria cidade que tinha o que vender.
 */
describe("buildFooterNavSections — colunas derivadas do inventário", () => {
  const EMPTY: FooterInventoryInput = { cities: [], models: [], modelsCity: null };

  it("sem inventário: colunas de cidades e modelos são OMITIDAS (não título vazio)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, EMPTY);
    expect(sections.find((s) => s.id === "cidades")).toBeUndefined();
    expect(sections.find((s) => s.id === "modelos")).toBeUndefined();
  });

  it("sem inventário: colunas estáticas continuam intactas", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, EMPTY);
    expect(sections.map((s) => s.id)).toEqual(STATIC_FOOTER_SECTIONS);
  });

  it("modelos sem cidade de referência → coluna omitida (link seria inválido)", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, { ...INVENTORY, modelsCity: null });
    expect(sections.find((s) => s.id === "modelos")).toBeUndefined();
  });

  it("respeita o teto de 6 itens por coluna", () => {
    const many: FooterInventoryInput = {
      cities: Array.from({ length: 20 }, (_, i) => ({
        slug: `cidade-${i}-sp`,
        name: `Cidade ${i}`,
        state: "SP",
        total: 20 - i,
      })),
      models: Array.from({ length: 20 }, (_, i) => ({
        label: `Marca Modelo ${i}`,
        brandSlug: `marca-${i}`,
        modelSlug: `modelo-${i}`,
        total: 20 - i,
      })),
      modelsCity: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
    };
    const sections = buildFooterNavSections("sao-paulo-sp", {}, many);
    expect(sections.find((s) => s.id === "cidades")?.links).toHaveLength(6);
    expect(sections.find((s) => s.id === "modelos")?.links).toHaveLength(6);
  });

  it("NENHUM link de cidade aponta para cidade fora do inventário", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, INVENTORY);
    const hrefs = sections.find((s) => s.id === "cidades")?.links.map((l) => l.href) ?? [];
    expect(hrefs).toEqual(["/carros-em/atibaia-sp", "/carros-em/braganca-paulista-sp"]);
    // As antigas hardcoded (todas com zero estoque) não podem reaparecer.
    for (const dead of ["sao-paulo-sp", "campinas-sp", "santos-sp", "sorocaba-sp"]) {
      expect(hrefs).not.toContain(`/carros-em/${dead}`);
    }
  });
});

/**
 * Fixture com os valores REAIS de produção (Atibaia, 2026-07-28) e as URLs
 * que foram verificadas ao vivo respondendo HTTP 200 com anúncios.
 *
 * Cobre os três casos que quebrariam o link silenciosamente:
 *   - "GM - Chevrolet"  → marca/chevrolet   (prefixo de grupo FIPE)
 *   - "VW - VolksWagen" → marca/volkswagen  (prefixo + caixa)
 *   - "Citroën"         → marca/citroen     (acento)
 * Os slugs vêm prontos do backend; este teste trava o formato do href.
 */
describe("rodapé — URLs verificadas em produção", () => {
  const PROD: FooterInventoryInput = {
    cities: [{ slug: "atibaia-sp", name: "Atibaia", state: "SP", total: 19 }],
    models: [
      {
        label: "Citroën C3 Live",
        brandSlug: "citroen",
        modelSlug: "c3-live-pack-1-0-flex-6v-5p-mec",
        total: 2,
      },
      {
        label: "Chevrolet ONIX HATCH",
        brandSlug: "chevrolet",
        modelSlug: "onix-hatch-lt-1-0-12v-flex-5p-mec",
        total: 2,
      },
      {
        label: "Volkswagen Fox Connect",
        brandSlug: "volkswagen",
        modelSlug: "fox-connect-1-6-flex-8v-5p",
        total: 1,
      },
    ],
    modelsCity: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
  };

  it("gera exatamente as URLs confirmadas com anúncios em produção", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, PROD);
    expect(sections.find((s) => s.id === "modelos")?.links.map((l) => l.href)).toEqual([
      "/cidade/atibaia-sp/marca/citroen/modelo/c3-live-pack-1-0-flex-6v-5p-mec",
      "/cidade/atibaia-sp/marca/chevrolet/modelo/onix-hatch-lt-1-0-12v-flex-5p-mec",
      "/cidade/atibaia-sp/marca/volkswagen/modelo/fox-connect-1-6-flex-8v-5p",
    ]);
  });

  it("o rodapé linka Atibaia — a ausência disso era a causa da não-indexação", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", {}, PROD);
    const hrefs = sections.flatMap((s) => s.links.map((l) => l.href));
    expect(hrefs).toContain("/carros-em/atibaia-sp");
  });
});

describe("'Carros por cidade' — não seguir a última cidade visitada", () => {
  it("cidade do contexto SEM estoque → cai na cidade de maior estoque", () => {
    // Bug real: quem visitasse Altaneira-CE passava a ver, em TODA página,
    // um link do rodapé para /carros-em/altaneira-ce — página vazia.
    const sections = buildFooterNavSections(
      "sao-paulo-sp",
      { citySlug: "altaneira-ce" },
      INVENTORY
    );
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "cidade");
    expect(link?.href).toBe("/carros-em/atibaia-sp");
  });

  it("sem inventário nenhum → catálogo geral, nunca uma cidade vazia", () => {
    const sections = buildFooterNavSections("sao-paulo-sp", { citySlug: "altaneira-ce" });
    const link = sections.find((s) => s.id === "comprar")?.links.find((l) => l.id === "cidade");
    expect(link?.href).toBe("/comprar");
  });
});
