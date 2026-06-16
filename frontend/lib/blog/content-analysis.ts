// frontend/lib/blog/content-analysis.ts
//
// Análise editorial do conteúdo Markdown do Blog (Fase 4.2.2).
// Puro e testável — alimenta o contador de palavras, a estimativa de tempo de
// leitura e os alertas de SEO editorial do editor (não bloqueiam salvar).

export type BlogContentStats = {
  words: number;
  readingMinutes: number;
  hasH2: boolean;
  hasImage: boolean;
  imagesWithoutAlt: number;
  h1Count: number;
  warnings: string[];
};

// ![alt](src) — global para varrer todas as imagens do conteúdo.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Conta palavras como o backend (estimateReadingMinutes): ~200 wpm. */
export function countWords(content: string): number {
  const trimmed = String(content || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingMinutes(content: string): number {
  const words = countWords(content);
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
}

/**
 * Analisa o conteúdo e devolve estatísticas + avisos de SEO editorial.
 * Os avisos NÃO bloqueiam salvar rascunho — são orientação para o editor.
 */
export function analyzeBlogContent(content: string): BlogContentStats {
  const text = String(content || "");
  const words = countWords(text);
  const readingMinutes = estimateReadingMinutes(text);

  // ## ou # seguido de espaço+conteúdo (ambos renderizam como H2). ### não conta.
  const hasH2 = /^\s{0,3}#{1,2}\s+\S/m.test(text);
  // # isolado (H1) — reservado ao título do post.
  const h1Count = (text.match(/^\s{0,3}#(?!#)\s+\S/gm) || []).length;

  let hasImage = false;
  let imagesWithoutAlt = 0;
  for (const match of text.matchAll(IMAGE_RE)) {
    hasImage = true;
    if (!match[1].trim()) imagesWithoutAlt += 1;
  }

  const warnings: string[] = [];
  if (words > 0 && words < 300) {
    warnings.push(`Conteúdo curto: ${words} palavra(s) — ideal ≥ 300 para SEO.`);
  }
  if (!hasH2) {
    warnings.push("Sem subtítulos (##) — quebre o texto em seções para leitura e SEO.");
  }
  if (!hasImage) {
    warnings.push("Sem imagem no conteúdo — uma imagem ajuda engajamento e SEO de imagens.");
  }
  if (imagesWithoutAlt > 0) {
    warnings.push(
      `${imagesWithoutAlt} imagem(ns) sem texto alternativo (alt) — adicione para acessibilidade e SEO.`
    );
  }
  if (h1Count > 0) {
    warnings.push(
      "Evite títulos com # (H1): o título do post já é o H1 da página. Use ## para subtítulos."
    );
  }

  return { words, readingMinutes, hasH2, hasImage, imagesWithoutAlt, h1Count, warnings };
}
