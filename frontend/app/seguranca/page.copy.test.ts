import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Defesa contra regressão de copy da /seguranca.
 *
 * A rodada de credibilidade adicionou um bloco "O que o Carros na Cidade
 * faz na moderação dos anúncios" descrevendo regras REAIS do backend
 * (antifraude/pending_review/denúncia). E uma cláusula explícita do que
 * NÃO fazemos (Detran, vistoria, validação documental, garantia).
 *
 * Estes testes barram regressão por leitura estática do source — não
 * dependem de jsdom para validar conteúdo em vitrine pública.
 */

describe("/seguranca — bloco real de moderação", () => {
  const filePath = join(process.cwd(), "app", "seguranca", "page.tsx");
  const source = readFileSync(filePath, "utf8");

  it('contém o bloco "O que o Carros na Cidade faz na moderação"', () => {
    expect(source).toMatch(/modera[çc][ãa]o dos an[úu]ncios/i);
  });

  it("menciona pending_review/análise/denúncia (sinais reais)", () => {
    expect(source).toMatch(/an[áa]lise|denun|reavalia/i);
  });

  it("declara explicitamente o que NÃO fazemos (Detran/vistoria/garantia)", () => {
    expect(source).toMatch(/N[ÃA]O fazemos/);
    expect(source).toMatch(/Detran/i);
    expect(source).toMatch(/vistoria/i);
    expect(source).toMatch(/garantia de proced[êe]ncia/i);
  });

  it('NÃO promete "compra segura garantida" / "sem risco"', () => {
    expect(source).not.toMatch(/compra segura garantida/i);
    expect(source).not.toMatch(/sem risco/i);
  });
});
