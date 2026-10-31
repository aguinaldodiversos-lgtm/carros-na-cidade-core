import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: db.query,
}));

import { getMyPaymentReturnStatus } from "../../src/modules/payments/payments.return-status.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

const ID = "56dbb539-7df7-488a-937b-6aee8f56b6a9";

describe("retorno autenticado do Mercado Pago — somente leitura", () => {
  it("recusa referência inválida sem consultar o banco", async () => {
    expect(await getMyPaymentReturnStatus({ userId: "u1", reference: "a' OR true" })).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("consulta a transação apenas pelo usuário autenticado e não escreve nada", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { context: "boost", status: "approved", boost_option_id: "boost-7d", boost_active: true },
      ],
    });
    const result = await getMyPaymentReturnStatus({ userId: "lojista-122", reference: ID });
    expect(result).toEqual({
      context: "boost",
      status: "approved",
      boost_active: true,
      plan_id: null,
      product: "Destaque de 7 dias",
    });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("pi.user_id = $2");
    expect(sql).toContain("pi.payment_resource_id = $1");
    expect(sql).toContain("a.highlight_until > NOW()");
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
    expect(params).toEqual([ID, "lojista-122"]);
  });

  it("não confirma pagamento sem registro próprio", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await getMyPaymentReturnStatus({ userId: "outro-usuario", reference: ID });
    expect(result).toBeNull();
  });

  it("distingue aprovado de destaque ainda não ativo", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ context: "boost", status: "approved", boost_active: false }],
    });
    const result = await getMyPaymentReturnStatus({ userId: "u1", reference: ID });
    expect(result.status).toBe("approved");
    expect(result.boost_active).toBe(false);
  });

  it("não promove status pendente a aprovado", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ context: "boost", status: "pending", boost_active: true }],
    });
    const result = await getMyPaymentReturnStatus({ userId: "u1", reference: ID });
    expect(result.status).toBe("pending");
    expect(result.boost_active).toBe(false);
  });
});
