/**
 * Cidade do anunciante — fail closed (Fase 0.1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTES TESTES DEFENDEM
 * ────────────────────────────────────────────────────────────────────────────
 * A versão anterior de `resolveCityIdForNewAdvertiser` tinha dois fallbacks
 * silenciosos: busca aproximada por `users.city` (`name ILIKE '%token%'`, sem
 * UF) e, por último, `SELECT id FROM cities ORDER BY id ASC LIMIT 1`. Um
 * anunciante nascia numa cidade que ninguém escolheu, sem erro e sem log.
 *
 * Os testes abaixo não verificam só "lança erro quando falta cidade". Eles
 * verificam que os DOIS caminhos antigos deixaram de existir — inclusive nos
 * cenários exatos em que eles disparavam:
 *   • `users.city` preenchido e nenhuma cidade explícita;
 *   • tabela `cities` populada, pronta para entregar a "primeira" linha.
 *
 * Por isso o mock do pool é um espião de SQL: além do veredito, afirmamos que
 * as consultas de fallback NUNCA são emitidas. Um refactor que reintroduzisse o
 * `ORDER BY id ASC LIMIT 1` passaria num teste que só olhasse o retorno — aqui,
 * não passa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Toda query que passou pelo pool nesta execução (para inspeção). */
let executedSql = [];
/** Linhas devolvidas por `SELECT id FROM cities WHERE id = $1`. */
let existingCityIds = new Set();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: {
    query: vi.fn(async (sql, params) => {
      executedSql.push(String(sql));

      if (/FROM cities\s+WHERE id = \$1/i.test(sql)) {
        const id = Number(params?.[0]);
        return { rows: existingCityIds.has(id) ? [{ id }] : [] };
      }

      // `users.city` deliberadamente preenchido: se algum fallback textual
      // voltar a existir, ele terá material para "acertar" e o teste que
      // proíbe a query o pegará.
      if (/FROM users/i.test(sql)) {
        return { rows: [{ id: "1", city: "Atibaia - SP", name: "Fulano" }] };
      }

      if (/information_schema\.columns/i.test(sql)) {
        return { rows: [{ column_name: "city" }, { column_name: "name" }] };
      }

      // Qualquer outra coisa (inclusive um eventual "primeira cidade") devolve
      // uma linha plausível — de novo, para que o fallback tivesse sucesso se
      // tivesse sido reintroduzido.
      return { rows: [{ id: 999 }] };
    }),
  },
  withTransaction: vi.fn(),
}));

const { resolveCityIdForNewAdvertiser } = await import(
  "../../src/modules/advertisers/advertiser.ensure.service.js"
);

beforeEach(() => {
  executedSql = [];
  existingCityIds = new Set([42, 7]);
});

/** SQL emitido, normalizado para casar independente de quebras de linha. */
function sqlBlob() {
  return executedSql.join(" | ").replace(/\s+/g, " ");
}

describe("resolveCityIdForNewAdvertiser — caminho válido", () => {
  it("cityId existente retorna exatamente esse id", async () => {
    await expect(resolveCityIdForNewAdvertiser("1", 42)).resolves.toBe(42);
  });

  it("aceita id numérico em string (vem de query/JSON)", async () => {
    await expect(resolveCityIdForNewAdvertiser("1", "7")).resolves.toBe(7);
  });

  it("resolve com UMA consulta, por PK — sem varredura", async () => {
    await resolveCityIdForNewAdvertiser("1", 42);

    const cityQueries = executedSql.filter((s) => /FROM cities/i.test(s));
    expect(cityQueries).toHaveLength(1);
    expect(cityQueries[0]).toMatch(/WHERE id = \$1/);
  });
});

describe("resolveCityIdForNewAdvertiser — recusa", () => {
  const invalid = [
    ["ausente (undefined)", undefined],
    ["ausente (null)", null],
    ["string vazia", ""],
    ["só espaços", "   "],
    ["não numérico", "atibaia"],
    ["decimal", 12.5],
    ["negativo", -1],
    ["zero", 0],
    ["notação científica", "1e3"],
    ["NaN", NaN],
    ["objeto", {}],
  ];

  for (const [label, value] of invalid) {
    it(`recusa ${label}`, async () => {
      await expect(resolveCityIdForNewAdvertiser("1", value)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  }

  it("cityId inexistente em cities é recusado", async () => {
    await expect(resolveCityIdForNewAdvertiser("1", 1234)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("o erro carrega code estável e não vaza SQL/schema", async () => {
    const error = await resolveCityIdForNewAdvertiser("1", null).catch((e) => e);

    expect(error.details).toEqual({ code: "ADVERTISER_CITY_REQUIRED" });
    expect(error.message).toBe("Cidade válida é obrigatória.");
    expect(error.message).not.toMatch(/SELECT|cities|ILIKE|users\./i);
  });
});

describe("resolveCityIdForNewAdvertiser — fallbacks REMOVIDOS", () => {
  it("NÃO consulta users.city quando falta cityId (fallback textual morto)", async () => {
    await resolveCityIdForNewAdvertiser("1", null).catch(() => {});

    expect(sqlBlob()).not.toMatch(/FROM users/i);
  });

  it("NÃO emite busca aproximada por nome (ILIKE) em nenhum cenário", async () => {
    await resolveCityIdForNewAdvertiser("1", null).catch(() => {});
    await resolveCityIdForNewAdvertiser("1", 9999).catch(() => {});
    await resolveCityIdForNewAdvertiser("1", 42);

    expect(sqlBlob()).not.toMatch(/ILIKE/i);
  });

  it("NÃO emite 'primeira cidade da tabela' (ORDER BY id ASC LIMIT 1)", async () => {
    await resolveCityIdForNewAdvertiser("1", null).catch(() => {});
    await resolveCityIdForNewAdvertiser("1", 9999).catch(() => {});

    expect(sqlBlob()).not.toMatch(/ORDER BY id ASC/i);
  });

  it("mesmo com users.city='Atibaia - SP', ausência de cityId é ERRO — não Atibaia", async () => {
    // O cenário exato que o fallback antigo "resolvia" sozinho.
    await expect(resolveCityIdForNewAdvertiser("1", undefined)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(sqlBlob()).not.toMatch(/FROM users|ILIKE|ORDER BY id ASC/i);
  });

  it("cityId inválido NÃO é substituído por nenhuma cidade — falha em vez de adivinhar", async () => {
    await expect(resolveCityIdForNewAdvertiser("1", 9999)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(sqlBlob()).not.toMatch(/ORDER BY id ASC|ILIKE/i);
  });
});
