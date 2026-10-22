import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => {
  const query = vi.fn();
  return { query, default: { query }, pool: { query } };
});

const db = await import("../../src/infrastructure/database/db.js");
const {
  getDealerOpportunityRights,
  isPaidOpportunityGateEnabled,
  opportunityRightsForPlan,
  requireDealerOpportunity,
} = await import("../../src/shared/middlewares/opportunities-entitlement.middleware.js");

beforeEach(() => {
  delete process.env.OPPORTUNITIES_PAID_GATE_ENABLED;
  db.query.mockReset();
});

afterEach(() => {
  delete process.env.OPPORTUNITIES_PAID_GATE_ENABLED;
});

describe("Oportunidades durante o lançamento", () => {
  it("concede ambos os direitos a CNPJ sem consulta ao banco de assinaturas", async () => {
    expect(isPaidOpportunityGateEnabled()).toBe(false);
    expect(await getDealerOpportunityRights("dealer-1")).toEqual({
      mode: "launch",
      buyers: true,
      vehicle_evaluation: true,
    });
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("Oportunidades após ativação paga", () => {
  beforeEach(() => {
    process.env.OPPORTUNITIES_PAID_GATE_ENABLED = "true";
  });

  it("mapeia somente planos canônicos, nunca o campo legado 'pro'", () => {
    expect(opportunityRightsForPlan("cnpj-store-start")).toEqual({
      buyers: false,
      vehicle_evaluation: true,
    });
    expect(opportunityRightsForPlan("cnpj-store-pro")).toEqual({
      buyers: true,
      vehicle_evaluation: true,
    });
    expect(opportunityRightsForPlan("pro")).toEqual({
      buyers: false,
      vehicle_evaluation: false,
    });
  });

  it("nega acesso sem assinatura vigente em vez de confiar em users.plan_id", async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await getDealerOpportunityRights("dealer-1")).toEqual({
      mode: "paid",
      buyers: false,
      vehicle_evaluation: false,
    });
    expect(db.query.mock.calls[0][1]).toEqual(["dealer-1"]);
    expect(db.query.mock.calls[0][0]).toContain("us.current_period_end");
    expect(db.query.mock.calls[0][0]).toContain("us.last_payment_id");
  });

  it("autoriza Start apenas para avaliação", async () => {
    db.query.mockResolvedValue({ rows: [{ plan_id: "cnpj-store-start" }] });
    expect(await getDealerOpportunityRights("dealer-1")).toEqual({
      mode: "paid",
      buyers: false,
      vehicle_evaluation: true,
    });
  });

  it("autoriza Pro para ambas as funcionalidades", async () => {
    db.query.mockResolvedValue({ rows: [{ plan_id: "cnpj-store-pro" }] });
    expect(await getDealerOpportunityRights("dealer-1")).toEqual({
      mode: "paid",
      buyers: true,
      vehicle_evaluation: true,
    });
  });

  it("a guarda recusa comprador CNPJ Start no recurso exclusivo Pro", async () => {
    db.query.mockResolvedValue({ rows: [{ plan_id: "cnpj-store-start" }] });
    const set = vi.fn();
    const next = vi.fn();
    await requireDealerOpportunity("buyers")({ user: { id: "dealer-1" } }, { set }, next);
    expect(set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, details: expect.objectContaining({
        code: "OPPORTUNITY_PLAN_REQUIRED",
      }) })
    );
  });

  it("erro de banco nunca libera acesso pago", async () => {
    db.query.mockRejectedValue(new Error("database unavailable"));
    await expect(getDealerOpportunityRights("dealer-1")).rejects.toThrow("database unavailable");
  });
});
