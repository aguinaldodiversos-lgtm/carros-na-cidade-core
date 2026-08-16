// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminUsuarios from "./page";
import type { AdminUserRow } from "@/lib/admin/api";

/**
 * Admin U1 — listagem de contas.
 *
 * O que trava BUG REAL:
 *   - conta SEM anunciante e SEM anúncio precisa aparecer (é a razão da tela);
 *   - admin não pode ser escondido;
 *   - nenhum "status Ativo" inventado, nenhuma coluna de cidade ou último
 *     acesso (dados que o schema não tem);
 *   - busca e filtros chegam ao backend como parâmetros, não como enfeite —
 *     foi exatamente esse o defeito da tela de anunciantes.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/api")>();
  return {
    ...actual,
    adminApi: { users: { list: vi.fn(), get: vi.fn() } },
  };
});

import { adminApi } from "@/lib/admin/api";
const mockList = vi.mocked(adminApi.users.list);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function user(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: "1",
    name: "Maria Souza",
    email: "maria@example.com",
    role: "user",
    account_type: "CPF",
    plan: null,
    email_verified: true,
    locked_until: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function resolveWith(rows: AdminUserRow[], total = rows.length) {
  mockList.mockResolvedValue({ ok: true, data: rows, total, limit: 30, offset: 0 });
}

describe("/admin/usuarios — listagem", () => {
  it("mostra conta sem anunciante e sem anúncio", async () => {
    resolveWith([user({ id: "10", name: "Só Cadastrou", email: "so@cadastro.com" })]);
    render(<AdminUsuarios />);
    expect(await screen.findByText("Só Cadastrou")).toBeTruthy();
    expect(screen.getByText("so@cadastro.com")).toBeTruthy();
  });

  // As consultas de rótulo são escopadas à TABELA: os <option> dos filtros
  // usam textos parecidos ("Admin", "Pendente"), e uma busca global casaria o
  // filtro em vez do badge da linha — teste verde sem provar nada.
  it("mostra conta admin com o papel visível", async () => {
    resolveWith([user({ id: "2", name: "Root", role: "admin" })]);
    render(<AdminUsuarios />);
    expect(await screen.findByText("Root")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Admin")).toBeTruthy();
  });

  it("rotula os três tipos de conta", async () => {
    resolveWith([
      user({ id: "1", name: "Pf", account_type: "CPF" }),
      user({ id: "2", name: "Pj", account_type: "CNPJ" }),
      user({ id: "3", name: "Pend", account_type: "pending" }),
    ]);
    render(<AdminUsuarios />);
    await screen.findByText("Pf");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Pessoa física")).toBeTruthy();
    expect(table.getByText("Lojista")).toBeTruthy();
    expect(table.getByText("Pendente")).toBeTruthy();
  });

  it("mostra o plano efetivo quando existe", async () => {
    resolveWith([user({ plan: { id: "cnpj-pro", name: "Loja Profissional" } })]);
    render(<AdminUsuarios />);
    expect(await screen.findByText("Loja Profissional")).toBeTruthy();
  });

  /** §9/§10 — não inventar dado que o schema não tem. */
  it("não exibe colunas de status, cidade ou último acesso", async () => {
    resolveWith([user()]);
    render(<AdminUsuarios />);
    await screen.findByText("Maria Souza");
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(headers).toEqual(["ID", "Nome", "Email", "Tipo", "Papel", "Plano", "Cadastro"]);
    expect(within(screen.getByRole("table")).queryByText("Ativo")).toBeNull();
  });

  it("sinaliza bloqueio temporário só quando vigente", async () => {
    resolveWith([
      user({ id: "1", name: "Travado", locked_until: "2099-01-01T00:00:00.000Z" }),
      user({ id: "2", name: "Livre", locked_until: null }),
    ]);
    render(<AdminUsuarios />);
    await screen.findByText("Travado");
    expect(screen.getAllByText("Bloqueio temporário")).toHaveLength(1);
  });

  it("marca e-mail não verificado", async () => {
    resolveWith([user({ email_verified: false })]);
    render(<AdminUsuarios />);
    expect(await screen.findByText("não verificado")).toBeTruthy();
  });

  describe("estados", () => {
    it("loading antes da resposta", () => {
      mockList.mockReturnValue(new Promise(() => {}));
      render(<AdminUsuarios />);
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("erro com opção de tentar de novo", async () => {
      mockList.mockRejectedValue(new Error("Backend fora do ar"));
      render(<AdminUsuarios />);
      expect(await screen.findByText(/Backend fora do ar/)).toBeTruthy();
    });

    it("vazio quando não há contas", async () => {
      resolveWith([]);
      render(<AdminUsuarios />);
      expect(await screen.findByText("Nenhum usuário encontrado")).toBeTruthy();
    });
  });

  describe("busca e filtros chegam ao backend", () => {
    it("busca é enviada como parâmetro ao clicar em Buscar", async () => {
      resolveWith([user()]);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");

      fireEvent.change(screen.getByPlaceholderText("Nome, e-mail ou ID"), {
        target: { value: "maria" },
      });
      fireEvent.click(screen.getByText("Buscar"));

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "maria" }));
      });
    });

    it("filtro de tipo é enviado como account_type", async () => {
      resolveWith([user()]);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "CNPJ" } });
      fireEvent.click(screen.getByText("Buscar"));

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ account_type: "CNPJ" }));
      });
    });

    it("filtro de papel é enviado como role", async () => {
      resolveWith([user()]);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[1], { target: { value: "admin" } });
      fireEvent.click(screen.getByText("Buscar"));

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ role: "admin" }));
      });
    });

    it("Limpar remove os filtros da próxima consulta", async () => {
      resolveWith([user()]);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");

      fireEvent.change(screen.getByPlaceholderText("Nome, e-mail ou ID"), {
        target: { value: "maria" },
      });
      fireEvent.click(screen.getByText("Buscar"));
      await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "maria" })
      ));

      fireEvent.click(screen.getByText("Limpar"));
      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith({ limit: 30, offset: 0 });
      });
    });
  });

  describe("paginação", () => {
    it("some quando cabe em uma página", async () => {
      resolveWith([user()], 1);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");
      expect(screen.queryByText(/Próximo/)).toBeNull();
    });

    it("avança o offset em múltiplos do limite", async () => {
      resolveWith([user()], 90);
      render(<AdminUsuarios />);
      await screen.findByText("Maria Souza");

      fireEvent.click(screen.getByText(/Próximo/));
      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 30 }));
      });
    });
  });

  it("clicar na linha abre o detalhe da conta", async () => {
    resolveWith([user({ id: "77" })]);
    render(<AdminUsuarios />);
    fireEvent.click(await screen.findByText("Maria Souza"));
    expect(push).toHaveBeenCalledWith("/admin/usuarios/77");
  });
});
