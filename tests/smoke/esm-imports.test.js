import { describe, expect, it, vi } from "vitest";

/**
 * Smoke test ESM — pega regressões do tipo:
 *   "SyntaxError: The requested module '../account/account.service.js'
 *    does not provide an export named 'countActiveAdsByUser'"
 *
 * Que matou o boot do backend no Render em 2026-05-06: a função existia
 * em account.service.js mas faltava a palavra-chave `export`. Os testes
 * de publication-options mockam o módulo inteiro com `vi.mock(...)`,
 * o que substitui o módulo ANTES do ESM resolver named exports —
 * mascarando a falha. Em produção, sem mock, ESM avalia os imports e
 * o boot quebra.
 *
 * Esta suíte importa os módulos críticos do backend SEM mockar suas
 * dependências internas — apenas neutraliza a conexão com o Postgres
 * (db.js) pra rodar offline. Se algum named import deixar de existir,
 * a `import("...")` rejeita com SyntaxError e o teste falha.
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
  withTransaction: vi.fn(),
  withUserTransaction: vi.fn(),
}));

describe("ESM smoke — backend modules booteam sem named-export ausente", () => {
  it("ads.publication-options.service.js resolve todos os named imports", async () => {
    const mod = await import(
      "../../src/modules/ads/ads.publication-options.service.js"
    );
    expect(typeof mod.getPublicationOptions).toBe("function");
  });

  it("ads.routes.js (controller + service) resolve em cadeia", async () => {
    const mod = await import("../../src/modules/ads/ads.routes.js");
    expect(mod.default).toBeDefined();
    // Express router → tem .use, .get, .post...
    expect(typeof mod.default.use).toBe("function");
  });

  it("account.service.js exporta countActiveAdsByUser (regressão direta do bug do Render)", async () => {
    const mod = await import("../../src/modules/account/account.service.js");
    expect(typeof mod.countActiveAdsByUser).toBe("function");
    expect(typeof mod.countNonDeletedAdsForUser).toBe("function");
    expect(typeof mod.getOwnedAd).toBe("function");
    expect(typeof mod.resolveCurrentPlan).toBe("function");
    expect(typeof mod.resolvePublishEligibility).toBe("function");
    expect(typeof mod.getAccountUser).toBe("function");
    expect(typeof mod.updateOwnedAdStatus).toBe("function");
  });

  it("payments routes + subscriptions guards resolvem", async () => {
    const routes = await import("../../src/modules/payments/payments.routes.js");
    expect(routes.default).toBeDefined();
    const guards = await import(
      "../../src/modules/payments/subscriptions.guards.js"
    );
    expect(typeof guards.findLiveSubscriptionForUser).toBe("function");
  });

  it("entrypoint src/index.js carrega sem SyntaxError ESM", async () => {
    // Não inicia listener (já que db.js está mockado e o app falharia ao
    // conectar). Apenas valida que TODA a árvore de imports resolve.
    // Se algum named export estiver faltando em qualquer módulo da
    // cadeia, a importação rejeita com SyntaxError.
    process.env.SKIP_LISTEN = "1";
    let error = null;
    try {
      await import("../../src/index.js");
    } catch (err) {
      // Aceita falhas de runtime (DB ausente etc.), mas NÃO SyntaxError de ESM.
      error = err;
    }
    if (error) {
      expect(error.name).not.toBe("SyntaxError");
      expect(String(error.message)).not.toMatch(
        /does not provide an export named/i
      );
    }
  });
});
