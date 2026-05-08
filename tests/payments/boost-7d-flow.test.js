import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 3B — fluxo de Destaque 7 dias via Mercado Pago.
 *
 * Cobertura:
 *   1. createBoostCheckout — preço FIXO do backend, ownership, contrato
 *      de retorno, mensagem de erro para boost desconhecido.
 *   2. applyBoostApproval — SQL de extensão de prazo (NÃO troca, SOMA),
 *      defesa contra metadata vazio, defesa contra ad soft-deleted.
 *   3. Caminhos legacy preservados — Start/Pro (createPlanSubscription)
 *      não são tocados pelo fluxo boost.
 *
 * Idempotência completa do webhook (FOR UPDATE + payment_resource_id
 * UNIQUE + check status) requer DB real e é coberta pelo runbook em
 * staging. Aqui validamos as INVARIANTES de SQL/contrato que tornam
 * o webhook seguro.
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
  listBoostOptions: vi.fn(() => [
    { id: "boost-7d", days: 7, price: 39.9, label: "Destaque por 7 dias" },
    { id: "boost-30d", days: 30, price: 129.9, label: "Destaque por 30 dias" },
  ]),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const { createBoostCheckout, applyBoostApproval } = await import(
  "../../src/modules/payments/payments.service.js"
);

beforeEach(() => {
  account.getAccountUser.mockReset();
  account.getOwnedAd.mockReset();
  account.listBoostOptions.mockReset().mockReturnValue([
    { id: "boost-7d", days: 7, price: 39.9, label: "Destaque por 7 dias" },
    { id: "boost-30d", days: 30, price: 129.9, label: "Destaque por 30 dias" },
  ]);
  db.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [] });
});

// ─────────────────────────────────────────────────────────────────────
// createBoostCheckout — checkout do Destaque 7 dias
// ─────────────────────────────────────────────────────────────────────

describe("createBoostCheckout — preço fixo do backend (anti-spoof)", () => {
  it("amount em payment_intents = 39.9 (do BOOST_OPTIONS, não do client)", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1", email: "u@x.com", type: "CPF" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "Civic 2018" });

    await createBoostCheckout({
      userId: "u1",
      adId: "ad1",
      boostOptionId: "boost-7d",
      successUrl: "http://x/ok",
      failureUrl: "http://x/fail",
      pendingUrl: "http://x/pend",
    });

    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    expect(insertCall).toBeTruthy();
    // O 6º param ($6) é amount no INSERT — qualquer que seja o índice,
    // 39.9 deve aparecer entre os params (preço veio do listBoostOptions).
    const params = insertCall[1];
    expect(params.some((p) => Number(p) === 39.9)).toBe(true);
  });

  it("metadata.boost_days='7' é gravado (consumido por applyBoostApproval)", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "X" });

    await createBoostCheckout({ userId: "u1", adId: "ad1", boostOptionId: "boost-7d" });

    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    // metadata é serializado como JSON string nos params
    const metaParam = insertCall[1].find(
      (p) => typeof p === "string" && p.includes("boost_days")
    );
    expect(metaParam).toBeTruthy();
    const parsed = JSON.parse(metaParam);
    expect(parsed.boost_days).toBe("7");
    expect(parsed.context).toBe("boost");
    expect(parsed.boost_option_id).toBe("boost-7d");
    expect(parsed.payment_type).toBe("one_time");
  });

  it("não aceita preço/quantidade vindos do client (não há param para isso na assinatura)", async () => {
    // O contrato da função PROVA isso: createBoostCheckout só aceita
    // userId/adId/boostOptionId/urls — não há `amount`/`price`/`quantity`.
    // Este teste é uma defesa contra refactor futuro que adicione esses
    // params por engano e abra brecha de spoof de preço.
    const { createBoostCheckout: fn } = await import(
      "../../src/modules/payments/payments.service.js"
    );
    // Pega keys arbitrários do primeiro objeto que a função aceita
    // (lê via reflection do código? não confiável). Em vez disso, tenta
    // passar amount=1 via boostOptionId hack — não muda preço.
    account.getAccountUser.mockResolvedValue({ id: "u1" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1" });

    await fn({
      userId: "u1",
      adId: "ad1",
      boostOptionId: "boost-7d",
      // @ts-expect-error — campos ignorados pelo contrato; defesa em runtime:
      amount: 1,
      price: 1,
      unit_price: 1,
      quantity: 999,
    });

    // Mesmo com payload malicioso, amount permanece 39.9
    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_intents")
    );
    const params = insertCall[1];
    expect(params.some((p) => Number(p) === 39.9)).toBe(true);
    expect(params.every((p) => Number(p) !== 1)).toBe(true);
  });
});

