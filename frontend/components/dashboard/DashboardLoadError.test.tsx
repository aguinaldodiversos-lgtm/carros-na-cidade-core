// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardLoadError } from "./DashboardLoadError";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/auth/client-session-reset", () => ({
  clearClientAuthArtifacts: vi.fn(),
}));

describe("DashboardLoadError", () => {
  afterEach(() => {
    cleanup();
  });

  it("mostra indisponibilidade real sem mensagem enganosa de sessao reconhecida", () => {
    render(<DashboardLoadError kind="unavailable" status={502} />);

    expect(screen.getByText("Painel indisponivel")).toBeTruthy();
    expect(screen.getByText(/Nao conseguimos buscar os dados/)).toBeTruthy();
    expect(screen.queryByText(/Sua sessao foi reconhecida/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("mostra acesso negado para 403 sem retry de indisponibilidade", () => {
    render(<DashboardLoadError kind="forbidden" status={403} />);

    expect(screen.getByText("Acesso negado")).toBeTruthy();
    expect(screen.getByText(/Esta conta nao pode acessar este painel/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.getByRole("link", { name: "Entrar com outra conta" }).getAttribute("href")).toBe(
      "/login?next=%2Fdashboard"
    );
  });
});
