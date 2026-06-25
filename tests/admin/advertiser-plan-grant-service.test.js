import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(),
}));

vi.mock("../../src/modules/admin/advertisers/admin-advertisers.repository.js", () => ({
  findById: vi.fn(),
  findPlanForGrant: vi.fn(),
  findLivePaidSubscription: vi.fn(),
  getEffectivePlan: vi.fn(),
  getActiveGrant: vi.fn(),
  createGrant: vi.fn(),
  revokeGrant: vi.fn(),
  expireDueGrants: vi.fn(),
}));

import * as repo from "../../src/modules/admin/advertisers/admin-advertisers.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import {
  grantAdvertiserPlan,
  revokeAdvertiserPlan,
  resolveGrantDays,
} from "../../src/modules/admin/advertisers/advertiser-plan-grant.service.js";

const ADVERTISER = { id: "64", user_id: "u1", document_type: "CNPJ", name: "Ittmotors" };
const PRO_PLAN = {
  id: "cnpj-store-pro",
  name: "Plano Loja Pro",
  type: "CNPJ",
  is_active: true,
  billing_model: "monthly",
};

function baseGrantInput(overrides = {}) {
  return {
    planId: "cnpj-store-pro",
    durationMonths: 3,
    reasonType: "trial",
    reasonNote: "Teste gratuito de 3 meses para parceiro comercial.",
    ...overrides,
  };
}

describe("resolveGrantDays", () => {
  it("converts months to days (30/mês)", () => {
    expect(resolveGrantDays({ durationMonths: 3 })).toBe(90);
    expect(resolveGrantDays({ durationMonths: 1 })).toBe(30);
  });

  it("accepts explicit days", () => {
    expect(resolveGrantDays({ durationDays: 7 })).toBe(7);
    expect(resolveGrantDays({ durationDays: 120 })).toBe(120);
  });

  it("rejects zero / negative / absurd durations", () => {
    expect(() => resolveGrantDays({ durationMonths: 0 })).toThrow(/duration_months/);
    expect(() => resolveGrantDays({ durationMonths: 5 })).toThrow(/entre 1 e 4/);
    expect(() => resolveGrantDays({ durationDays: 0 })).toThrow(/mínimo de 1 dia/);
    expect(() => resolveGrantDays({ durationDays: 121 })).toThrow(/máximo permitido de 120/);
    expect(() => resolveGrantDays({})).toThrow(/duration_days ou duration_months/);
  });
});

