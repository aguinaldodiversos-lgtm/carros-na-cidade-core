import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: mocks.query, connect: mocks.connect },
}));

import {
  hideDealerReviewByAdmin,
  listDealerReviewsForAdmin,
} from "../../src/modules/admin/advertisers/admin-dealer-reviews.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

describe("moderação administrativa de avaliações", () => {
  it("lista avaliações públicas e ocultas para inspeção sem mutações", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: 12, status: "published" }] });
    const data = await listDealerReviewsForAdmin("64");
    expect(data).toEqual([{ id: 12, status: "published" }]);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE advertiser_id = $1"),
      [64]
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("exige justificativa antes de modificar qualquer registro", async () => {
    await expect(hideDealerReviewByAdmin("1", "64", "12", "curto")).rejects.toThrow(
      /motivo administrativo/i
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("oculta em transação e grava justificativa de auditoria; não apaga", async () => {
    mocks.query.mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 12, advertiser_id: 64, status: "published" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const result = await hideDealerReviewByAdmin(
      "admin-1", "64", "12", "Análise concluída pela equipe responsável."
    );
    expect(result).toEqual({ id: 12, status: "hidden" });
    const sql = mocks.query.mock.calls.map(([s]) => s);
    expect(sql).toContain("BEGIN");
    expect(sql.some((s) => s.includes("UPDATE dealer_reviews SET status = 'hidden'"))).toBe(true);
    expect(sql.some((s) => s.includes("INSERT INTO admin_actions"))).toBe(true);
    expect(sql.some((s) => /DELETE\s+FROM\s+dealer_reviews/i.test(s))).toBe(false);
    expect(sql).toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("faz rollback se não conseguir registrar a auditoria", async () => {
    mocks.query.mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 12, status: "published" }] })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("auditoria indisponível"))
      .mockResolvedValueOnce({});
    await expect(
      hideDealerReviewByAdmin("admin-1", "64", "12", "Justificativa fundamentada e registrada.")
    ).rejects.toThrow("auditoria indisponível");
    expect(mocks.query.mock.calls.map(([s]) => s)).toContain("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("recusa avaliações ocultas e avaliações de outra loja", async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({});
    await expect(
      hideDealerReviewByAdmin("1", 64, 999, "Justificativa suficientemente detalhada.")
    ).rejects.toThrow(/não encontrada/);
    expect(mocks.query.mock.calls.map(([s]) => s)).toContain("ROLLBACK");
  });
});
