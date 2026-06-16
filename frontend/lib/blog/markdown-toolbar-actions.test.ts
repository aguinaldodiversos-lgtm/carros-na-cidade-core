import { describe, expect, it } from "vitest";

import {
  buildImageMarkdown,
  buildLinkMarkdown,
  clearFormatting,
  insertBlock,
  prefixLines,
  uppercaseSelection,
  wrapSelection,
  type EditorSelection,
} from "@/lib/blog/markdown-toolbar-actions";

/** Helper: cria um EditorSelection a partir de marcadores | (cursor) ou [ ] (seleção). */
function sel(value: string, start: number, end = start): EditorSelection {
  return { value, selectionStart: start, selectionEnd: end };
}

describe("wrapSelection (negrito/itálico)", () => {
  it("envolve a seleção com ** (negrito)", () => {
    const r = wrapSelection(sel("compra segura", 0, 13), "**", "**", "texto");
    expect(r.value).toBe("**compra segura**");
    // seleção continua sobre o texto interno (não sobre os asteriscos)
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("compra segura");
  });

  it("envolve a seleção com * (itálico)", () => {
    const r = wrapSelection(sel("oferta", 0, 6), "*", "*", "texto");
    expect(r.value).toBe("*oferta*");
  });

  it("sem seleção, insere placeholder envolvido e o seleciona", () => {
    const r = wrapSelection(sel("", 0, 0), "**", "**", "texto");
    expect(r.value).toBe("**texto**");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("texto");
  });

  it("preserva o texto fora da seleção", () => {
    const r = wrapSelection(sel("antes meio depois", 6, 10), "**", "**", "x");
    expect(r.value).toBe("antes **meio** depois");
  });
});

describe("prefixLines (títulos/listas/citação)", () => {
  it("insere ## no início da linha (H2)", () => {
    const r = prefixLines(sel("Título", 0, 6), () => "## ", "Título");
    expect(r.value).toBe("## Título");
  });

  it("insere ### (H3)", () => {
    const r = prefixLines(sel("Sub", 0, 3), () => "### ", "Subtítulo");
    expect(r.value).toBe("### Sub");
  });

  it("prefixa cada linha selecionada com bullet", () => {
    const r = prefixLines(sel("item 1\nitem 2", 0, 13), () => "- ", "item");
    expect(r.value).toBe("- item 1\n- item 2");
  });

  it("numera lista ordenada por linha", () => {
    const r = prefixLines(sel("um\ndois\ntres", 0, 12), (i) => `${i + 1}. `, "item");
    expect(r.value).toBe("1. um\n2. dois\n3. tres");
  });

  it("insere citação > em linha vazia com placeholder selecionado", () => {
    const r = prefixLines(sel("", 0, 0), () => "> ", "texto citado");
    expect(r.value).toBe("> texto citado");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("texto citado");
  });

  it("prefixa apenas a linha do cursor dentro de um texto maior", () => {
    const value = "linha A\nlinha B\nlinha C";
    const r = prefixLines(sel(value, 8, 8), () => "## ", "x"); // cursor na "linha B"
    expect(r.value).toBe("linha A\n## linha B\nlinha C");
  });
});

describe("insertBlock (separador/imagem/CTA)", () => {
  it("insere --- isolado com linhas em branco ao redor", () => {
    const r = insertBlock(sel("antes", 5, 5), "---");
    expect(r.value).toBe("antes\n\n---");
  });

  it("insere imagem no meio do texto preservando o entorno", () => {
    const r = insertBlock(sel("antesdepois", 5, 5), "![alt](https://x.webp)");
    expect(r.value).toBe("antes\n\n![alt](https://x.webp)\n\ndepois");
  });

  it("textarea vazio: insere o bloco sem linhas extras", () => {
    const r = insertBlock(sel("", 0, 0), "---");
    expect(r.value).toBe("---");
  });
});

describe("uppercaseSelection", () => {
  it("transforma apenas a seleção em maiúsculas", () => {
    const r = uppercaseSelection(sel("compra segura agora", 0, 6));
    expect(r.value).toBe("COMPRA segura agora");
  });

  it("sem seleção, não altera nada", () => {
    const r = uppercaseSelection(sel("texto", 2, 2));
    expect(r.value).toBe("texto");
  });
});

describe("clearFormatting", () => {
  it("remove negrito/itálico e prefixos da seleção", () => {
    const r = clearFormatting(sel("## **Título** com *itálico*", 0, 27));
    expect(r.value).toBe("Título com itálico");
  });

  it("converte link/imagem no rótulo", () => {
    const r = clearFormatting(sel("[texto](https://x) ![alt](https://y)", 0, 36));
    expect(r.value).toBe("texto alt");
  });
});

describe("buildImageMarkdown / buildLinkMarkdown", () => {
  it("monta markdown de imagem e higieniza o alt", () => {
    expect(buildImageMarkdown("Carro [novo]\nem oferta", "https://x.webp")).toBe(
      "![Carro novo em oferta](https://x.webp)"
    );
  });

  it("monta markdown de link", () => {
    expect(buildLinkMarkdown("ver carros", "/comprar")).toBe("[ver carros](/comprar)");
  });

  it("usa a URL como rótulo quando o texto está vazio", () => {
    expect(buildLinkMarkdown("", "https://exemplo.com")).toBe(
      "[https://exemplo.com](https://exemplo.com)"
    );
  });
});