describe("grantAdvertiserPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.expireDueGrants.mockResolvedValue([]);
    repo.findLivePaidSubscription.mockResolvedValue(null);
    repo.getEffectivePlan.mockResolvedValue({ plan_id: "cnpj-free-store" });
    repo.createGrant.mockResolvedValue({ user_id: "u1", plan_id: "cnpj-store-pro" });
  });

  it("grants Pro plan for 3 months, syncs subscription and audits", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue(PRO_PLAN);

    const result = await grantAdvertiserPlan("admin1", "64", baseGrantInput());

    expect(repo.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        planId: "cnpj-store-pro",
        status: "active",
        source: "admin_grant",
        grantedByAdminId: "admin1",
        reasonType: "trial",
      })
    );
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "grant_advertiser_plan",
        targetType: "advertiser",
        targetId: "64",
      })
    );
    expect(result.duration_days).toBe(90);
    expect(result.plan_id).toBe("cnpj-store-pro");
    expect(result.expires_at).toBeTruthy();
    expect(result.days_remaining).toBeGreaterThan(80);
  });

  it("grants Start plan for 1 month via duration_months", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue({
      ...PRO_PLAN,
      id: "cnpj-store-start",
      name: "Plano Loja Start",
    });

    const result = await grantAdvertiserPlan(
      "admin1",
      "64",
      baseGrantInput({ planId: "cnpj-store-start", durationMonths: 1, reasonType: "courtesy" })
    );

    expect(result.duration_days).toBe(30);
    expect(repo.createGrant).toHaveBeenCalled();
  });

  it("returns 404 when advertiser not found", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(grantAdvertiserPlan("admin1", "999", baseGrantInput())).rejects.toThrow(
      /não encontrado/
    );
    expect(repo.createGrant).not.toHaveBeenCalled();
  });

  it("returns 404 when plan not found", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue(null);
    await expect(grantAdvertiserPlan("admin1", "64", baseGrantInput())).rejects.toThrow(
      /Plano não encontrado/
    );
  });

  it("rejects inactive plan (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue({ ...PRO_PLAN, is_active: false });
    await expect(grantAdvertiserPlan("admin1", "64", baseGrantInput())).rejects.toThrow(
      /Plano inativo/
    );
  });

  it("rejects plan whose type mismatches the document (400)", async () => {
    repo.findById.mockResolvedValue({ ...ADVERTISER, document_type: "CPF" });
    repo.findPlanForGrant.mockResolvedValue(PRO_PLAN); // CNPJ plan, CPF advertiser
    await expect(grantAdvertiserPlan("admin1", "64", baseGrantInput())).rejects.toThrow(
      /incompatível/
    );
  });

  it("rejects duration_months = 0 (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    await expect(
      grantAdvertiserPlan("admin1", "64", baseGrantInput({ durationMonths: 0 }))
    ).rejects.toThrow(/duration_months/);
  });

  it("rejects duration_months > 4 (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    await expect(
      grantAdvertiserPlan("admin1", "64", baseGrantInput({ durationMonths: 5 }))
    ).rejects.toThrow(/entre 1 e 4/);
  });

  it("rejects empty reason_note (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    await expect(
      grantAdvertiserPlan("admin1", "64", baseGrantInput({ reasonNote: "   " }))
    ).rejects.toThrow(/Observação .* obrigatória/);
  });

  it("rejects invalid reason_type (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    await expect(
      grantAdvertiserPlan("admin1", "64", baseGrantInput({ reasonType: "bogus" }))
    ).rejects.toThrow(/reason_type inválido/);
  });

  it("blocks override of a live PAID subscription (409)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue(PRO_PLAN);
    repo.findLivePaidSubscription.mockResolvedValue({
      plan_id: "cnpj-store-pro",
      plan_name: "Plano Loja Pro",
    });

    await expect(grantAdvertiserPlan("admin1", "64", baseGrantInput())).rejects.toThrow(
      /assinatura paga ativa/
    );
    expect(repo.createGrant).not.toHaveBeenCalled();
  });

  it("never creates a payment (no payments repo involved)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.findPlanForGrant.mockResolvedValue(PRO_PLAN);
    await grantAdvertiserPlan("admin1", "64", baseGrantInput());
    // O fluxo só toca user_subscriptions + users (createGrant) e audita.
    // payment_id é NULL por construção (ver repo.createGrant).
    const auditCall = vi.mocked(recordAdminAction).mock.calls[0][0];
    expect(auditCall.newValue).not.toHaveProperty("payment_id");
    expect(auditCall.newValue.source).toBe("admin_grant");
  });
});

describe("revokeAdvertiserPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the active grant and audits", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.getActiveGrant.mockResolvedValue({ plan_id: "cnpj-store-pro" });
    repo.revokeGrant.mockResolvedValue({ revoked: [{ plan_id: "cnpj-store-pro" }], reverted_to: null });

    const result = await revokeAdvertiserPlan("admin1", "64", "Cliente desistiu");

    expect(repo.revokeGrant).toHaveBeenCalledWith({ userId: "u1" });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "revoke_advertiser_plan" })
    );
    expect(result.revoked_plan_id).toBe("cnpj-store-pro");
  });

  it("returns 404 when there is no active grant", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    repo.getActiveGrant.mockResolvedValue(null);
    await expect(revokeAdvertiserPlan("admin1", "64", "x")).rejects.toThrow(
      /Não há plano concedido ativo/
    );
  });

  it("requires a revocation reason (400)", async () => {
    repo.findById.mockResolvedValue(ADVERTISER);
    await expect(revokeAdvertiserPlan("admin1", "64", "   ")).rejects.toThrow(
      /Motivo da revogação/
    );
  });
});
