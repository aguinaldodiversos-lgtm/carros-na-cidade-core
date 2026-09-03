// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CatalogPagination } from "@/components/buy/CatalogPagination";

afterEach(cleanup);

/**
 * A paginação era `<button onClick>` — sem `href`, sem `<a>`. Para o Googlebot
 * a página 2 não existia, e o único caminho de descoberta dos anúncios que não
 * cabem na primeira página era o sitemap. Como o catálogo é ordenado por
 * relevância comercial, o invisível era justamente o acervo antigo.
 *
 * O builder de href é injetado: aqui ele reproduz o contrato real (página 1 =
 * URL limpa) para que os testes cubram a regra, não a implementação do caller.
 */
const CIDADE = "/carros-em/atibaia-sp";

function buildHref(page: number): string {
  return page >= 2 ? `${CIDADE}?page=${page}` : CIDADE;
}

function links(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll("a"));
}

describe("CatalogPagination — links rastreáveis", () => {
  it("números de página são <a href>, não button", () => {
    render(<CatalogPagination page={1} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    const hrefs = links().map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`${CIDADE}?page=2`);
    expect(hrefs).toContain(`${CIDADE}?page=5`);
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });

  it("próxima tem href e rel=next", () => {
    render(<CatalogPagination page={2} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    const next = screen.getByLabelText("Próxima página");
    expect(next.tagName).toBe("A");
    expect(next.getAttribute("href")).toBe(`${CIDADE}?page=3`);
    expect(next.getAttribute("rel")).toBe("next");
  });

  it("anterior tem href e rel=prev", () => {
    render(<CatalogPagination page={3} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    const prev = screen.getByLabelText("Página anterior");
    expect(prev.tagName).toBe("A");
    expect(prev.getAttribute("href")).toBe(`${CIDADE}?page=2`);
    expect(prev.getAttribute("rel")).toBe("prev");
  });

  it("a página atual é marcada com aria-current e não é link", () => {
    render(<CatalogPagination page={3} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    const atual = document.querySelector('[aria-current="page"]');
    expect(atual?.textContent).toBe("3");
    expect(atual?.tagName).not.toBe("A");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});

describe("CatalogPagination — URLs inválidas nunca viram link", () => {
  it("não emite ?page=1 — a página 1 é a URL limpa", () => {
    render(<CatalogPagination page={3} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    const hrefs = links().map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain(CIDADE);
    expect(hrefs.some((h) => h.includes("page=1"))).toBe(false);
  });

  it("na página 1, anterior não é link (não existe page=0)", () => {
    render(<CatalogPagination page={1} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    expect(screen.queryByLabelText("Página anterior")).toBeNull();
    const hrefs = links().map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("page=0") || h.includes("page=-"))).toBe(false);
  });

  it("na última página, próxima não é link", () => {
    render(<CatalogPagination page={5} totalPages={5} buildHref={buildHref} onPatch={vi.fn()} />);

    expect(screen.queryByLabelText("Próxima página")).toBeNull();
    const hrefs = links().map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("page=6"))).toBe(false);
  });

  it("nenhum link aponta para além da última página", () => {
    render(<CatalogPagination page={2} totalPages={3} buildHref={buildHref} onPatch={vi.fn()} />);

    for (const href of links().map((a) => a.getAttribute("href") ?? "")) {
      const match = /page=(\d+)/.exec(href);
      if (match) expect(Number(match[1])).toBeLessThanOrEqual(3);
    }
  });

  it.each([0, -3, Number.NaN])("page=%s vindo da URL é saneado para 1", (pageBruta) => {
    render(
      <CatalogPagination
        page={pageBruta as number}
        totalPages={4}
        buildHref={buildHref}
        onPatch={vi.fn()}
      />
    );

    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("1");
    expect(screen.queryByLabelText("Página anterior")).toBeNull();
  });

  it("page acima do total é saneado para a última", () => {
    render(<CatalogPagination page={99} totalPages={4} buildHref={buildHref} onPatch={vi.fn()} />);

    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("4");
    expect(screen.queryByLabelText("Próxima página")).toBeNull();
  });

  it("não renderiza nada com uma página só", () => {
    const { container } = render(
      <CatalogPagination page={1} totalPages={1} buildHref={buildHref} onPatch={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("CatalogPagination — filtros preservados no href", () => {
  it("o href sai do builder do caller, com os filtros ativos", () => {
    const comFiltro = (page: number) =>
      page >= 2 ? `${CIDADE}?brand=Honda&page=${page}` : `${CIDADE}?brand=Honda`;

    render(<CatalogPagination page={1} totalPages={3} buildHref={comFiltro} onPatch={vi.fn()} />);

    for (const href of links().map((a) => a.getAttribute("href") ?? "")) {
      expect(href).toContain("brand=Honda");
    }
  });

  it("a cidade do href é a do caller — nenhuma cidade fixa no componente", () => {
    const outraCidade = (page: number) =>
      page >= 2
        ? `/carros-em/braganca-paulista-sp?page=${page}`
        : "/carros-em/braganca-paulista-sp";

    render(<CatalogPagination page={1} totalPages={3} buildHref={outraCidade} onPatch={vi.fn()} />);

    for (const href of links().map((a) => a.getAttribute("href") ?? "")) {
      expect(href).toContain("braganca-paulista-sp");
      expect(href).not.toContain("atibaia");
    }
  });
});

describe("CatalogPagination — navegação client-side continua", () => {
  it("o clique chama onPatch com a página alvo", async () => {
    const onPatch = vi.fn();
    render(<CatalogPagination page={1} totalPages={5} buildHref={buildHref} onPatch={onPatch} />);

    screen.getByLabelText("Página 3").click();
    expect(onPatch).toHaveBeenCalledWith({ page: 3 });
  });

  it("o href do link clicado bate com o destino do onPatch", () => {
    const onPatch = vi.fn();
    render(<CatalogPagination page={1} totalPages={5} buildHref={buildHref} onPatch={onPatch} />);

    const link = screen.getByLabelText("Página 4");
    expect(link.getAttribute("href")).toBe(buildHref(4));
    link.click();
    expect(onPatch).toHaveBeenCalledWith({ page: 4 });
  });
});

/**
 * Fase 5.0B — o paginador como ENCERRAMENTO VISUAL.
 *
 * `/carros-em/[slug]` perdeu os blocos pós-catálogo. Sem eles, o último card
 * emendava direto no rodapé, sem nenhum sinal de que a lista tinha acabado. O
 * paginador de uma página passa a ser esse sinal — mas continua sendo apenas
 * isso: não navega, não vira link, e acima de tudo NÃO emite `?page=1`, que
 * seria uma segunda grafia da vitrine.
 */
describe("CatalogPagination — página única (showSinglePage)", () => {
  it("por padrão continua invisível com uma página só", () => {
    const { container } = render(
      <CatalogPagination page={1} totalPages={1} buildHref={buildHref} onPatch={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("com showSinglePage, renderiza ‹ 1 ›", () => {
    render(
      <CatalogPagination
        page={1}
        totalPages={1}
        buildHref={buildHref}
        onPatch={vi.fn()}
        showSinglePage
      />
    );

    expect(screen.getByRole("navigation", { name: /pagina|paginação/i })).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("com uma página, NENHUM href é emitido — nem `?page=1`", () => {
    render(
      <CatalogPagination
        page={1}
        totalPages={1}
        buildHref={buildHref}
        onPatch={vi.fn()}
        showSinglePage
      />
    );

    expect(links()).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("page=1");
  });

  it("a página atual é aria-current e não é link", () => {
    render(
      <CatalogPagination
        page={1}
        totalPages={1}
        buildHref={buildHref}
        onPatch={vi.fn()}
        showSinglePage
      />
    );

    const atual = document.querySelector('[aria-current="page"]');
    expect(atual?.textContent).toBe("1");
    expect(atual?.tagName).toBe("SPAN");
  });

  it("as duas setas ficam desabilitadas (span, não <a>)", () => {
    const { container } = render(
      <CatalogPagination
        page={1}
        totalPages={1}
        buildHref={buildHref}
        onPatch={vi.fn()}
        showSinglePage
      />
    );

    // 2 setas + o número, todos como <span>; zero <a> e zero <button>.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll('[rel="prev"], [rel="next"]')).toHaveLength(0);
  });

  it("showSinglePage NÃO altera o comportamento com várias páginas", () => {
    render(
      <CatalogPagination
        page={2}
        totalPages={3}
        buildHref={buildHref}
        onPatch={vi.fn()}
        showSinglePage
      />
    );

    const hrefs = links().map((a) => a.getAttribute("href"));
    // Página 1 continua limpa; 2 é a atual (sem link); 3 recebe `?page=3`.
    expect(hrefs).toContain(CIDADE);
    expect(hrefs).toContain(`${CIDADE}?page=3`);
    expect(hrefs).not.toContain(`${CIDADE}?page=1`);
    expect(document.querySelector('[rel="prev"]')?.getAttribute("href")).toBe(CIDADE);
    expect(document.querySelector('[rel="next"]')?.getAttribute("href")).toBe(`${CIDADE}?page=3`);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("2");
  });
});
