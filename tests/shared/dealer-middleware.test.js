/**
 * Autorização profissional de lojista — testes do guard.
 *
 * O ponto destes testes NÃO é "o middleware sabe comparar strings". É provar a
 * postura FAIL CLOSED: a única entrada que passa é exatamente `"CNPJ"`, o único
 * valor que `authMiddleware` de fato produz. Todo o resto — incluindo variações
 * plausíveis que alguém poderia enviar ou introduzir num refactor ("PJ",
 * "dealer", "cnpj" minúsculo) — é NEGADO.
 *
 * Também é testado que o guard NUNCA lê nada fora de `req.user`: cookie, body e
 * headers dizendo "sou lojista" não mudam o veredito.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ACCOUNT_TYPE,
  isDealerAccount,
  requireDealerAccount,
} from "../../src/shared/middlewares/dealer.middleware.js";

function mockRes() {
  return { status: () => ({ json: () => {} }) };
}

/**
 * Executa o middleware e devolve o que aconteceu, sem depender de o teste
 * lembrar de checar "next não foi chamado" manualmente.
 */
function run(req) {
  const next = vi.fn();
  requireDealerAccount()(req, mockRes(), next);

  const calls = next.mock.calls;
  const arg = calls[0]?.[0];

  return {
    nextCalls: calls.length,
    // `next()` sem argumento = seguiu adiante. `next(err)` = barrou.
    passed: calls.length === 1 && arg === undefined,
    error: arg,
  };
}

describe("requireDealerAccount — conta permitida", () => {
  it("CNPJ passa e chama next() exatamente uma vez, sem erro", () => {
    const result = run({ user: { id: "u1", role: "user", account_type: "CNPJ" } });

    expect(result.passed).toBe(true);
    expect(result.nextCalls).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("CNPJ passa independentemente de role/plan (o guard só olha account_type)", () => {
    const result = run({
      user: { id: "u1", role: "admin", plan: "free", account_type: "CNPJ" },
    });

    expect(result.passed).toBe(true);
  });
});

describe("requireDealerAccount — contas bloqueadas", () => {
  it("CPF recebe 403 e next NÃO segue adiante", () => {
    const result = run({ user: { id: "u2", role: "user", account_type: "CPF" } });

    expect(result.passed).toBe(false);
    expect(result.nextCalls).toBe(1);
    expect(result.error?.statusCode).toBe(403);
  });

  it("pending recebe 403", () => {
    const result = run({ user: { id: "u3", role: "user", account_type: "pending" } });

    expect(result.passed).toBe(false);
    expect(result.error?.statusCode).toBe(403);
  });

  it("account_type ausente falha fechado (403), nunca permite", () => {
    const result = run({ user: { id: "u4", role: "user" } });

    expect(result.passed).toBe(false);
    expect(result.error?.statusCode).toBe(403);
  });

  it("sem req.user → 401 (não chegou autenticado)", () => {
    const result = run({});

    expect(result.passed).toBe(false);
    expect(result.error?.statusCode).toBe(401);
  });

  it("req.user null → 401", () => {
    const result = run({ user: null });

    expect(result.passed).toBe(false);
    expect(result.error?.statusCode).toBe(401);
  });
});

describe("requireDealerAccount — valores inesperados são NEGADOS (sem normalização)", () => {
  // Nenhum destes valores é produzido pelo backend. Aceitar qualquer um deles
  // seria inventar vocabulário — e um sinônimo aceito é uma porta a mais.
  const rejected = [
    "PJ",
    "dealer",
    "LOJISTA",
    "lojista",
    "cnpj", // minúsculo: `authMiddleware` sempre emite "CNPJ"
    "Cnpj",
    " CNPJ",
    "CNPJ ",
    "CPF",
    "pending",
    "",
    "   ",
    "admin",
    "true",
  ];

  for (const value of rejected) {
    it(`nega account_type=${JSON.stringify(value)}`, () => {
      const result = run({ user: { id: "x", account_type: value } });

      expect(result.passed).toBe(false);
      expect(result.error?.statusCode).toBe(403);
    });
  }

  const rejectedNonStrings = [null, undefined, 0, 1, true, false, {}, [], NaN];

  for (const value of rejectedNonStrings) {
    it(`nega account_type não-string ${String(value)}`, () => {
      const result = run({ user: { id: "x", account_type: value } });

      expect(result.passed).toBe(false);
      expect(result.error?.statusCode).toBe(403);
    });
  }
});

describe("requireDealerAccount — a autoridade é o backend, não o cliente", () => {
  it("cookie/body/header alegando lojista NÃO concedem acesso", () => {
    const result = run({
      // Tudo abaixo é controlado pelo cliente. Nada disso pode importar.
      cookies: { cnc_session: "qualquer-coisa-assinada-dizendo-CNPJ" },
      headers: { "x-account-type": "CNPJ", authorization: "Bearer algo" },
      body: { account_type: "CNPJ", type: "CNPJ", is_dealer: true },
      query: { account_type: "CNPJ" },
      user: { id: "u5", account_type: "CPF" },
    });

    expect(result.passed).toBe(false);
    expect(result.error?.statusCode).toBe(403);
  });

  it("o veredito acompanha req.user mesmo quando o cliente diz o contrário", () => {
    const result = run({
      body: { account_type: "CPF" },
      user: { id: "u6", account_type: "CNPJ" },
    });

    expect(result.passed).toBe(true);
  });
});

describe("requireDealerAccount — contrato da resposta", () => {
  it("403 carrega code estável e não vaza estado interno da conta", () => {
    const result = run({ user: { id: "u7", account_type: "CPF" } });

    expect(result.error?.details).toEqual({ code: "DEALER_ACCOUNT_REQUIRED" });

    const message = String(result.error?.message ?? "");
    expect(message).not.toMatch(/document_type|users\.|SELECT|plan_id|CPF/i);
  });

  it("erros são operacionais (não são 5xx disfarçado)", () => {
    expect(run({ user: { id: "a", account_type: "CPF" } }).error?.isOperational).toBe(true);
    expect(run({}).error?.isOperational).toBe(true);
  });
});

describe("isDealerAccount — decisão pura", () => {
  it("true somente para CNPJ exato", () => {
    expect(isDealerAccount({ account_type: "CNPJ" })).toBe(true);
  });

  it("false para tudo o mais, incluindo ausência de objeto", () => {
    expect(isDealerAccount({ account_type: "CPF" })).toBe(false);
    expect(isDealerAccount({ account_type: "pending" })).toBe(false);
    expect(isDealerAccount({})).toBe(false);
    expect(isDealerAccount(null)).toBe(false);
    expect(isDealerAccount(undefined)).toBe(false);
  });
});

describe("ACCOUNT_TYPE — vocabulário fechado", () => {
  it("expõe exatamente os três valores que authMiddleware produz", () => {
    expect(ACCOUNT_TYPE).toEqual({ PENDING: "pending", CPF: "CPF", CNPJ: "CNPJ" });
  });

  it("é imutável (não pode ser esticado em runtime)", () => {
    expect(Object.isFrozen(ACCOUNT_TYPE)).toBe(true);
  });
});
