import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import {
  findById,
  listAdvertisers,
} from "../../src/modules/admin/advertisers/admin-advertisers.repository.js";

beforeEach(() => vi.clearAllMocks());

describe("consulta administrativa do CNPJ", () => {
  it("busca CNPJ da conta em detalhe de loja, sem depender de coluna de advertisers", async () => {
    const advertised = {
      id: 32,
      document_type: "cnpj",
      document_number: "11222333000181",
      city_name: "Atibaia",
      city_state: "SP",
      verified: false,
    };
    vi.mocked(query).mockResolvedValueOnce({ rows: [advertised] });
    expect(await findById(32)).toMatchObject(advertised);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain("u.document_number");
    expect(sql).toContain("LEFT JOIN users u ON u.id = adv.user_id");
    expect(sql).toContain("LEFT JOIN cities c ON c.id = adv.city_id");
    expect(sql).not.toContain("adv.document_number");
    expect(params).toEqual([32]);
  });

  it("não amplia a exposição do documento à lista de anunciantes", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await listAdvertisers();
    const [sql] = vi.mocked(query).mock.calls[0];
    expect(sql).not.toContain("document_number");
  });
});
