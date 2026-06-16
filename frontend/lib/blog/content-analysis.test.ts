import { describe, expect, it } from "vitest";

import { analyzeBlogContent, countWords, estimateReadingMinutes } from "@/lib/blog/content-analysis";

describe("countWords / estimateReadingMinutes", () => {
  it("conta palavras e estima tempo de leitura (~200 wpm)", () => {
    expect(countWords("uma duas três")).toBe(3);
    expect(countWords("   ")).toBe(0);
    expect(estimateReadingMinutes("")).toBe(0);
    const words = Array.from({ length: 450 }, () => "palavra").join(" ");
    expect(countWords(words)).toBe(450);
    expect(estimateReadingMinutes(words)).toBe(3); // ceil(450/200)
  });
});

describe("analyzeBlogContent · avisos editoriais", () => {
  it("avisa conteúdo curto (< 300 palavras)", () => {
    const r = analyzeBlogContent("## Título\n\nTexto curto com imagem ![a](https://x/a.webp).");
    expect(r.warnings.some((w) => w.includes("curto"))).toBe(true);
  });

  it("avisa ausência de H2", () => {
    const r = analyzeBlogContent("Apenas um parágrafo sem subtítulo.");
    expect(r.hasH2).toBe(false);
    expect(r.warnings.some((w) => w.includes("subtítulos"))).toBe(true);
  });

  it("detecta H2 com ## e não confunde ### com H2 ausente", () => {
    expect(analyzeBlogContent("## Seção\n\ntexto").hasH2).toBe(true);
    expect(analyzeBlogContent("# Título único\n\ntexto").hasH2).toBe(true);
  });

  it("avisa ausência de imagem", () => {
    const r = analyzeBlogContent("## Seção\n\nSó texto, sem imagem.");
    expect(r.hasImage).toBe(false);
    expect(r.warnings.some((w) => w.includes("Sem imagem"))).toBe(true);
  });

  it("conta imagens sem alt e avisa", () => {
    const r = analyzeBlogContent("![](https://x/a.webp) e ![ok](https://x/b.webp)");
    expect(r.hasImage).toBe(true);
    expect(r.imagesWithoutAlt).toBe(1);
    expect(r.warnings.some((w) => w.includes("sem texto alternativo"))).toBe(true);
  });

  it("avisa uso de # (H1) no conteúdo", () => {
    const r = analyzeBlogContent("# Não use H1 aqui\n\n## Use H2");
    expect(r.h1Count).toBe(1);
    expect(r.warnings.some((w) => w.includes("H1"))).toBe(true);
  });

  it("conteúdo completo e longo não dispara avisos estruturais", () => {
    const body = Array.from({ length: 320 }, () => "palavra").join(" ");
    const content = `## Introdução\n\n${body}\n\n![carro](https://x/a.webp)`;
    const r = analyzeBlogContent(content);
    expect(r.hasH2).toBe(true);
    expect(r.hasImage).toBe(true);
    expect(r.h1Count).toBe(0);
    expect(r.warnings).toHaveLength(0);
  });
});
