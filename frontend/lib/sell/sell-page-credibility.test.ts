import { describe, expect, it } from "vitest";

import { getSellPageContent } from "@/lib/sell/sell-page";

/**
 * Defesa contra regressão de credibilidade na página /anunciar.
 *
 * Histórico: o conteúdo trazia 3 depoimentos fictícios ("Carlos M.",
 * "Prime Auto Center", "Fernanda R.") como prova social não verificável.
 * Esta rodada removeu os 3 e introduziu o bloco `trust` com regras REAIS
 * de moderação (antifraude, pending_review, denúncia → reavaliação).
 *
 * Sentinela: testimonials é vazio E `trust` traz pelo menos 3 itens
 * descrevendo regras de moderação reais — sem prometer Detran/vistoria/
 * garantia.
 */

describe("/anunciar — sem depoimentos fictícios", () => {
  it("testimonials vem vazio (sem placeholders)", async () => {
    const content = await getSellPageContent();
    expect(Array.isArray(content.testimonials)).toBe(true);
    expect(content.testimonials.length).toBe(0);
  });

  it('NÃO contém os depoimentos placeholder "Carlos M.", "Prime Auto", "Fernanda"', async () => {
    const content = await getSellPageContent();
    const json = JSON.stringify(content);
    expect(json).not.toMatch(/Carlos M\./);
    expect(json).not.toMatch(/Prime Auto Center/);
    expect(json).not.toMatch(/Fernanda R\./);
  });
});

describe("/anunciar — bloco trust com regras reais de moderação", () => {
  it("trust tem ao menos 3 itens descrevendo o que o portal faz", async () => {
    const content = await getSellPageContent();
    expect(Array.isArray(content.trust)).toBe(true);
    expect(content.trust.length).toBeGreaterThanOrEqual(3);
    for (const item of content.trust) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("não promete Detran, vistoria, garantia ou compra segura garantida", async () => {
    const content = await getSellPageContent();
    const corpus = JSON.stringify(content.trust).toLowerCase();
    expect(corpus).not.toMatch(/detran/);
    expect(corpus).not.toMatch(/vistoria/);
    expect(corpus).not.toMatch(/garantia de procedência/);
    expect(corpus).not.toMatch(/compra segura garantida/);
    expect(corpus).not.toMatch(/sem risco/);
    expect(corpus).not.toMatch(/100% seguro/);
  });

  it("menciona análise/checagem/revisão/denúncia (linguagem real do backend)", async () => {
    const content = await getSellPageContent();
    const corpus = JSON.stringify(content.trust).toLowerCase();
    // Alguma referência a moderação real precisa existir.
    const matchesAnalysis = /(an[áa]lise|checagem|revis[ãa]o|denun)/.test(corpus);
    expect(matchesAnalysis).toBe(true);
  });
});
