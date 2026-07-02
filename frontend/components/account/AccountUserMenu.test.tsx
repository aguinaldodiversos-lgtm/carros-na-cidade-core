// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import AccountUserMenu from "./AccountUserMenu";

/**
 * Fase B — menu de usuário do topo. Trava o comportamento essencial:
 *   - mostra nome + tipo (accountLabel) no gatilho;
 *   - dropdown fechado por padrão; abre no clique expondo "Voltar ao site" e
 *     "Sair" (logout). Se isso quebrar, o usuário perde o acesso ao logout.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountUserMenu", () => {
  it("renderiza nome e tipo no gatilho", () => {
    render(<AccountUserMenu userName="Teste Mercado Pago" accountLabel="CNPJ · Lojista" />);
    const trigger = screen.getByTestId("account-user-menu-trigger");
    expect(trigger.textContent).toContain("Teste Mercado Pago");
    expect(trigger.textContent).toContain("CNPJ · Lojista");
  });

  it("dropdown começa fechado", () => {
    render(<AccountUserMenu userName="Teste" accountLabel="CPF · Pessoa física" />);
    expect(screen.queryByTestId("account-user-menu")).toBeNull();
  });

  it("clique abre o dropdown com 'Voltar ao site' e 'Sair'", () => {
    render(<AccountUserMenu userName="Teste" accountLabel="CPF · Pessoa física" />);
    fireEvent.click(screen.getByTestId("account-user-menu-trigger"));

    expect(screen.getByTestId("account-user-menu")).toBeTruthy();
    expect(screen.getByText("← Voltar ao site")).toBeTruthy();
    // AccountLogoutButton (reusado) renderiza o rótulo "Sair".
    expect(screen.getByTestId("logout-btn").textContent).toContain("Sair");
  });
});
