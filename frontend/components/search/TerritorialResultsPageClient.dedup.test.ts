import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Defesa contra regressão de duplicidade do bloco "Continuar em [cidade]".
 *
 * Histórico: o componente `<TerritorialInternalLinksSection>` foi
 * renderizado duas vezes em `TerritorialResultsPageClient` — uma acima
 * da listagem e outra ao final da página. Cada ocorrência produz um
 * heading "Continuar em São Paulo" (ou cidade ativa); o usuário via o
 * mesmo bloco repetido na mesma rolagem.
 *
 * Este teste impede que alguém volte a montar duas instâncias do
 * componente no mesmo arquivo. Está implementado em nível de string
 * porque o componente está marcado como "use client" e renderizá-lo via
 * jsdom + RouterContext seria custoso para uma asserção tão simples.
 *
 * Critério: aceita 1 import + 1 uso JSX + 1 menção em comentário (a
 * mesma da nota explicativa que permanece no arquivo). Total: <=3
 * ocorrências da string `TerritorialInternalLinksSection`.
 */

describe("TerritorialResultsPageClient — bloco 'Continuar em [cidade]' único", () => {
  const filePath = join(
    process.cwd(),
    "components",
    "search",
    "TerritorialResultsPageClient.tsx"
  );
  const source = readFileSync(filePath, "utf8");

  it("renderiza <TerritorialInternalLinksSection> exatamente UMA vez", () => {
    // Procuramos uso JSX (`<TerritorialInternalLinksSection`), não menções
    // em import/comment. JSX começa com `<Nome` precedido por whitespace
    // ou `{`/`(`/início-de-linha, não por `import`.
    const jsxOpenings = source.match(/<TerritorialInternalLinksSection\b/g) || [];
    expect(jsxOpenings.length).toBe(1);
  });

  it("o uso JSX está DEPOIS da SearchResultsList (final da página)", () => {
    const resultsListIdx = source.indexOf("<SearchResultsList");
    const linksSectionIdx = source.indexOf("<TerritorialInternalLinksSection");
    expect(resultsListIdx).toBeGreaterThan(0);
    expect(linksSectionIdx).toBeGreaterThan(resultsListIdx);
  });
});
