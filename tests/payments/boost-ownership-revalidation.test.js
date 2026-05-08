import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Defesa em profundidade no webhook de boost.
 *
 * `applyBoostApproval` é chamada DENTRO da transação do webhook, depois
 * que o caller já fez `FOR UPDATE` no intent + checou idempotência. Aqui
 * confirmamos que, MESMO COM intent aprovado, o destaque NÃO é aplicado
 * quando o ad:
 *   1. não existe;
 *   2. está deletado;
 *   3. mudou de dono entre o checkout e a confirmação MP.
 *
 * `createBoostCheckout` já valida ownership no início (via getOwnedAd),
 * mas o checkout e a confirmação são assíncronos — alguém pode
 * transferir o ad ou o ad pode ser soft-deleted nesse intervalo.
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
  listBoostOptions: vi.fn(() => []),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

const { applyBoostApproval } = await import(
  "../../src/modules/payments/payments.service.js"
);

function makeClient(rows) {
  return {
    query: vi.fn().mockImplementation((sql) => {
      const isOwnerCheck = String(sql).includes("FROM ads a");
      if (isOwnerCheck) {
        return Promise.resolve({ rows, rowCount: rows.length });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
  };
}

beforeEach(() => {
  // noop — fresh client per test.
});

describe("applyBoostApproval — revalidação de vínculo dono↔ad↔intent", () => {
  it("rejeita silenciosamente quando ad não existe", async () => {
    const client = makeClient([]);
    const result = await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad-deleted",
      metadata: { boost_days: "7" },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("ad_not_found");
    // O UPDATE de highlight_until NÃO pode ter sido emitido:
    const calls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((s) => /UPDATE\s+ads/.test(s))).toBe(false);
  });

  it("rejeita quando ad está deletado", async () => {
    const client = makeClient([
      { id: "ad-1", status: "deleted", advertiser_user_id: "u1" },
    ]);
    const result = await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad-1",
      metadata: { boost_days: "7" },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("ad_deleted");
    const calls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((s) => /UPDATE\s+ads/.test(s))).toBe(false);
  });

  it("rejeita quando o pagador não é mais dono do anúncio", async () => {
    const client = makeClient([
      { id: "ad-1", status: "active", advertiser_user_id: "outro-user" },
    ]);
    const result = await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "pagador-original",
      ad_id: "ad-1",
      metadata: { boost_days: "7" },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("ownership_mismatch");
    const calls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((s) => /UPDATE\s+ads/.test(s))).toBe(false);
  });

  it("aplica o destaque quando todas as checagens passam", async () => {
    const client = makeClient([
      { id: "ad-1", status: "active", advertiser_user_id: "pagador-original" },
    ]);
    const result = await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "pagador-original",
      ad_id: "ad-1",
      metadata: { boost_days: "7" },
    });
    expect(result.applied).toBe(true);
    const calls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((s) => /UPDATE\s+ads/.test(s))).toBe(true);
  });

  it("é no-op quando boost_days=0 (early return)", async () => {
    const client = makeClient([]);
    const result = await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad-1",
      metadata: { boost_days: "0" },
    });
    expect(result.applied).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });
});
