import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error("NEXT_REDIRECT:" + path);
  }),
  requireSession: vi.fn(),
  loadDashboard: vi.fn(),
  fetchPersonal: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/account/dashboard-session", () => ({
  requirePfDashboardSession: mocks.requireSession,
  loadDashboardPayload: mocks.loadDashboard,
}));
vi.mock("@/lib/account/backend-account", () => ({
  fetchPersonalProfile: mocks.fetchPersonal,
}));
vi.mock("@/components/account/PersonalProfileForm", () => ({
  default: () => null,
}));
vi.mock("@/components/account/AccountDashboardView", () => ({
  default: () => null,
}));
vi.mock("@/components/dashboard/DashboardClientRecovery", () => ({
  DashboardClientRecovery: () => null,
}));

import ContaPfPage from "./conta/page";
import DashboardPage from "./page";

function setAccount(type: "CNPJ" | "CPF" | "pending") {
  mocks.requireSession.mockResolvedValue({
    id: "122",
    type,
    name: "Loja Teste",
    accessToken: "test-token",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rotas /dashboard com sessão CNPJ", () => {
  it("redireciona Dados pessoais ao editor correto da loja ANTES de consultar /personal", async () => {
    setAccount("CNPJ");
    await expect(ContaPfPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard-loja/dados");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard-loja/dados");
    expect(mocks.fetchPersonal).not.toHaveBeenCalled();
  });

  it("redireciona a página principal do painel PF ao painel de lojista", async () => {
    setAccount("CNPJ");
    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard-loja");
    expect(mocks.loadDashboard).not.toHaveBeenCalled();
  });

  it("preserva a consulta de Dados pessoais para conta CPF", async () => {
    setAccount("CPF");
    mocks.fetchPersonal.mockResolvedValue({
      profile: { name: "Pessoa Física", email: "pf@example.test" },
    });
    const page = await ContaPfPage();
    expect(page).toBeTruthy();
    expect(mocks.fetchPersonal).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserva /dashboard para conta CPF ou pendente", async () => {
    for (const type of ["CPF", "pending"] as const) {
      vi.clearAllMocks();
      setAccount(type);
      mocks.loadDashboard.mockResolvedValue(null);
      const page = await DashboardPage();
      expect(page).toBeTruthy();
      expect(mocks.loadDashboard).toHaveBeenCalledTimes(1);
      expect(mocks.redirect).not.toHaveBeenCalled();
    }
  });
});
