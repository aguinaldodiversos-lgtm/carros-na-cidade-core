// frontend/lib/blog/markdown.tsx
//
// Renderer de Markdown SIMPLES e SEGURO para o conteúdo do Blog (Fase 4.2).
//
// Por que um renderer próprio em vez de react-markdown/marked?
//   - O CMS aceita um subconjunto deliberadamente pequeno (parágrafos,
//     subtítulos ##/###, listas, links, negrito/itálico, citações) — um
//     editor textarea simples não produz mais que isso.
//   - Zero dependências novas e zero superfície de XSS: a saída são
//     elementos React (texto vira text node, escapado pelo React). NUNCA
//     usamos dangerouslySetInnerHTML para conteúdo vindo do banco.
//   - HTML bruto digitado no conteúdo aparece como texto literal — seguro
//     por construção.
//
// Links: apenas caminho interno (/...), http:// e https://. Qualquer outro
// esquema (javascript:, data:, file:, vbscript:…) é renderizado como texto
// puro. O backend também rejeita esses esquemas ao salvar (defesa dupla).

import React, { type ReactNode } from "react";

const SAFE_LINK_RE = /^(https?:\/\/|\/(?!\/))/i;

/** true quando o href é seguro para virar <a>. Exportado para testes. */
export function isSafeMarkdownHref(href: string): boolean {
  return SAFE_LINK_RE.test(String(href || "").trim());
}

type InlinePattern = {
  re: RegExp;
  render: (
    match: RegExpMatchArray,
    key: string,
    recurse: (t: string, k: string) => ReactNode[]
  ) => ReactNode;
};

// Ordem importa: code antes de bold/italic (conteúdo de `code` é literal),
// link antes de bold para não quebrar colchetes com asteriscos dentro.
const INLINE_PATTERNS: InlinePattern[] = [
  {
    re: /`([^`]+)`/,
    render: (m, key) => (
      <code key={key} className="rounded bg-cnc-bg px-1 py-0.5 text-[0.92em] text-cnc-text-strong">
        {m[1]}
      </code>
    ),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    render: (m, key, recurse) => {
      const label = m[1];
      const href = m[2].trim();
      if (!isSafeMarkdownHref(href)) {
        // Esquema não permitido → texto literal (sem link).
        return <span key={key}>{label}</span>;
      }
      const isExternal = /^https?:\/\//i.test(href);
      return (
        <a
          key={key}
          href={href}
          className="font-semibold text-primary underline-offset-2 hover:underline"
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        >
          {recurse(label, `${key}-l`)}
        </a>
      );
    },
  },
  {
    re: /\*\*([^*]+)\*\*/,
    render: (m, key, recurse) => <strong key={key}>{recurse(m[1], `${key}-b`)}</strong>,
  },
  {
    re: /\*([^*]+)\*/,
    render: (m, key, recurse) => <em key={key}>{recurse(m[1], `${key}-i`)}</em>,
  },
];

/** Converte texto com marcação inline em nós React (escapados). */
export function parseInline(text: string, keyPrefix = "in"): ReactNode[] {
  if (!text) return [];

  let earliest: { index: number; match: RegExpMatchArray; pattern: InlinePattern } | null = null;
  for (const pattern of INLINE_PATTERNS) {
    const match = text.match(pattern.re);
    if (match && match.index !== undefined) {
      if (!earliest || match.index < earliest.index) {
        earliest = { index: match.index, match, pattern };
      }
    }
  }

  if (!earliest) return [text];

  const { index, match, pattern } = earliest;
  const before = text.slice(0, index);
  const after = text.slice(index + match[0].length);
  const out: ReactNode[] = [];
  if (before) out.push(before);
  out.push(pattern.render(match, `${keyPrefix}-${index}`, parseInline));
  out.push(...parseInline(after, `${keyPrefix}-${index + match[0].length}`));
  return out;
}

type Block =
  | { type: "h2" | "h3" | "p" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] };

/** Quebra o markdown em blocos (parágrafos separados por linha em branco). */
function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const chunks = String(content || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/);

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const isUl = lines.every((l) => /^[-*]\s+/.test(l));
    const isOl = lines.every((l) => /^\d+[.)]\s+/.test(l));

    if (isUl) {
      blocks.push({ type: "ul", items: lines.map((l) => l.replace(/^[-*]\s+/, "")) });
      continue;
    }
    if (isOl) {
      blocks.push({ type: "ol", items: lines.map((l) => l.replace(/^\d+[.)]\s+/, "")) });
      continue;
    }

    // Headings/citações podem vir colados a um parágrafo no mesmo chunk —
    // processa linha a linha agrupando texto corrido.
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length > 0) {
        blocks.push({ type: "p", text: paragraph.join(" ") });
        paragraph = [];
      }
    };
    for (const line of lines) {
      if (/^###\s+/.test(line)) {
        flush();
        blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
      } else if (/^##?\s+/.test(line)) {
        // `#` vira h2 também — a página já tem um único h1 (título do post).
        flush();
        blocks.push({ type: "h2", text: line.replace(/^##?\s+/, "") });
      } else if (/^>\s*/.test(line)) {
        flush();
        blocks.push({ type: "quote", text: line.replace(/^>\s*/, "") });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }

  return blocks;
}

/**
 * Renderiza o markdown do post como árvore React.
 * Tipografia alinhada ao design system (cnc-*).
 */
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const key = `md-${i}`;
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={key}
                className="mt-7 text-[19px] font-extrabold leading-tight text-cnc-text-strong first:mt-0 sm:text-[22px]"
              >
                {parseInline(block.text, key)}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={key}
                className="mt-5 text-[16px] font-bold leading-tight text-cnc-text-strong sm:text-[18px]"
              >
                {parseInline(block.text, key)}
              </h3>
            );
          case "ul":
            return (
              <ul
                key={key}
                className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-cnc-text sm:text-[16px]"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{parseInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={key}
                className="mt-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-cnc-text sm:text-[16px]"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{parseInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="mt-4 border-l-4 border-primary/40 pl-4 text-[15px] italic leading-relaxed text-cnc-muted sm:text-[16px]"
              >
                {parseInline(block.text, key)}
              </blockquote>
            );
          default:
            return (
              <p
                key={key}
                className="mt-4 text-[15px] leading-relaxed text-cnc-text first:mt-0 sm:text-[16px]"
              >
                {parseInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
