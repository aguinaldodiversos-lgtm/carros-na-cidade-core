// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminAnunciantes from "./page";
import type { AdvRow } from "@/lib/admin/api";

/**
 * Hardening de /admin/anunciantes (Admin U1).
 *
 * O que trava BUG REAL:
 *   - a busca precisa VIAJAR até o backend. Ela sempre viajou; o backend é que
 *     a descartava. O teste de contrato do backend cobre o outro lado — aqui
 *     garantimos que o parâmetro continua saindo daqui;
 *   - o placeholder não pode prometer "documento", que nunca foi implementado
 *     nem sequer selecionado pela query;
 *   - a coluna PLANO tem que exibir o plano EFETIVO (users.plan_id), não o
 *     snapshot congelado em advertisers.plan — a divergência entre esta lista e
 *     o detalhe do mesmo anunciante vinha daí.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/api")>();
  return {
    ...actual,
    adminApi: { advertisers: { list: vi.fn() } },
  };
});

import { adminApi } from "@/lib/admin/api";
const mockList = vi.mocked(adminApi.advertisers.list);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function adv(overrides: Partial<AdvRow> = {}): AdvRow {
  return {
    id: 1,
    name: "Loja Atibaia",
    email: "loja@example.com",
    status: "active",
    plan: "free",
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  } as AdvRow;
}

function resolveWith(rows: AdvRow[], total = rows.length) {
  mockList.mockResolvedValue({ ok: true, data: rows, total, limit: 30, offset: 0 });
}

describe("/admin/anunciantes — hardening", () => {
  describe("busca", () => {
    it("o placeholder descreve apenas os campos realmente buscados", async () => {
      resolveWith([adv()]);
      render(<AdminAnunciantes />);
      await screen.findByText("Loja Atibaia");
      expect(screen.getByPlaceholderText("Nome, e-mail ou empresa")).toBeTruthy();
      expect(screen.queryByPlaceholderText(/documento/i)).toBeNull();
    });

    it("o termo é enviado ao backend como parâmetro search", async () => {
      resolveWith([adv()]);
      render(<AdminAnunciantes />);
      await screen.findByText("Loja Atibaia");

      fireEvent.change(screen.getByPlaceholderText("Nome, e-mail ou empresa"), {
        target: { value: "atibaia" },
      });
      fireEvent.click(screen.getByText("Buscar"));

      await waitFor(() => {
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "atibaia" }));
      });
    });
  });

  describe("coluna PLANO", () => {
    it("exibe o plano efetivo, não o snapshot de advertisers.plan", async () => {
      resolveWith([
        adv({
          plan: "free",
          effective_plan_id: "cnpj-pro-store",
          effective_plan_name: "Loja Profissional",
        }),
      ]);
      render(<AdminAnunciantes />);
      await screen.findByText("Loja Atibaia");
      const table = within(screen.getByRole("table"));
      expect(table.getByText("Loja Profissional")).toBeTruthy();
      // O snapshot congelado não pode aparecer na tela.
      expect(table.queryByText("free")).toBeNull();
    });

    it("sem plano efetivo mostra Gratuito em vez de vazio", async () => {
      resolveWith([adv({ plan: "free", effective_plan_id: null, effective_plan_name: null })]);
      render(<AdminAnunciantes />);
      await screen.findByText("Loja Atibaia");
      expect(within(screen.getByRole("table")).getByText("Gratuito")).toBeTruthy();
    });
  });

  it("a tela continua existindo e navegando para o detalhe do anunciante", async () => {
    resolveWith([adv({ id: 42 })]);
    render(<AdminAnunciantes />);
    fireEvent.click(await screen.findByText("Loja Atibaia"));
    expect(push).toHaveBeenCalledWith("/admin/anunciantes/42");
  });
});
