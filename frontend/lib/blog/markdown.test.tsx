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
