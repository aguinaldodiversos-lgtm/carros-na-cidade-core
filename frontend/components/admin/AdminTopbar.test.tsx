// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AdminTopbar } from "./AdminTopbar";

/**
 * O que trava BUG REAL:
 *   - "Usuários" existe e aponta para a rota certa, posicionado antes de
 *     "Anunciantes" (identidade antes de operação);
 *   - o item ativo não vaza por prefixo entre as duas rotas;
 *   - o nav é a ÚNICA região rolável. Antes da Admin U1 ele era um `flex` sem
 *     wrap, sem overflow e sem shrink — itens flex têm `min-width: auto`, não
 *     encolhem abaixo do texto, e os 14 links estouravam o container dando
 *     scroll horizontal na PÁGINA inteira no celular. O 15º item pioraria.
 *
 * jsdom não faz layout (todo elemento tem largura 0), então overflow real não é
 * observável aqui: o que este teste garante é o CONTRATO de classes que produz
 * a contenção. A verificação visual em 360/390/412/768/1440 está registrada no
 * relatório da fase.
 */

const mockPathname = vi.fn(() => "/admin");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminTopbar", () => {
  it("inclui Usuários apontando para /admin/usuarios", () => {
    render(<AdminTopbar />);
    const link = screen.getByRole("link", { name: "Usuários" });
    expect(link.getAttribute("href")).toBe("/admin/usuarios");
  });

  it("Usuários vem imediatamente antes de Anunciantes", () => {
    render(<AdminTopbar />);
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.textContent?.trim())
      .filter(Boolean);
    const users = labels.indexOf("Usuários");
    const advertisers = labels.indexOf("Anunciantes");
    expect(users).toBeGreaterThan(-1);
    expect(advertisers).toBe(users + 1);
  });

  it("mantém Anunciantes — a tela de lojas não foi substituída", () => {
    render(<AdminTopbar />);
    expect(screen.getByRole("link", { name: "Anunciantes" }).getAttribute("href")).toBe(
      "/admin/anunciantes"
    );
  });

  describe("item ativo", () => {
    it("marca Usuários em /admin/usuarios sem marcar Anunciantes", () => {
      mockPathname.mockReturnValue("/admin/usuarios");
      render(<AdminTopbar />);
      expect(screen.getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe(
        "page"
      );
      expect(
        screen.getByRole("link", { name: "Anunciantes" }).getAttribute("aria-current")
      ).toBeNull();
    });

    it("marca Usuários também no detalhe", () => {
      mockPathname.mockReturnValue("/admin/usuarios/7");
      render(<AdminTopbar />);
      expect(screen.getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe(
        "page"
      );
    });

    it("Dashboard só é ativo na raiz exata", () => {
      mockPathname.mockReturnValue("/admin/usuarios");
      render(<AdminTopbar />);
      expect(
        screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")
      ).toBeNull();
    });
  });

  describe("contenção de overflow no mobile", () => {
    it("o nav rola horizontalmente por conta própria", () => {
      render(<AdminTopbar />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("overflow-x-auto");
      // Sem `min-w-0` o flex item nunca encolhe e o overflow-x nunca ativa.
      expect(nav.className).toContain("min-w-0");
    });

    it("cada item recusa encolher e não quebra linha", () => {
      render(<AdminTopbar />);
      for (const link of screen.getAllByRole("link")) {
        if (link.textContent?.includes("Carros na Cidade")) continue;
        expect(link.className).toContain("shrink-0");
        expect(link.className).toContain("whitespace-nowrap");
      }
    });

    it("o header contém o scroll para não arrastar o body", () => {
      const { container } = render(<AdminTopbar />);
      const header = container.querySelector("header");
      expect(header?.className).toContain("overflow-hidden");
    });
  });
});
