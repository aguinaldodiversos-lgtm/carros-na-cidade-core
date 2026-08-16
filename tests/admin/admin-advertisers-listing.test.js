import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from "../../src/infrastructure/database/db.js";
import {
  listAdvertisers,
  __buildAdvertiserFiltersForTest as buildAdvertiserFilters,
} from "../../src/modules/admin/advertisers/admin-advertisers.repository.js";

/**
 * Cobertura que NÃO EXISTIA antes da Admin U1 — e é exatamente por isso que o
 * parâmetro `search` pôde ser adicionado à UI e nunca implementado no backend
 * sem nada ficar vermelho.
 */

function sqlCalls() {
  return vi.mocked(query).mock.calls.map(([sql, params]) => ({
    sql: String(sql).replace(/\s+/g, " ").trim(),
    params: params || [],
  }));
}

/**
 * Extrai a cláusula WHERE de TOPO.
 *
 * `lastIndexOf` e não `match`: a query de dados contém
 * `COUNT(...) FILTER (WHERE a.status = 'active')` ANTES do WHERE de verdade, e
 * uma regex ingênua casaria o FILTER — comparando pedaços diferentes das duas
 * queries e dando falso vermelho (ou, pior, falso verde).
 */
function whereOf(sql) {
  const idx = sql.lastIndexOf("WHERE ");
  if (idx === -1) return "";
  return sql
    .slice(idx)
    .replace(/ (GROUP BY|ORDER BY|LIMIT) .*$/i, "")
    .trim();
}

async function run(filters = {}) {
  vi.mocked(query).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
  await listAdvertisers({ limit: 30, offset: 0, ...filters });
  const [data, count] = sqlCalls();
  return { data, count };
}

describe("admin advertisers — listagem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── BUSCA (antes: morta) ────────────────────────────────────────────────
  describe("busca", () => {
    it("gera filtro real cobrindo nome, e-mail, empresa e e-mail da conta", async () => {
      const { data } = await run({ search: "atibaia" });
      expect(data.sql).toMatch(/adv\.name ILIKE \$1/);
      expect(data.sql).toMatch(/adv\.email ILIKE \$1/);
      expect(data.sql).toMatch(/adv\.company_name ILIKE \$1/);
      expect(data.sql).toMatch(/u\.email ILIKE \$1/);
      expect(data.params[0]).toBe("%atibaia%");
    });

    /**
     * A busca referencia `u.email`, então a query de CONTAGEM precisa do mesmo
     * LEFT JOIN users — sem ele o Postgres devolve "missing FROM-clause entry
     * for table u". É o defeito que apareceu nos filtros da Fase 3 no /comprar.
     */
    it("a contagem carrega o JOIN que a cláusula de busca exige", async () => {
      const { count } = await run({ search: "atibaia" });
      expect(count.sql).toMatch(/LEFT JOIN users u ON u\.id = adv\.user_id/i);
      expect(count.sql).toContain("u.email ILIKE");
    });

    it("busca e contagem usam a MESMA cláusula e os MESMOS params", async () => {
      const { data, count } = await run({ search: "loja", status: "active" });
      expect(whereOf(count.sql)).toBe(whereOf(data.sql));
      expect(whereOf(data.sql)).toContain("ILIKE");
      expect(data.params.slice(0, count.params.length)).toEqual(count.params);
    });

    it("escapa curingas de LIKE", async () => {
      const { data } = await run({ search: "50%_off" });
      expect(data.params[0]).toBe("%50\\%\\_off%");
      expect(data.sql).toContain("ESCAPE");
    });

    it("termo vazio não vira filtro", async () => {
      const { data } = await run({ search: "  " });
      expect(data.sql).not.toContain("ILIKE");
    });

    it("o termo nunca é interpolado no SQL", async () => {
      const { data } = await run({ search: "'; DROP TABLE ads; --" });
      expect(data.sql).not.toContain("DROP TABLE");
      expect(data.params[0]).toContain("DROP TABLE");
    });
  });

  // ── STATUS LEGADO ───────────────────────────────────────────────────────
  describe("status legado", () => {
    /**
     * `advertisers.status` é NULL em lojas anteriores à coluna (as migrations
     * 003/012 a re-adicionam com DEFAULT, e DEFAULT não preenche linha que já
     * existia). O resto do produto conta NULL/'' como 'active'; o admin
     * comparava cru e escondia lojista que está no ar publicamente.
     */
    it("filtrar Ativo usa a mesma normalização do resto do produto", async () => {
      const { data } = await run({ status: "active" });
      expect(data.sql).toMatch(/COALESCE\(NULLIF\(BTRIM\(adv\.status\), ''\), 'active'\) = \$1/);
      expect(data.params[0]).toBe("active");
    });

    it("a contagem aplica a mesma normalização", async () => {
      const { count } = await run({ status: "active" });
      expect(count.sql).toMatch(/COALESCE\(NULLIF\(BTRIM\(adv\.status\), ''\), 'active'\)/);
    });

    it("suspended e blocked continuam sendo estados explícitos", async () => {
      for (const status of ["suspended", "blocked"]) {
        vi.clearAllMocks();
        const { data } = await run({ status });
        expect(data.params[0]).toBe(status);
      }
    });

    it("o predicado normalizado é idêntico ao de purchase-intents", async () => {
      // `advertiserIsOperational` monta COALESCE(NULLIF(BTRIM(<alias>.status), ''), 'active')
      const { where } = buildAdvertiserFilters({ status: "active" });
      expect(where).toContain("COALESCE(NULLIF(BTRIM(adv.status), ''), 'active')");
    });
  });

  // ── PLANO EFETIVO ───────────────────────────────────────────────────────
  describe("plano", () => {
    /**
     * `advertisers.plan` é snapshot congelado na criação da loja: nenhum fluxo
     * de pagamento, concessão manual ou expiração escreve nele. A lista mostrava
     * esse valor e o detalhe resolvia `users.plan_id` — por isso discordavam.
     */
    it("resolve o plano efetivo por users.plan_id → subscription_plans", async () => {
      const { data } = await run();
      expect(data.sql).toMatch(/LEFT JOIN subscription_plans sp ON sp\.id = u\.plan_id/i);
      expect(data.sql).toMatch(/u\.plan_id AS effective_plan_id/);
      expect(data.sql).toMatch(/sp\.name AS effective_plan_name/);
    });

    it("o join do plano é 1:1 e entra no GROUP BY (não multiplica linhas)", async () => {
      const { data } = await run();
      expect(data.sql).toMatch(/GROUP BY adv\.id, u\.id, sp\.id/);
    });

    it("resolve o plano sem N+1: uma query de dados e uma de contagem", async () => {
      await run();
      expect(vi.mocked(query)).toHaveBeenCalledTimes(2);
    });
  });

  // ── ORDENAÇÃO ───────────────────────────────────────────────────────────
  describe("ordenação", () => {
    it("desempata por adv.id DESC", async () => {
      const { data } = await run();
      expect(data.sql).toMatch(/ORDER BY adv\.created_at DESC NULLS LAST, adv\.id DESC/i);
    });
  });

  // ── PAGINAÇÃO ───────────────────────────────────────────────────────────
  describe("paginação", () => {
    it("limit e offset são os últimos parâmetros, depois dos filtros", async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });
      await listAdvertisers({ limit: 15, offset: 30, status: "active", search: "x" });
      const [data] = sqlCalls();
      expect(data.params.slice(-2)).toEqual([15, 30]);
      expect(data.sql).toMatch(/LIMIT \$3 OFFSET \$4/);
    });
  });
});
