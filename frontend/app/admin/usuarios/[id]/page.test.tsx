// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import AdminUsuarioDetalhe from "./page";
import type { AdminUserDetail } from "@/lib/admin/api";

/**
 * Admin U1 — detalhe de conta.
 *
 * O que trava BUG REAL:
 *   - conta com N lojas mostra as N (advertisers.user_id não é UNIQUE);
 *   - conta sem loja explica o motivo em vez de parecer erro;
 *   - a operação comercial NÃO é duplicada aqui: só existe o link para
 *     /admin/anunciantes/[advertiserId];
 *   - nenhum dado sensível na tela.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: "7" }),
}));

vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/api")>();
  return {
    ...actual,
    adminApi: { users: { list: vi.fn(), get: vi.fn() } },
  };
});

import { adminApi } from "@/lib/admin/api";
const mockGet = vi.mocked(adminApi.users.get);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: "7",
    name: "Maria Souza",
    email: "maria@example.com",
    role: "user",
    account_type: "CPF",
    plan: null,
    email_verified: true,
    locked_until: null,
    created_at: "2026-08-01T10:00:00.000Z",
    advertisers: [],
    activity: {
      advertisers_count: 0,
      ads_active_count: 0,
      ads_total_count: 0,
      purchase_intents_count: 0,
      purchase_intents_live_count: 0,
      received_offers_count: 0,
    },
    recent_purchase_intents: [],
    ...overrides,
  };
}

function resolveWith(data: AdminUserDetail) {
  mockGet.mockResolvedValue({ ok: true, data });
}

describe("/admin/usuarios/[id]", () => {
  describe("identidade", () => {
    it("mostra os dados da conta", async () => {
      resolveWith(detail({ plan: { id: "cnpj-pro", name: "Loja Profissional" } }));
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText("maria@example.com")).toBeTruthy();
      expect(screen.getByText("Loja Profissional")).toBeTruthy();
      expect(screen.getByText("Pessoa física")).toBeTruthy();
    });

    it("plano ausente é apresentado como Gratuito, não em branco", async () => {
      resolveWith(detail({ plan: null }));
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText("Gratuito")).toBeTruthy();
    });

    it("bloqueio temporário só aparece quando vigente", async () => {
      resolveWith(detail({ locked_until: null }));
      const { unmount } = render(<AdminUsuarioDetalhe />);
      await screen.findByText("maria@example.com");
      expect(screen.queryByText("Bloqueio temporário")).toBeNull();
      unmount();

      resolveWith(detail({ locked_until: "2099-01-01T00:00:00.000Z" }));
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText("Bloqueio temporário")).toBeTruthy();
    });
  });

  describe("atividade", () => {
    it("mostra os contadores das entidades fonte", async () => {
      resolveWith(
        detail({
          activity: {
            advertisers_count: 2,
            ads_active_count: 3,
            ads_total_count: 7,
            purchase_intents_count: 4,
            purchase_intents_live_count: 1,
            received_offers_count: 5,
          },
        })
      );
      render(<AdminUsuarioDetalhe />);
      await screen.findByText("Lojas");
      for (const label of [
        "Lojas",
        "Anúncios ativos",
        "Anúncios (total)",
        "Procuras",
        "Veículos recebidos",
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
      expect(screen.getByText(/1 de 4 procuras/)).toBeTruthy();
    });

    /** §26 — nada de "Venda para lojas: 0" antes de o domínio existir. */
    it("não exibe bloco de Venda para Lojas", async () => {
      resolveWith(detail());
      render(<AdminUsuarioDetalhe />);
      await screen.findByText("Lojas");
      expect(screen.queryByText(/Venda para lojas/i)).toBeNull();
    });
  });

  describe("anunciantes vinculados", () => {
    it("conta sem loja explica o motivo", async () => {
      resolveWith(detail({ advertisers: [] }));
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText(/não possui loja/i)).toBeTruthy();
      expect(screen.queryByText("Gerenciar anunciante")).toBeNull();
    });

    /** §46 — advertisers.user_id não é UNIQUE: as duas lojas têm que aparecer. */
    it("conta com 2 lojas lista as duas, cada uma com seu link", async () => {
      resolveWith(
        detail({
          advertisers: [
            {
              id: "5",
              name: "Loja A",
              company_name: "Loja A LTDA",
              status: "active",
              city: { name: "Atibaia", state: "SP" },
              created_at: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "9",
              name: "Loja B",
              company_name: null,
              status: "suspended",
              city: null,
              created_at: "2026-02-01T00:00:00.000Z",
            },
          ],
          activity: { ...detail().activity, advertisers_count: 2 },
        })
      );
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText("Loja A")).toBeTruthy();
      expect(screen.getByText("Loja B")).toBeTruthy();
      expect(screen.getByText("Atibaia/SP")).toBeTruthy();
      expect(screen.getAllByText("Gerenciar anunciante")).toHaveLength(2);
    });

    it("o link leva ao anunciante correto, endereçado por advertiserId", async () => {
      resolveWith(
        detail({
          advertisers: [
            {
              id: "42",
              name: "Loja X",
              company_name: null,
              status: "active",
              city: null,
              created_at: null,
            },
          ],
        })
      );
      render(<AdminUsuarioDetalhe />);
      fireEvent.click(await screen.findByText("Gerenciar anunciante"));
      expect(push).toHaveBeenCalledWith("/admin/anunciantes/42");
    });

    /** §23 — a operação comercial não pode ser duplicada nesta tela. */
    it("não oferece nenhuma ação comercial", async () => {
      resolveWith(
        detail({
          advertisers: [
            {
              id: "1",
              name: "Loja",
              company_name: null,
              status: "active",
              city: null,
              created_at: null,
            },
          ],
        })
      );
      render(<AdminUsuarioDetalhe />);
      // Espera pelo link (texto único); "Loja" colide com o cabeçalho da coluna.
      await screen.findByText("Gerenciar anunciante");
      for (const forbidden of [
        /suspender/i,
        /bloquear/i,
        /conceder plano/i,
        /revogar/i,
        /excluir/i,
      ]) {
        expect(screen.queryByText(forbidden)).toBeNull();
      }
    });
  });

  describe("Compradores Ativos", () => {
    it("lista as últimas procuras quando existem", async () => {
      resolveWith(
        detail({
          recent_purchase_intents: [
            {
              id: "1",
              intent_type: "specific_model",
              brand: "Volkswagen",
              model: "T-Cross",
              body_type: null,
              status: "active",
              expires_at: "2099-01-01T00:00:00.000Z",
              created_at: "2026-08-01T00:00:00.000Z",
              city: { name: "Atibaia", state: "SP" },
            },
          ],
        })
      );
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText("Volkswagen T-Cross")).toBeTruthy();
    });

    it("a seção some quando não há procuras", async () => {
      resolveWith(detail({ recent_purchase_intents: [] }));
      render(<AdminUsuarioDetalhe />);
      await screen.findByText("Lojas");
      expect(screen.queryByText(/últimas procuras/i)).toBeNull();
    });
  });

  describe("estados", () => {
    it("erro do backend é exibido", async () => {
      mockGet.mockRejectedValue(new Error("Usuário não encontrado"));
      render(<AdminUsuarioDetalhe />);
      expect(await screen.findByText(/Usuário não encontrado/)).toBeTruthy();
    });

    it("voltar leva à listagem", async () => {
      resolveWith(detail());
      render(<AdminUsuarioDetalhe />);
      fireEvent.click(await screen.findByText("← Usuários"));
      expect(push).toHaveBeenCalledWith("/admin/usuarios");
    });
  });

  it("não renderiza nenhum dado sensível", async () => {
    resolveWith(detail());
    const { container } = render(<AdminUsuarioDetalhe />);
    await screen.findByText("maria@example.com");
    const html = container.innerHTML;
    for (const label of [/CPF do usuário/i, /senha/i, /token/i, /endereço/i]) {
      expect(html).not.toMatch(label);
    }
    // "Pessoa física" é o rótulo do tipo; o NÚMERO do documento não aparece.
    expect(within(container).queryByText(/\d{11}/)).toBeNull();
  });
});
