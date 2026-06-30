import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Correção 2 — guard de duplicata vs. concessão de cortesia.
 *
 * assertNoLiveSubscriptionFor passa a bloquear (409) SÓ quando há assinatura
 * PAGA viva (source != admin_grant E payment_id/provider não-nulo). Uma
 * cortesia (admin_grant) NÃO bloqueia — o lojista de cortesia pode assinar o
 * plano pago (upgrade).
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

const db = await import("../../src/infrastructure/database/db.js");
const { assertNoLiveSubscriptionFor, findLivePaidSubscriptionForUser } = await import(
  "../../src/modules/payments/subscriptions.guards.js"
);

beforeEach(() => {
  db.query.mockReset();
});

describe("assertNoLiveSubscriptionFor — cortesia não bloqueia, paga bloqueia", () => {
  it("cortesia (admin_grant, sem payment/provider) → NÃO lança", async () => {
    // A query PAGA filtra admin_grant no SQL — retorna vazio quando só há cortesia.
    db.query.mockResolvedValue({ rows: [] });
    await expect(assertNoLiveSubscriptionFor("u1")).resolves.toBeUndefined();
  });

  it("assinatura PAGA viva (provider/payment_id) → lança 409", async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          user_id: "u1",
          plan_id: "cnpj-store-pro",
          status: "active",
          source: null,
          payment_id: "MP-1",
          provider: "mercado_pago",
        },
      ],
    });
    await expect(assertNoLiveSubscriptionFor("u1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("mensagem do 409 deixa claro que é assinatura PAGA", async () => {
    db.query.mockResolvedValue({
      rows: [{ plan_id: "cnpj-store-start", status: "active", source: null, payment_id: "MP-2" }],
    });
    await expect(assertNoLiveSubscriptionFor("u1")).rejects.toThrow(/paga ativa/i);
  });

  it("findLivePaidSubscriptionForUser: SQL exclui admin_grant e exige payment_id/provider", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await findLivePaidSubscriptionForUser("u1");

    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toMatch(/COALESCE\(source, ''\)\s*<>/i);
    expect(String(sql)).toMatch(/payment_id IS NOT NULL OR provider IS NOT NULL/i);
    expect(params).toContain("admin_grant");
    // status vivos passados como array
    expect(params.some((p) => Array.isArray(p) && p.includes("active"))).toBe(true);
  });
});
