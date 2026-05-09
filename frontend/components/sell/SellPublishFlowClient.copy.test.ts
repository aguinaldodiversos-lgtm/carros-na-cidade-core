import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Defesa contra regressão de COPY interna em /anunciar/publicar.
 *
 * A rodada de simplificação removeu textos técnicos/internos que
 * vazavam para o usuário:
 *
 *   1. "Destino pós-acesso: /anunciar/novo?tipo=..." — expunha path
 *      interno da rota; produz desconfiança em vitrine pública.
 *   2. "Fluxo preparado para conversão" + descrição meta ("Essa etapa
 *      já separa corretamente particular e lojista...") — copy
 *      meta-marketing falando ABOUT o fluxo em vez de AO usuário.
 *   3. Subtitle terceira pessoa "...o usuário entra no fluxo de
 *      publicação..." reescrita para segunda pessoa.
 *
 * Implementação em nível de string porque o componente é "use client"
 * e ler o source do arquivo é mais barato e estável que renderizar via
 * jsdom (que sequer está disponível no monorepo).
 */

describe("SellPublishFlowClient — sem texto técnico/meta visível", () => {
  const filePath = join(
    process.cwd(),
    "components",
    "sell",
    "SellPublishFlowClient.tsx"
  );
  const source = readFileSync(filePath, "utf8");

  it('NÃO contém "Destino pós-acesso"', () => {
    // Texto técnico que mostrava "/anunciar/novo?tipo=particular" como
    // string literal na vitrine pública.
    expect(source).not.toMatch(/Destino p[óo]s-acesso/i);
  });

  it('NÃO contém "Fluxo preparado para conversão"', () => {
    // Bloco meta-marketing sobre o próprio fluxo — falava ABOUT a
    // página em vez de falar AO usuário.
    expect(source).not.toMatch(/Fluxo preparado para convers[ãa]o/i);
  });

  it("NÃO usa terceira pessoa 'o usuário entra' no subtitle", () => {
    // Subtitle reescrita em 2ª pessoa ("você"). Permitimos a palavra
    // "usuário" em outros contextos (ex.: ARIA), apenas barramos a
    // construção que descreve o fluxo na 3ª pessoa.
    expect(source).not.toMatch(/o usu[áa]rio entra no fluxo/i);
  });

  it("usa segunda pessoa no subtitle (você)", () => {
    // Sentinela positiva: subtitle deve falar AO usuário.
    expect(source).toMatch(/voc[êe]/i);
  });
});
