// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AccountPlanCard from "./AccountPlanCard";
import type { DashboardPayload } from "@/lib/dashboard-types";

/**
 * Fase B — regra condicional do card "MEU PLANO". O que trava BUG REAL:
 *   - "Cancelar plano" só aparece com plano PAGO de LOJISTA
 *     (billing_model !== 'free'). PF nunca vê "cancelar" (não tem assinatura
 *     paga a cancelar) — nem mesmo se o plano vier pago por acaso.
 *   - "Fazer upgrade" sempre presente; PF aponta para /planos, lojista para
 *     /dashboard-loja/plano.
 * Não testa visual — só a presença/ausência das ações e o destino.
 */

vi.mock("@/lib/dashboard/fetch-dashboard-me-client", () => ({
  fetchDashboardPayloadClient: vi.fn(),
}));

import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
const mockFetch = vi.mocked(fetchDashboardPayloadClient);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePayload(
  planName: string,
  billingModel: "free" | "one_time" | "monthly"
): DashboardPayload {
  return {
    ok: true,
    user: { id: "127", name: "Teste", email: "t@x.com", type: "CNPJ", cnpj_verified: true },
    current_plan: { id: "cnpj-store-start", name: planName, ad_limit: 20, billing_model: billingModel },
    stats: {
      active_ads: 1,
      paused_ads: 0,
      featured_ads: 0,
      total_views: 0,
      free_limit: 0,
      plan_limit: 20,
      available_limit: 19,
      plan_name: planName,
      is_verified_store: true,
    },
    active_ads: [],
    paused_ads: [],
    boost_options: [],
  };
}

function mockPayload(payload: DashboardPayload) {
  mockFetch.mockResolvedValue({ ok: true, status: 200, payload });
}

describe("AccountPlanCard — ações condicionais por plano/variant", () => {
  it("lojista PAGO (monthly): mostra Editar, Upgrade e Cancelar", async () => {
    mockPayload(makePayload("Loja Start", "monthly"));
    render(<AccountPlanCard variant="lojista" basePath="/dashboard-loja" />);

    // Espera o card resolver (sai do skeleton).
    expect(await screen.findByTestId("account-plan-card")).toBeTruthy();
    expect(screen.getByTestId("account-plan-cancel")).toBeTruthy();
    expect(screen.getByTestId("account-plan-upgrade")).toBeTruthy();
    expect(screen.getByText("Editar plano")).toBeTruthy();
    expect(screen.getByTestId("account-plan-cancel").getAttribute("href")).toBe(
      "/dashboard-loja/plano"
    );
  });

  it("lojista GRATUITO (free): mostra só Upgrade, NÃO mostra Cancelar nem Editar", async () => {
    mockPayload(makePayload("Grátis", "free"));
    render(<AccountPlanCard variant="lojista" basePath="/dashboard-loja" />);

    expect(await screen.findByTestId("account-plan-card")).toBeTruthy();
    expect(screen.getByTestId("account-plan-upgrade")).toBeTruthy();
    expect(screen.queryByTestId("account-plan-cancel")).toBeNull();
    expect(screen.queryByText("Editar plano")).toBeNull();
  });

  it("particular (PF) gratuito: só Upgrade → /planos, SEM Cancelar", async () => {
    mockPayload(makePayload("Grátis", "free"));
    render(<AccountPlanCard variant="pf" basePath="/dashboard" />);

    const upgrade = await screen.findByTestId("account-plan-upgrade");
    expect(upgrade.getAttribute("href")).toBe("/planos");
    expect(screen.queryByTestId("account-plan-cancel")).toBeNull();
    expect(screen.queryByText("Editar plano")).toBeNull();
  });

  it("PF NUNCA mostra Cancelar mesmo se o plano vier pago (trava bug: PF vendo cancelar)", async () => {
    mockPayload(makePayload("Loja Start", "monthly"));
    render(<AccountPlanCard variant="pf" basePath="/dashboard" />);

    expect(await screen.findByTestId("account-plan-card")).toBeTruthy();
    expect(screen.queryByTestId("account-plan-cancel")).toBeNull();
  });

  it("falha na leitura: degrada para atalho, sem quebrar", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, message: "backend down" });
    render(<AccountPlanCard variant="lojista" basePath="/dashboard-loja" />);

    // Sem card cheio, mas com o link de gestão do plano.
    expect(await screen.findByText("Ver plano e cobranças")).toBeTruthy();
    expect(screen.queryByTestId("account-plan-cancel")).toBeNull();
  });
});
