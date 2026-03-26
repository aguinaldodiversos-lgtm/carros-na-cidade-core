import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from "../../src/infrastructure/database/db.js";
import { findCitiesByStateVariants } from "../../src/modules/cities/cities.repository.js";
import { searchCitiesByUfAndPartialName } from "../../src/modules/cities/cities.service.js";

describe("findCitiesByStateVariants (tabela cities)", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("consulta cities com filtro de UF (ANY + slug) e parâmetros corretos para SP", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "Campinas",
          slug: "campinas-sp",
          state: "SP",
          ranking_priority: 1,
          territorial_score: 0,
        },
      ],
    });

    const rows = await findCitiesByStateVariants("SP");

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toMatch(/FROM\s+cities\s+c/i);
    expect(sql).toMatch(/=\s*ANY\(\$1::text\[\]\)/);
    expect(sql).toMatch(/c\.slug\s+~\*/);
    expect(params[1]).toBe("[-_]sp$");
    expect(Array.isArray(params[0])).toBe(true);
    expect(params[0]).toContain("SP");
    expect(rows[0].name).toBe("Campinas");
  });

  it("UF inválida retorna [] sem consultar o banco", async () => {
    const rows = await findCitiesByStateVariants("X");
    expect(rows).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("searchCitiesByUfAndPartialName integrado ao repositório (mock)", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("reconhece trechos parciais (camp / atib) com linhas da UF vindas do banco", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          id: 10,
          name: "Campinas",
          slug: "campinas-sp",
          state: "SP",
          ranking_priority: 0,
          territorial_score: 0,
        },
        {
          id: 11,
          name: "Atibaia",
          slug: "atibaia-sp",
          state: "SP",
          ranking_priority: 0,
          territorial_score: 0,
        },
      ],
    });

    const camp = await searchCitiesByUfAndPartialName("SP", "camp", 10);
    expect(camp.some((c) => c.name === "Campinas")).toBe(true);

    const atib = await searchCitiesByUfAndPartialName("SP", "atib", 10);
    expect(atib[0]?.name).toBe("Atibaia");
  });
});
