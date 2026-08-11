// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountPanelShell from "./AccountPanelShell";

/**
 * Navegação dos dois painéis.
 *
 * A Fase 2 acrescenta exatamente um item por painel. O teste existe porque o
 * menu é a única porta de entrada das telas novas: a rota pode existir, a API
 * pode funcionar, e o produto continuar invisível se o item não aparecer.
 *
 * Também trava o que NÃO deve existir: "Vender para lojas" é Fase 3, e um item
 * de menu apontando para uma rota inexistente é pior que nenhum item.
 */

// `usePathname` para o item ativo do menu; `useRouter` porque o shell envolve
// tudo no AccountNotificationsProvider, que navega ao clicar numa notificação.
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// O sino faz fetch ao montar; o painel inteiro é envolvido pelo provider dele.
vi.mock("@/lib/notifications/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/api")>();
  return {
    ...actual,
    fetchUnreadCount: vi.fn().mockResolvedValue(0),
    fetchNotifications: vi.fn().mockResolvedValue({
      notifications: [],
      next_cursor: null,
      limit: 10,
    }),
  };
});

// O card de plano busca /api/dashboard/me ao montar.
vi.mock("@/lib/dashboard/fetch-dashboard-me-client", () => ({
  fetchDashboardPayloadClient: vi.fn().mockResolvedValue({ ok: false, status: 0 }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function renderShell(variant: "pf" | "lojista") {
  return render(
    <AccountPanelShell
      basePath={variant === "pf" ? "/dashboard" : "/dashboard-loja"}
      variant={variant}
      userName="Teste"
      accountLabel={variant === "pf" ? "CPF · Pessoa física" : "CNPJ · Lojista"}
    >
      <div>conteúdo</div>
    </AccountPanelShell>
  );
}

describe("menu do painel PF", () => {
  it("mostra 'Minhas procuras' apontando para a rota certa", () => {
    renderShell("pf");
    const links = screen.getAllByRole("link", { name: /Minhas procuras/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dashboard/minhas-procuras");
    }
  });

  it("mantém os itens que já existiam", () => {
    renderShell("pf");
    for (const label of [/Painel/i, /Meus anúncios/i, /Dados pessoais/i, /Trocar senha/i]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("NÃO mostra a área do lojista", () => {
    renderShell("pf");
    expect(screen.queryByRole("link", { name: /Oportunidades/i })).not.toBeInTheDocument();
  });

  it("NÃO mostra item morto de 'Vender para lojas' (Fase 3)", () => {
    renderShell("pf");
    expect(screen.queryByRole("link", { name: /Vender para lojas/i })).not.toBeInTheDocument();
  });
});

describe("menu do painel do lojista", () => {
  it("mostra 'Oportunidades' apontando para o hub", () => {
    renderShell("lojista");
    const links = screen.getAllByRole("link", { name: /Oportunidades/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dashboard-loja/oportunidades");
    }
  });

  it("mantém os itens que já existiam", () => {
    renderShell("lojista");
    for (const label of [
      /Painel/i,
      /Meus anúncios/i,
      /Dados da loja/i,
      /Mensagens/i,
      /Plano e cobranças/i,
    ]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("NÃO mostra 'Minhas procuras' — quem publica procura é o comprador", () => {
    renderShell("lojista");
    expect(screen.queryByRole("link", { name: /Minhas procuras/i })).not.toBeInTheDocument();
  });

  it("NÃO mostra 'Veículos para comprar' (Fase 3)", () => {
    renderShell("lojista");
    expect(screen.queryByRole("link", { name: /Veículos para comprar/i })).not.toBeInTheDocument();
  });
});
