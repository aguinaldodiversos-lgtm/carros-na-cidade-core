// frontend/lib/blog/markdown-toolbar-actions.ts
//
// Transformações PURAS da toolbar editorial do Blog (Fase 4.2.2).
//
// O editor de conteúdo continua sendo um <textarea> de Markdown — a toolbar
// só INSERE marcação Markdown ao redor da seleção (negrito, itálico, títulos,
// listas, citação, link, separador, imagem, MAIÚSCULAS, limpar). Nada de HTML
// livre: o que entra aqui é renderizado pelo renderer seguro (markdown.tsx).
//
// Cada função recebe e devolve um EditorSelection { value, selectionStart,
// selectionEnd } — sem tocar no DOM. O componente aplica o resultado no
// textarea e restaura a seleção. Isso mantém a lógica testável e o cursor
// previsível.

export type EditorSelection = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function selected(s: EditorSelection): string {
  return s.value.slice(s.selectionStart, s.selectionEnd);
}

/**
 * Envolve a seleção com `before`/`after` (negrito **, itálico *, código `).
 * Sem seleção, insere o placeholder já envolvido e o deixa selecionado para
 * o admin digitar por cima.
 */
export function wrapSelection(
  s: EditorSelection,
  before: string,
  after: string,
  placeholder: string
): EditorSelection {
  const inner = selected(s) || placeholder;
  const value = s.value.slice(0, s.selectionStart) + before + inner + after + s.value.slice(s.selectionEnd);
  const innerStart = s.selectionStart + before.length;
  return { value, selectionStart: innerStart, selectionEnd: innerStart + inner.length };
}

/**
 * Prefixa cada linha do bloco que contém a seleção (títulos ##/###, citação
 * >, listas - / 1.). `makePrefix(i)` permite numerar listas. Linhas vazias
 * não são prefixadas. Sem conteúdo, insere prefixo + placeholder selecionado.
 */
export function prefixLines(
  s: EditorSelection,
  makePrefix: (index: number) => string,
  placeholder: string
): EditorSelection {
  const lineStart = s.value.lastIndexOf("\n", s.selectionStart - 1) + 1;
  let lineEnd = s.value.indexOf("\n", s.selectionEnd);
  if (lineEnd === -1) lineEnd = s.value.length;

  const block = s.value.slice(lineStart, lineEnd);

  if (block.trim() === "") {
    const prefix = makePrefix(0);
    const insert = prefix + placeholder;
    const value = s.value.slice(0, lineStart) + insert + s.value.slice(lineEnd);
    const selStart = lineStart + prefix.length;
    return { value, selectionStart: selStart, selectionEnd: selStart + placeholder.length };
  }

  let visibleIndex = 0;
  const transformed = block
    .split("\n")
    .map((line) => (line.trim() === "" ? line : makePrefix(visibleIndex++) + line))
    .join("\n");

  const value = s.value.slice(0, lineStart) + transformed + s.value.slice(lineEnd);
  return { value, selectionStart: lineStart, selectionEnd: lineStart + transformed.length };
}

/**
 * Insere um bloco isolado no cursor (separador ---, imagem, CTA, FAQ, tabela),
 * garantindo linha em branco antes/depois para o renderer tratar como bloco.
 * O cursor fica logo após o bloco inserido.
 */
export function insertBlock(s: EditorSelection, block: string): EditorSelection {
  const before = s.value.slice(0, s.selectionStart);
  const after = s.value.slice(s.selectionEnd);

  let nlBefore = "";
  if (before.length > 0 && !before.endsWith("\n\n")) {
    nlBefore = before.endsWith("\n") ? "\n" : "\n\n";
  }
  let nlAfter = "";
  if (after.length > 0 && !after.startsWith("\n\n")) {
    nlAfter = after.startsWith("\n") ? "\n" : "\n\n";
  }

  const insert = nlBefore + block + nlAfter;
  const value = before + insert + after;
  const caret = before.length + nlBefore.length + block.length;
  return { value, selectionStart: caret, selectionEnd: caret };
}

/** Transforma APENAS a seleção em MAIÚSCULAS (preserva o resto do texto). */
export function uppercaseSelection(s: EditorSelection): EditorSelection {
  if (s.selectionStart === s.selectionEnd) return s;
  const upper = selected(s).toUpperCase();
  const value = s.value.slice(0, s.selectionStart) + upper + s.value.slice(s.selectionEnd);
  return { value, selectionStart: s.selectionStart, selectionEnd: s.selectionStart + upper.length };
}

/**
 * Remove marcação Markdown básica da seleção (negrito/itálico/código,
 * títulos, citação, listas; links/imagens viram o texto do rótulo).
 */
export function clearFormatting(s: EditorSelection): EditorSelection {
  if (s.selectionStart === s.selectionEnd) return s;
  const cleaned = selected(s)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "")
    .replace(/^\s{0,3}\d+[.)]\s+/gm, "");
  const value = s.value.slice(0, s.selectionStart) + cleaned + s.value.slice(s.selectionEnd);
  return { value, selectionStart: s.selectionStart, selectionEnd: s.selectionStart + cleaned.length };
}

/** Higieniza o alt (sem colchetes/quebras) e monta `![alt](url)`. */
export function buildImageMarkdown(alt: string, url: string): string {
  const safeAlt = String(alt || "")
    .replace(/[[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeUrl = String(url || "").trim();
  return `![${safeAlt}](${safeUrl})`;
}

/** Monta `[texto](url)` para o botão de link. */
export function buildLinkMarkdown(label: string, url: string): string {
  const safeLabel = String(label || "")
    .replace(/[[\]\n\r]/g, " ")
    .trim();
  const safeUrl = String(url || "").trim();
  return `[${safeLabel || safeUrl}](${safeUrl})`;
}

// ── Snippets dos blocos "desejáveis" (CTA / FAQ / tabela) ────────────────────

export const CTA_SNIPPET = [
  "## Pronto para o próximo passo?",
  "",
  "No Carros na Cidade você compara ofertas reais e fala direto com o anunciante.",
  "[Ver carros disponíveis](/comprar)",
].join("\n");

export const FAQ_SNIPPET = [
  "## Perguntas frequentes",
  "",
  "### Pergunta 1?",
  "Resposta objetiva da primeira pergunta.",
  "",
  "### Pergunta 2?",
  "Resposta objetiva da segunda pergunta.",
].join("\n");

export const TABLE_SNIPPET = [
  "| Coluna A | Coluna B |",
  "| --- | --- |",
  "| Valor 1 | Valor 2 |",
  "| Valor 3 | Valor 4 |",
].join("\n");

export const HR_SNIPPET = "---";
