// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountPanelShell from "./AccountPanelShell";

/**
 * Navegação dos dois painéis.
 *
 * A Fase 2 acrescentou exatamente um item por painel. O teste existe porque o
 * menu é a única porta de entrada das telas novas: a rota pode existir, a API
 * pode funcionar, e o produto continuar invisível se o item não aparecer.
 *
 * Também trava o que NÃO deve existir. Este arquivo guardava, até a Fase 4.0,
 * a ausência de "Vender para lojas" — a condição era "só aparece quando o
 * produto existir". A Fase 4.1 cumpriu essa condição (publicar, listar, ver e
 * cancelar funcionam de ponta a ponta), então a asserção foi INVERTIDA em vez de
 * apagada: o que era guarda de ausência virou guarda de presença e de rota.
 *
 * "Veículos para comprar" (área do lojista) continua sendo guarda de AUSÊNCIA —
 * é a Fase 4.2, e ainda não existe.
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

  it("mostra 'Vender para lojas' apontando para a rota certa (Fase 4.1)", () => {
    renderShell("pf");
    const links = screen.getAllByRole("link", { name: /Vender para lojas/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dashboard/vender-para-lojas");
    }
  });

  it("mantém 'Minhas procuras' e 'Vender para lojas' lado a lado", () => {
    // As duas são o par simétrico do Motor de Oportunidades ("quero comprar" e
    // "quero vender"). Se um refactor separá-las, a relação some da navegação.
    renderShell("pf");
    const labels = screen
      .getAllByRole("link")
      .map((link) => link.textContent?.trim() ?? "")
      .filter((label) => /Minhas procuras|Vender para lojas/i.test(label));

    expect(labels.length).toBeGreaterThanOrEqual(2);
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
