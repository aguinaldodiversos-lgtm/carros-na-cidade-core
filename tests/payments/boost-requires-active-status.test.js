import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tarefa 9 — boost só pode ser comprado/aplicado em ACTIVE.
 *
 * Cobre:
 *   - createBoostCheckout rejeita pending_review / rejected / paused.
 *   - applyBoostApproval no webhook NÃO aplica destaque para status != active
 *     (mesmo que o intent já tenha sido aprovado pelo MP).
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getAccountUser: vi.fn(),
  getOwnedAd: vi.fn(),
  getPlanById: vi.fn(),
  isEventPlanId: vi.fn(() => false),
  listBoostOptions: vi.fn(() => [
    { id: "boost-7d", days: 7, price: 39.9, label: "Destaque 7 dias" },
  ]),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

const account = await import("../../src/modules/account/account.service.js");
const { createBoostCheckout, applyBoostApproval } = await import(
  "../../src/modules/payments/payments.service.js"
);

beforeEach(() => {
  account.getAccountUser.mockReset();
  account.getOwnedAd.mockReset();
});

function makeClientWithAd(adRow) {
  return {
    query: vi.fn().mockImplementation((sql) => {
      if (String(sql).includes("FROM ads a")) {
        return Promise.resolve({ rows: [adRow], rowCount: adRow ? 1 : 0 });
      }
      return Promise.resolve({ rowCount: 1, rows: [] });
    }),
  };
}

describe("createBoostCheckout — exige ACTIVE", () => {
  for (const blockedStatus of [
    "pending_review",
    "rejected",
    "paused",
    "sold",
    "expired",
    "blocked",
  ]) {
    it(`rejeita checkout para ad em status '${blockedStatus}'`, async () => {
      account.getAccountUser.mockResolvedValue({ id: "u1", email: "u@x" });
      account.getOwnedAd.mockResolvedValue({
        id: "ad1",
        title: "Civic",
        status: blockedStatus,
      });

      let err;
      await createBoostCheckout({
        userId: "u1",
        adId: "ad1",
        boostOptionId: "boost-7d",
        successUrl: "http://x/ok",
        failureUrl: "http://x/fail",
        pendingUrl: "http://x/pend",
      }).catch((e) => (err = e));

      expect(err).toBeTruthy();
      expect(err.statusCode).toBe(400);
      expect(String(err.message)).toMatch(/ativo/i);
    });
  }

  it("aceita checkout para ad ACTIVE (caminho feliz)", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1", email: "u@x" });
    account.getOwnedAd.mockResolvedValue({
      id: "ad1",
      title: "Civic",
      status: "active",
    });

    const result = await createBoostCheckout({
      userId: "u1",
      adId: "ad1",
      boostOptionId: "boost-7d",
      successUrl: "http://x/ok",
      failureUrl: "http://x/fail",
      pendingUrl: "http://x/pend",
    });

    expect(result.context).toBe("ad_boost");
  });
});

describe("applyBoostApproval — webhook bloqueia status != ACTIVE", () => {
  for (const blockedStatus of [
    "pending_review",
    "rejected",
    "paused",
    "sold",
    "expired",
    "blocked",
  ]) {
    it(`não aplica destaque para ad em '${blockedStatus}' (mesmo aprovado pelo MP)`, async () => {
      const client = makeClientWithAd({
        id: "ad1",
        status: blockedStatus,
        advertiser_user_id: "u1",
      });

      const result = await applyBoostApproval(client, {
        id: "intent-1",
        user_id: "u1",
        ad_id: "ad1",
        metadata: { boost_days: "7" },
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toBe("boost_blocked_due_to_status");
      // Nenhum UPDATE no ads — defesa em profundidade do webhook.
      const sqls = client.query.mock.calls.map(([s]) => String(s));
      expect(sqls.some((s) => /UPDATE\s+ads/i.test(s))).toBe(false);
    });
  }
});
