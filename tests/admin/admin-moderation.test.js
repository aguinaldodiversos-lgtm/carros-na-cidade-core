import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tarefa 7 — endpoints admin de moderação:
 *   approve            → PENDING_REVIEW → ACTIVE + reviewed_at + reviewed_by
 *   reject             → PENDING_REVIEW → REJECTED + rejection_reason
 *   request-correction → permanece PENDING_REVIEW + correction_requested_reason
 *
 * Aqui testamos o service. A garantia de 403 para usuário comum vem do
 * router (authMiddleware + requireAdmin), validada por testes de role
 * existentes; aqui o foco é o comportamento do domínio.
 */

vi.mock("../../src/infrastructure/database/db.js", () => {
  const queryFn = vi.fn();
  return {
    default: { query: queryFn },
    query: queryFn,
    pool: { query: queryFn },
    withTransaction: vi.fn(),
    withUserTransaction: vi.fn((_uid, fn) => fn({ query: queryFn })),
  };
});

vi.mock("../../src/modules/ads/ads.mutation-cache.js", () => ({
  invalidateAdsCachesAfterMutation: vi.fn(async () => {}),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(async () => {}),
}));

const db = await import("../../src/infrastructure/database/db.js");
const audit = await import("../../src/modules/admin/admin.audit.js");
const moderationService = await import(
  "../../src/modules/admin/moderation/admin-moderation.service.js"
);

beforeEach(() => {
  db.default.query.mockReset();
  audit.recordAdminAction.mockReset();
});

function mockSequence(rowsList) {
  let i = 0;
  db.default.query.mockImplementation(() => {
    const rows = rowsList[Math.min(i, rowsList.length - 1)] ?? [];
    i += 1;
    return Promise.resolve({ rows, rowCount: rows.length });
  });
}

describe("moderationService.approve", () => {
  it("PENDING_REVIEW → ACTIVE + grava reviewed_by/reviewed_at + invalida cache", async () => {
    mockSequence([
      [{ id: "ad-1", status: "pending_review" }], // loadAd
      [], // UPDATE
      [], // INSERT moderation_event
    ]);

    const result = await moderationService.approve("admin-id", "ad-1");
    expect(result.ok).toBe(true);
    expect(result.status).toBe("active");

    // UPDATE foi emitido com reviewed_by, reviewed_at, status=active
    const updateCall = db.default.query.mock.calls.find(([sql]) =>
      /UPDATE\s+ads\s+SET\s+status/i.test(String(sql))
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toEqual(["ad-1", "active", "admin-id"]);

    // Audit em admin_actions também
    expect(audit.recordAdminAction).toHaveBeenCalled();
  });

  it("rejeita aprovação se ad não está em PENDING_REVIEW", async () => {
    mockSequence([[{ id: "ad-1", status: "active" }]]);

    let err;
    await moderationService.approve("admin-id", "ad-1").catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
  });
});

describe("moderationService.reject", () => {
  it("PENDING_REVIEW → REJECTED com motivo obrigatório", async () => {
    mockSequence([
      [{ id: "ad-1", status: "pending_review" }],
      [],
      [],
    ]);

    const result = await moderationService.reject(
      "admin-id",
      "ad-1",
      "Foto não confere com o veículo descrito."
    );
    expect(result.status).toBe("rejected");

    const updateCall = db.default.query.mock.calls.find(([sql]) =>
      /UPDATE\s+ads\s+SET\s+status/i.test(String(sql))
    );
    expect(updateCall[1][1]).toBe("rejected");
    expect(updateCall[1][3]).toMatch(/foto/i);
  });

  it("exige motivo (string vazia → 400)", async () => {
    let err;
    await moderationService
      .reject("admin-id", "ad-1", "   ")
      .catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
  });
});

describe("moderationService.requestCorrection", () => {
  it("permanece em PENDING_REVIEW com correction_requested_reason", async () => {
    mockSequence([
      [{ id: "ad-1", status: "pending_review" }],
      [],
      [],
    ]);

    const result = await moderationService.requestCorrection(
      "admin-id",
      "ad-1",
      "Adicione foto traseira do veículo."
    );
    expect(result.status).toBe("pending_review");

    // O UPDATE NÃO troca status — só preenche correction_requested_reason.
    const updateCall = db.default.query.mock.calls.find(([sql]) =>
      /UPDATE\s+ads\s+SET\s+correction_requested_reason/i.test(String(sql))
    );
    expect(updateCall).toBeTruthy();
    expect(String(updateCall[1][1])).toMatch(/foto traseira/i);
  });
});