describe("createBoostCheckout — ownership e validações", () => {
  it("404 quando getOwnedAd rejeita (ad de outro user)", async () => {
    const { AppError } = await import("../../src/shared/middlewares/error.middleware.js");
    account.getAccountUser.mockResolvedValue({ id: "u1" });
    account.getOwnedAd.mockRejectedValue(new AppError("Anuncio nao encontrado.", 404));

    await expect(
      createBoostCheckout({ userId: "u1", adId: "ad999", boostOptionId: "boost-7d" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("400 quando boost_option_id desconhecido", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1" });

    await expect(
      createBoostCheckout({ userId: "u1", adId: "ad1", boostOptionId: "boost-fake" })
    ).rejects.toThrow(/Opcao de impulsionamento invalida/i);
  });

  it("retorno tem contract estável (context, ad_id, boost_option_id, init_point, mercado_pago_id)", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1", email: "u@x.com" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1", title: "X" });

    const r = await createBoostCheckout({
      userId: "u1",
      adId: "ad1",
      boostOptionId: "boost-7d",
      successUrl: "http://x/ok",
    });
    expect(r.context).toBe("ad_boost");
    expect(r.ad_id).toBe("ad1");
    expect(r.boost_option_id).toBe("boost-7d");
    expect(r.init_point).toBeTruthy();
    expect(r.mercado_pago_id).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyBoostApproval — extensão de prazo (oficial: "compras duplicadas
// estendem prazo, não aumentam prioridade")
// ─────────────────────────────────────────────────────────────────────

describe("applyBoostApproval — regra de prazo +N dias", () => {
  /**
   * Após a defesa em profundidade adicionada em 2026-05-08, o service
   * faz uma checagem SELECT (ownerCheck) antes do UPDATE — aqui
   * mockamos o SELECT com um anúncio ativo cujo dono = intent.user_id,
   * para que o UPDATE de prazo seja emitido.
   */
  function makeClient() {
    const fn = vi.fn().mockImplementation((sql) => {
      if (String(sql).includes("FROM ads a")) {
        return Promise.resolve({
          rows: [{ id: "ad1", status: "active", advertiser_user_id: "u1" }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rowCount: 1, rows: [] });
    });
    return { query: fn };
  }

  function findUpdateAdsCall(client) {
    return client.query.mock.calls.find(([sql]) => /UPDATE\s+ads/i.test(String(sql)));
  }

  it("SQL UPDATE soma +N dias quando highlight_until > NOW (extensão real)", async () => {
    const client = makeClient();
    await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad1",
      metadata: { boost_days: "7" },
    });

    const updateCall = findUpdateAdsCall(client);
    expect(updateCall).toBeTruthy();
    const [sql, params] = updateCall;
    // Branch de extensão: `highlight_until + ($2 || ' days')::interval`
    expect(String(sql)).toMatch(
      /highlight_until\s*\+\s*\(\$2\s*\|\|\s*' days'\)::interval/
    );
    // Branch de início do zero: `NOW() + ($2 || ' days')::interval`
    expect(String(sql)).toMatch(/NOW\(\)\s*\+\s*\(\$2\s*\|\|\s*' days'\)::interval/);
    // Anúncio soft-deleted é defendido
    expect(String(sql)).toMatch(/status\s*!=\s*'deleted'/);
    // Params: ad_id e quantidade de dias como string ('7' por causa do || cast)
    expect(params).toEqual(["ad1", "7"]);
  });

  it("SQL contém CASE WHEN para diferenciar prazo no futuro vs no passado/null", async () => {
    const client = makeClient();
    await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad1",
      metadata: { boost_days: "7" },
    });
    const updateCall = findUpdateAdsCall(client);
    const [sql] = updateCall;
    expect(String(sql)).toMatch(/CASE\s+WHEN\s+highlight_until\s+IS\s+NOT\s+NULL/i);
    expect(String(sql)).toMatch(/highlight_until\s*>\s*NOW\(\)/i);
    expect(String(sql)).toMatch(/ELSE\s+NOW\(\)/i);
  });

  it("priority sobe no MÁXIMO até 99 (não dispara escala infinita em compras múltiplas)", async () => {
    const client = makeClient();
    await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad1",
      metadata: { boost_days: "7" },
    });
    const updateCall = findUpdateAdsCall(client);
    const [sql] = updateCall;
    expect(String(sql)).toMatch(/LEAST\(99,\s*COALESCE\(priority,\s*1\)\s*\+\s*8\)/);
  });

  it("no-op quando ad_id ausente (não toca banco)", async () => {
    const client = makeClient();
    await applyBoostApproval(client, { metadata: { boost_days: "7" } });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("no-op quando boost_days = 0 ou ausente (não toca banco)", async () => {
    const client = makeClient();
    await applyBoostApproval(client, { ad_id: "ad1", metadata: {} });
    expect(client.query).not.toHaveBeenCalled();

    await applyBoostApproval(client, { ad_id: "ad1", metadata: { boost_days: "0" } });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejected/cancelled/pending não chega aqui — webhook só chama applyBoostApproval para approved (verificado em handleWebhookNotification)", async () => {
    // Garante que não há trigger acidental quando boost_days ausente,
    // simulando o que aconteceria se webhook resolvesse status errado.
    const client = makeClient();
    await applyBoostApproval(client, { ad_id: "ad1", metadata: {} });
    expect(client.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Caminhos comerciais separados — boost NÃO toca Start/Pro
// ─────────────────────────────────────────────────────────────────────

describe("Boost não toca o fluxo de Start/Pro (Fase 3B isolada)", () => {
  it("createBoostCheckout não chama insertPlanCheckout/createPlanSubscription", async () => {
    account.getAccountUser.mockResolvedValue({ id: "u1" });
    account.getOwnedAd.mockResolvedValue({ id: "ad1" });

    await createBoostCheckout({ userId: "u1", adId: "ad1", boostOptionId: "boost-7d" });

    // Não toca subscription_plans nem user_subscriptions.
    const sqlsTouched = db.query.mock.calls.map(([sql]) => String(sql));
    for (const sql of sqlsTouched) {
      expect(sql).not.toMatch(/subscription_plans/i);
      expect(sql).not.toMatch(/user_subscriptions/i);
    }
    // Toca payment_intents com context='boost'
    expect(sqlsTouched.some((s) => /payment_intents/i.test(s))).toBe(true);
  });

  it("applyBoostApproval não toca subscription_plans / user_subscriptions / users.plan_id", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql) => {
        if (String(sql).includes("FROM ads a")) {
          return Promise.resolve({
            rows: [{ id: "ad1", status: "active", advertiser_user_id: "u1" }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rowCount: 1, rows: [] });
      }),
    };
    await applyBoostApproval(client, {
      id: "intent-1",
      user_id: "u1",
      ad_id: "ad1",
      metadata: { boost_days: "7" },
    });
    const allSqls = client.query.mock.calls.map(([sql]) => String(sql));
    for (const sql of allSqls) {
      expect(sql).not.toMatch(/subscription_plans/i);
      expect(sql).not.toMatch(/user_subscriptions/i);
      expect(sql).not.toMatch(/users\.plan_id/i);
    }
    // UPDATE ads tem que ter sido emitido (caminho feliz)
    expect(allSqls.some((s) => /UPDATE\s+ads/i.test(s))).toBe(true);
  });
});
