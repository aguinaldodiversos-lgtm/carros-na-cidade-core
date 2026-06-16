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

/**
 * Mesma política para o `src` de imagens: apenas http(s) ou caminho interno.
 * Bloqueia data:/javascript:/file:/vbscript: — uma imagem com src não seguro
 * é renderizada como texto (o alt), nunca como <img>.
 */
export function isSafeImageSrc(src: string): boolean {
  return isSafeMarkdownHref(src);
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
// imagem antes de link (![alt](url) começa no "!", antes do "[" do link),
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
    // Imagem: ![alt](src). src inseguro (data:/javascript:/file:) → texto (alt).
    re: /!\[([^\]]*)\]\(([^)\s]+)\)/,
    render: (m, key) => {
      const alt = m[1];
      const src = m[2].trim();
      if (!isSafeImageSrc(src)) {
        return <span key={key}>{alt}</span>;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={src}
          alt={alt}
          loading="lazy"
          className="mx-auto my-4 block h-auto max-w-full rounded-xl"
        />
      );
    },
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
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] };

const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;

/** Divide uma linha de tabela em células, ignorando os pipes das bordas. */
function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** true quando a linha é o separador de cabeçalho da tabela (| --- | :--: |). */
function isTableSeparator(line: string, columns: number): boolean {
  const cells = parseTableRow(line);
  return cells.length === columns && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")));
}

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

    // Tabela: 1ª linha com pipes + 2ª linha separadora (| --- | --- |).
    if (lines.length >= 2 && lines[0].includes("|")) {
      const header = parseTableRow(lines[0]);
      if (isTableSeparator(lines[1], header.length)) {
        const rows = lines.slice(2).map(parseTableRow);
        blocks.push({ type: "table", header, rows });
        continue;
      }
    }

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

    // Headings/citações/separador podem vir colados a um parágrafo no mesmo
    // chunk — processa linha a linha agrupando texto corrido.
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length > 0) {
        blocks.push({ type: "p", text: paragraph.join(" ") });
        paragraph = [];
      }
    };
    for (const line of lines) {
      if (HR_RE.test(line)) {
        flush();
        blocks.push({ type: "hr" });
      } else if (/^###\s+/.test(line)) {
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
          case "hr":
            return <hr key={key} className="mt-7 border-t border-cnc-line" />;
          case "table":
            return (
              <div key={key} className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-[14px] text-cnc-text sm:text-[15px]">
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th
                          key={`${key}-h-${j}`}
                          className="border border-cnc-line bg-cnc-bg px-3 py-2 text-left font-bold text-cnc-text-strong"
                        >
                          {parseInline(cell, `${key}-h-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={`${key}-r-${ri}`}>
                        {row.map((cell, ci) => (
                          <td
                            key={`${key}-r-${ri}-${ci}`}
                            className="border border-cnc-line px-3 py-2 align-top"
                          >
                            {parseInline(cell, `${key}-r-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
