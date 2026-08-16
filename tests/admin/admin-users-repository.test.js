import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import {
  listUsers,
  findUserById,
  countAdsByUserId,
  countReceivedOffersByUserId,
  __buildUserFiltersForTest as buildUserFilters,
} from "../../src/modules/admin/users/admin-users.repository.js";

/** Última chamada cujo SQL casa o predicado (útil para separar data de count). */
function sqlCalls() {
  return vi.mocked(query).mock.calls.map(([sql, params]) => ({
    sql: String(sql).replace(/\s+/g, " ").trim(),
    params: params || [],
  }));
}

function mockRows(...batches) {
  const q = vi.mocked(query);
  batches.forEach((rows) => q.mockResolvedValueOnce({ rows }));
}

describe("admin users repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PII — nenhuma coluna sensível é lida do banco", () => {
    const FORBIDDEN = [
      "password_hash",
      "password",
      "reset_token",
      "reset_token_expires",
      "email_verification_token",
      "email_verification_expires",
      "document_number",
      "address",
      "failed_attempts",
    ];

    it("listUsers não seleciona segredo nem SELECT *", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({});
      const [data] = sqlCalls();
      expect(data.sql).not.toMatch(/SELECT\s+\*/i);
      for (const col of FORBIDDEN) {
        expect(data.sql).not.toContain(col);
      }
    });

    it("findUserById não seleciona segredo nem SELECT *", async () => {
      mockRows([{ id: 1 }]);
      await findUserById("1");
      const [q] = sqlCalls();
      expect(q.sql).not.toMatch(/SELECT\s+\*/i);
      for (const col of FORBIDDEN) {
        expect(q.sql).not.toContain(col);
      }
    });
  });

  describe("ordenação determinística", () => {
    it("desempata por id DESC além de created_at", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({});
      const [data] = sqlCalls();
      expect(data.sql).toMatch(/ORDER BY u\.created_at DESC NULLS LAST, u\.id DESC/i);
    });
  });

  describe("data e count compartilham a MESMA cláusula", () => {
    /**
     * Este é o teste que impede a repetição do defeito da Fase 3 no /comprar:
     * whereClause compartilhado com countQuery divergente. Comparamos o WHERE
     * das duas queries caractere a caractere, e os params um a um.
     */
    it.each([
      ["sem filtro", {}],
      ["busca textual", { search: "maria" }],
      ["busca por id", { search: "42" }],
      ["tipo de conta", { accountType: "CNPJ" }],
      ["papel", { role: "admin" }],
      ["combinado", { search: "loja", accountType: "pending", role: "user" }],
    ])("%s", async (_label, filters) => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ limit: 30, offset: 0, ...filters });

      const [data, count] = sqlCalls();
      const whereOf = (sql) => (sql.match(/WHERE .*?(?= ORDER BY| LIMIT|$)/i) || [""])[0];

      expect(whereOf(count.sql)).toBe(whereOf(data.sql));
      // A query de dados carrega limit/offset ao final; o resto tem que ser igual.
      expect(data.params.slice(0, count.params.length)).toEqual(count.params);
      expect(data.params.slice(count.params.length)).toEqual([30, 0]);
    });

    /**
     * INVARIANTE declarada no repositório: nenhum filtro pode referenciar o
     * alias `p` (subscription_plans), porque a query de contagem não tem esse
     * JOIN. Se alguém adicionar "filtrar por nome do plano", este teste falha
     * e obriga a decisão consciente de juntar também no count.
     */
    it("nenhuma condição referencia o alias do JOIN ausente no count", () => {
      const { where } = buildUserFilters({ search: "x", accountType: "CPF", role: "admin" });
      expect(where).not.toMatch(/\bp\./);
    });
  });

  describe("busca", () => {
    it("cobre nome e email com ILIKE parametrizado", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "maria" });
      const [data] = sqlCalls();
      expect(data.sql).toMatch(/u\.name ILIKE \$1/);
      expect(data.sql).toMatch(/u\.email ILIKE \$1/);
      expect(data.params[0]).toBe("%maria%");
    });

    it("termo numérico também casa o ID exato", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "42" });
      const [data] = sqlCalls();
      expect(data.sql).toMatch(/u\.id = \$2/);
      expect(data.params).toEqual(["%42%", "42", 30, 0]);
    });

    it("termo textual NÃO gera comparação de ID", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "maria" });
      const [data] = sqlCalls();
      expect(data.sql).not.toMatch(/u\.id = \$/);
    });

    /**
     * Sem escape, buscar "%" casaria a base inteira e "_" casaria qualquer
     * caractere — a busca pareceria funcionar e devolveria lixo.
     */
    it("escapa curingas de LIKE", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "100%_a" });
      const [data] = sqlCalls();
      expect(data.params[0]).toBe("%100\\%\\_a%");
      expect(data.sql).toContain("ESCAPE");
    });

    it("busca vazia ou só espaços não vira filtro", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "   " });
      const [data] = sqlCalls();
      expect(data.sql).not.toContain("WHERE");
    });

    it("o termo nunca é interpolado no SQL", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ search: "'; DROP TABLE users; --" });
      const [data, count] = sqlCalls();
      expect(data.sql).not.toContain("DROP TABLE");
      expect(count.sql).not.toContain("DROP TABLE");
      expect(data.params[0]).toContain("DROP TABLE");
    });
  });

  describe("filtros", () => {
    it("account_type=pending vira complemento com COALESCE", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ accountType: "pending" });
      const [data] = sqlCalls();
      expect(data.sql).toContain("NOT IN ('cpf', 'cnpj')");
      expect(data.sql).toContain("COALESCE");
    });

    it("role trata NULL/'' como 'user' antes de comparar", async () => {
      mockRows([], [{ total: 0 }]);
      await listUsers({ role: "user" });
      const [data] = sqlCalls();
      expect(data.sql).toMatch(/COALESCE\(NULLIF\(BTRIM\(u\.role\), ''\), 'user'\) = \$1/);
      expect(data.params[0]).toBe("user");
    });
  });

  describe("agregações do detalhe não multiplicam linhas", () => {
    /**
     * `advertisers.user_id` não é UNIQUE. Se a contagem de anúncios usasse
     * JOIN em advertisers, um usuário com 2 lojas contaria cada anúncio duas
     * vezes. A subquery com IN filtra em vez de multiplicar.
     */
    it("countAdsByUserId filtra por subquery, sem JOIN em advertisers", async () => {
      mockRows([{ active: 3, total: 5 }]);
      const result = await countAdsByUserId("7");
      const [q] = sqlCalls();
      expect(q.sql).toMatch(/advertiser_id IN \(SELECT/i);
      expect(q.sql).not.toMatch(/JOIN advertisers/i);
      expect(result).toEqual({ active: 3, total: 5 });
    });

    it("countReceivedOffersByUserId liga a oferta ao COMPRADOR, não ao lojista", async () => {
      mockRows([{ total: 4 }]);
      const total = await countReceivedOffersByUserId("7");
      const [q] = sqlCalls();
      expect(q.sql).toContain("pi.buyer_user_id = $1");
      expect(q.sql).not.toContain("dealer_user_id");
      expect(total).toBe(4);
    });
  });
});
