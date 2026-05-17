import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Garante que os scripts de cleanup NUNCA contêm DELETE SQL.
 *
 * Pattern checado: `DELETE FROM`, `DELETE\s+ads`, etc. — qualquer indício
 * de DELETE em SQL string. Lemos o source como texto e fazemos grep.
 *
 * Os scripts arquivam via UPDATE — nunca devem usar DELETE. Esse teste é
 * a última linha de defesa contra alguém aceitar um patch que adiciona
 * DELETE sem perceber.
 */

const FILES = [
  "scripts/cleanup/archive-test-ads.mjs",
  "scripts/cleanup/restore-archived-ads.mjs",
  "scripts/cleanup/lib/archive-helpers.mjs",
  "scripts/cleanup/lib/cleanup-shared.mjs",
];

// Permite a palavra "DELETE" apenas em comentários explicativos ("não usa
// DELETE", "sem DELETE"). Quando uppercase 'DELETE' aparece numa linha
// de código (não comentário), o teste falha.
function lineIsComment(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("/**")
  );
}

function findOffendingDeleteLines(source) {
  const offenders = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineIsComment(line)) continue;
    // Detecta padrões SQL DELETE (case insensitive). Não pega 'deleted'
    // ou 'deletion' (substring match com word boundary).
    if (/\bDELETE\s+(FROM|ads|cities|users)\b/i.test(line)) {
      offenders.push({ lineNumber: i + 1, content: line.trim() });
    }
  }
  return offenders;
}

describe("Scripts de cleanup NÃO contêm DELETE SQL (proteção crítica)", () => {
  for (const relativePath of FILES) {
    it(`${relativePath} — sem DELETE em linhas de código`, () => {
      const absolute = resolve(process.cwd(), relativePath);
      const source = readFileSync(absolute, "utf8");
      const offenders = findOffendingDeleteLines(source);
      expect(offenders).toEqual([]);
    });

    it(`${relativePath} — usa UPDATE (sanity check, não está vazio)`, () => {
      const absolute = resolve(process.cwd(), relativePath);
      const source = readFileSync(absolute, "utf8");
      // Pelo menos os arquivos de SQL builder devem mencionar UPDATE.
      if (relativePath.includes("helpers") || relativePath.includes("archive-test-ads") ||
          relativePath.includes("restore-archived-ads")) {
        expect(source).toMatch(/UPDATE\s+ads/i);
      }
    });
  }

  it("findOffendingDeleteLines — detecta DELETE em código real", () => {
    const fakeSrc = `
      const sql = "SELECT * FROM ads"; // ok
      const bad = "DELETE FROM ads WHERE id = 1"; // deveria ser pego
      // DELETE este comentário pode ficar
    `;
    const offenders = findOffendingDeleteLines(fakeSrc);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].content).toMatch(/DELETE FROM ads/);
  });

  it("findOffendingDeleteLines — não confunde 'deleted'/'deletion'", () => {
    const fakeSrc = `
      const note = "ad was deleted at timestamp X";
      const flag = isDeleted ? 1 : 0;
    `;
    expect(findOffendingDeleteLines(fakeSrc)).toEqual([]);
  });
});
