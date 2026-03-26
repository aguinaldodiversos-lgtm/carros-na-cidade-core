import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from "../../src/infrastructure/database/db.js";
import { listOwnedAds, getOwnedAd } from "../../src/modules/account/account.service.js";

describe("isolamento de anúncios por conta (SQL)", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("listOwnedAds usa JOIN com advertisers e filtra por um único $1 (dono)", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });

    await listOwnedAds("conta-alpha");

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toMatch(/FROM\s+ads\s+a/i);
    expect(sql).toMatch(/LEFT\s+JOIN\s+advertisers\s+adv/i);
    expect(sql).toMatch(/a\.user_id\s*=\s*\$1/);
    expect(sql).toMatch(/adv\.user_id\s*=\s*\$1/);
    expect(sql).toMatch(/OR/);
    expect(params).toEqual(["conta-alpha"]);
  });

  it("duas contas disparam queries com parâmetros diferentes (sem compartilhar user id)", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });

    await listOwnedAds("user-a");
    await listOwnedAds("user-b");

    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(["user-a"]);
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual(["user-b"]);
  });

  it("getOwnedAd amarra anúncio ao dono: $1=id do anúncio, $2=id do usuário", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });

    await expect(getOwnedAd("dono-2", "42")).rejects.toThrow(/nao encontrado/i);

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual(["42", "dono-2"]);
    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toMatch(/WHERE\s+a\.id\s*=\s*\$1/s);
    expect(sql).toMatch(/a\.user_id\s*=\s*\$2/);
    expect(sql).toMatch(/adv\.user_id\s*=\s*\$2/);
  });
});
