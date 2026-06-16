// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownContent, isSafeMarkdownHref } from "./markdown";

describe("markdown · isSafeMarkdownHref", () => {
  it("aceita caminho interno e http/https", () => {
    expect(isSafeMarkdownHref("/comprar")).toBe(true);
    expect(isSafeMarkdownHref("https://example.com")).toBe(true);
    expect(isSafeMarkdownHref("http://example.com/a?b=1")).toBe(true);
  });

  it("rejeita esquemas perigosos e protocol-relative", () => {
    expect(isSafeMarkdownHref("javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownHref("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeMarkdownHref("file:///etc/passwd")).toBe(false);
    expect(isSafeMarkdownHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeMarkdownHref("//evil.com")).toBe(false);
  });
});

describe("markdown · MarkdownContent", () => {
  it("renderiza parágrafos, subtítulos e listas", () => {
    const content = [
      "## Documentação do veículo",
      "",
      "Confira o CRLV e o histórico de multas.",
      "",
      "### Checklist",
      "",
      "- Verificar chassi",
      "- Conferir quilometragem",
      "",
      "1. Agende a vistoria",
      "2. Negocie o preço",
    ].join("\n");

    const { container } = render(<MarkdownContent content={content} />);

    expect(container.querySelector("h2")?.textContent).toBe("Documentação do veículo");
    expect(container.querySelector("h3")?.textContent).toBe("Checklist");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.textContent).toContain("Confira o CRLV");
  });

  it("renderiza negrito, itálico e link seguro", () => {
    const { container } = render(
      <MarkdownContent
        content={"Texto com **destaque**, *ênfase* e [link](https://example.com)."}
      />
    );

    expect(container.querySelector("strong")?.textContent).toBe("destaque");
    expect(container.querySelector("em")?.textContent).toBe("ênfase");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("rel")).toContain("noopener");
  });

  it("link interno não ganha target _blank", () => {
    const { container } = render(
      <MarkdownContent content={"Veja [as ofertas](/comprar) da sua cidade."} />
    );
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("/comprar");
    expect(a?.getAttribute("target")).toBe(null);
  });

  it("XSS: link javascript: vira texto puro (sem <a>)", () => {
    const { container } = render(
      <MarkdownContent content={"Cuidado com [clique aqui](javascript:alert(1))."} />
    );
    expect(container.querySelector("a")).toBe(null);
    expect(container.textContent).toContain("clique aqui");
  });

  it("XSS: HTML bruto no conteúdo é escapado (nunca vira elemento)", () => {
    const { container } = render(
      <MarkdownContent content={'<script>alert("xss")</script> <img src=x onerror=alert(1)>'} />
    );
    expect(container.querySelector("script")).toBe(null);
    expect(container.querySelector("img")).toBe(null);
    // O texto literal permanece visível (escapado pelo React).
    expect(container.textContent).toContain('<script>alert("xss")</script>');
  });

  it("conteúdo vazio não renderiza blocos", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container.querySelectorAll("p, h2, h3, ul, ol")).toHaveLength(0);
  });
});

describe("markdown · imagens (Fase 4.2.2)", () => {
  it("renderiza imagem com src http(s) e alt", () => {
    const { container } = render(
      <MarkdownContent content={"![Carro usado em oferta](https://cdn.exemplo.com/carro.webp)"} />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://cdn.exemplo.com/carro.webp");
    expect(img?.getAttribute("alt")).toBe("Carro usado em oferta");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("renderiza imagem com caminho interno", () => {
    const { container } = render(<MarkdownContent content={"![Capa](/images/blog/x.webp)"} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/images/blog/x.webp");
  });

  it("imagem no meio de um parágrafo aparece como <img>", () => {
    const { container } = render(
      <MarkdownContent content={"Veja ![um carro](https://x.com/a.webp) aqui."} />
    );
    expect(container.querySelector("img")).not.toBe(null);
    expect(container.textContent).toContain("Veja");
    expect(container.textContent).toContain("aqui.");
  });

  it("XSS: imagem com src javascript: não vira <img> (mostra o alt)", () => {
    const { container } = render(
      <MarkdownContent content={"![malicioso](javascript:alert(1))"} />
    );
    expect(container.querySelector("img")).toBe(null);
    expect(container.textContent).toContain("malicioso");
  });

  it("XSS: imagem com src data: não vira <img>", () => {
    const { container } = render(
      <MarkdownContent content={"![x](data:text/html,<script>1</script>)"} />
    );
    expect(container.querySelector("img")).toBe(null);
  });

  it("XSS: imagem com src protocol-relative //evil é bloqueada", () => {
    const { container } = render(<MarkdownContent content={"![x](//evil.com/a.png)"} />);
    expect(container.querySelector("img")).toBe(null);
  });
});

describe("markdown · separador e tabela (Fase 4.2.2)", () => {
  it("renderiza --- como <hr>", () => {
    const { container } = render(<MarkdownContent content={"Antes\n\n---\n\nDepois"} />);
    expect(container.querySelector("hr")).not.toBe(null);
    expect(container.textContent).toContain("Antes");
    expect(container.textContent).toContain("Depois");
  });

  it("renderiza tabela simples (GFM) com cabeçalho e linhas", () => {
    const content = ["| Item | Valor |", "| --- | --- |", "| Pneu | R$ 400 |", "| Óleo | R$ 120 |"].join(
      "\n"
    );
    const { container } = render(<MarkdownContent content={content} />);
    expect(container.querySelectorAll("table thead th")).toHaveLength(2);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    expect(container.textContent).toContain("Pneu");
    expect(container.textContent).toContain("R$ 120");
  });

  it("conteúdo com pipes mas sem separador não vira tabela", () => {
    const { container } = render(<MarkdownContent content={"a | b | c sem separador"} />);
    expect(container.querySelector("table")).toBe(null);
    expect(container.querySelector("p")?.textContent).toContain("a | b | c");
  });
});
