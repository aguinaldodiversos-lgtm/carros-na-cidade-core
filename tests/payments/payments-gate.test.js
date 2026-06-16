import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Fase 5.0 — gate unificado de pagamentos (payments.gate.js).
 *
 * Cobre a lógica pura de decisão mock/sandbox/live, o bloqueio anti-R1
 * (token presente sem PAYMENTS_LIVE → erro claro), o cadeado subordinado
 * de assinatura e o diagnóstico seguro (sem vazar tokens).
 *
 * Todas as funções leem process.env em tempo de chamada, então cada teste
 * monta o ambiente e o restaura no afterEach (process.env é compartilhado).
 */

const {
  resolvePaymentsMode,
  isRealChargeEnabled,
  isMercadoPagoTokenPresent,
  resolveCheckoutExecution,
  assertSubscriptionsRealAllowed,
  getPaymentsGateDiagnostics,
} = await import("../../src/modules/payments/payments.gate.js");

const GATE_ENV_KEYS = [
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "PAYMENTS_LIVE",
  "PAYMENTS_SANDBOX_ENABLED",
  "MERCADO_PAGO_ENV",
  "SUBSCRIPTIONS_LIVE",
  "NODE_ENV",
];

let original = {};

beforeEach(() => {
  original = {};
  for (const key of GATE_ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of GATE_ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

// ─────────────────────────────────────────────────────────────────────
// resolvePaymentsMode — mock | sandbox | live
// ─────────────────────────────────────────────────────────────────────

describe("resolvePaymentsMode", () => {
  it("sem token → mock (independente dos flags)", () => {
    process.env.PAYMENTS_LIVE = "true";
    expect(resolvePaymentsMode()).toBe("mock");
    expect(isRealChargeEnabled()).toBe(false);
  });

  it("token presente mas PAYMENTS_LIVE/sandbox desligado → mock (token sozinho não basta)", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    expect(resolvePaymentsMode()).toBe("mock");
    expect(isMercadoPagoTokenPresent()).toBe(true);
    expect(isRealChargeEnabled()).toBe(false);
  });

  it("token + PAYMENTS_LIVE=true → live", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "true";
    expect(resolvePaymentsMode()).toBe("live");
    expect(isRealChargeEnabled()).toBe(true);
  });

  it('aceita "1" como ligado em PAYMENTS_LIVE (compat)', () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "1";
    expect(resolvePaymentsMode()).toBe("live");
  });

  it("token + sandbox (env=sandbox + PAYMENTS_SANDBOX_ENABLED=true) → sandbox", () => {
    process.env.MP_ACCESS_TOKEN = "TEST-xxxx";
    process.env.MERCADO_PAGO_ENV = "sandbox";
    process.env.PAYMENTS_SANDBOX_ENABLED = "true";
    expect(resolvePaymentsMode()).toBe("sandbox");
    expect(isRealChargeEnabled()).toBe(true);
  });

  it("sandbox exige AS DUAS variáveis — só MERCADO_PAGO_ENV=sandbox não liga", () => {
    process.env.MP_ACCESS_TOKEN = "TEST-xxxx";
    process.env.MERCADO_PAGO_ENV = "sandbox";
    expect(resolvePaymentsMode()).toBe("mock");
  });

  it("PAYMENTS_LIVE=true tem precedência sobre sandbox quando ambos ligados", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "true";
    process.env.MERCADO_PAGO_ENV = "sandbox";
    process.env.PAYMENTS_SANDBOX_ENABLED = "true";
    expect(resolvePaymentsMode()).toBe("live");
  });

  it("PAYMENTS_LIVE=true mas sem token → mock (não dá para cobrar sem credencial)", () => {
    process.env.PAYMENTS_LIVE = "true";
    expect(resolvePaymentsMode()).toBe("mock");
  });

  it('valor inválido em flag (ex: "TRUE", "yes") mantém desligado (fail-closed)', () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "TRUE";
    expect(resolvePaymentsMode()).toBe("mock");
    process.env.PAYMENTS_LIVE = "yes";
    expect(resolvePaymentsMode()).toBe("mock");
  });
});

// ─────────────────────────────────────────────────────────────────────
// resolveCheckoutExecution — decisão + bloqueio anti-R1
// ─────────────────────────────────────────────────────────────────────

describe("resolveCheckoutExecution", () => {
  it("sem token → { mode: 'mock' } (segue mockando)", () => {
    expect(resolveCheckoutExecution({ productType: "boost" })).toEqual({ mode: "mock" });
  });

  it("token presente sem gate → BLOQUEIA com 403 PAYMENTS_NOT_LIVE (fix R1)", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-secret";
    try {
      resolveCheckoutExecution({ productType: "boost", userId: "u1", adId: "ad1" });
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err.statusCode).toBe(403);
      expect(err.details?.code).toBe("PAYMENTS_NOT_LIVE");
      expect(err.message).toMatch(/desativados neste ambiente/i);
    }
  });

  it("token + PAYMENTS_LIVE=true → { mode: 'live' }", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "true";
    expect(resolveCheckoutExecution({ productType: "plan" })).toEqual({ mode: "live" });
  });

  it("token + sandbox autorizado → { mode: 'sandbox' }", () => {
    process.env.MP_ACCESS_TOKEN = "TEST-xxxx";
    process.env.MERCADO_PAGO_ENV = "sandbox";
    process.env.PAYMENTS_SANDBOX_ENABLED = "true";
    expect(resolveCheckoutExecution({ productType: "boost" })).toEqual({ mode: "sandbox" });
  });
});

// ─────────────────────────────────────────────────────────────────────
// assertSubscriptionsRealAllowed — cadeado subordinado
// ─────────────────────────────────────────────────────────────────────

describe("assertSubscriptionsRealAllowed", () => {
  it("mode 'mock' nunca exige SUBSCRIPTIONS_LIVE (dev/CI seguem)", () => {
    expect(() => assertSubscriptionsRealAllowed({ mode: "mock" })).not.toThrow();
  });

  it("mode 'live' sem SUBSCRIPTIONS_LIVE → 403 SUBSCRIPTIONS_NOT_LIVE", () => {
    try {
      assertSubscriptionsRealAllowed({ mode: "live", userId: "u1", planId: "cnpj-store-start" });
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err.statusCode).toBe(403);
      expect(err.details?.code).toBe("SUBSCRIPTIONS_NOT_LIVE");
    }
  });

  it("mode 'live' + SUBSCRIPTIONS_LIVE=1 → não lança", () => {
    process.env.SUBSCRIPTIONS_LIVE = "1";
    expect(() => assertSubscriptionsRealAllowed({ mode: "live" })).not.toThrow();
  });

  it("mode 'sandbox' + SUBSCRIPTIONS_LIVE=true → não lança", () => {
    process.env.SUBSCRIPTIONS_LIVE = "true";
    expect(() => assertSubscriptionsRealAllowed({ mode: "sandbox" })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────
// getPaymentsGateDiagnostics — health seguro
// ─────────────────────────────────────────────────────────────────────

describe("getPaymentsGateDiagnostics", () => {
  it("ambiente limpo → mock, tudo desligado, sem warnings", () => {
    const d = getPaymentsGateDiagnostics();
    expect(d.mode).toBe("mock");
    expect(d.payments_live_enabled).toBe(false);
    expect(d.subscriptions_live_enabled).toBe(false);
    expect(d.mercado_pago_token_present).toBe(false);
    expect(d.webhook_secret_present).toBe(false);
    expect(d.checkout_real_enabled).toBe(false);
    expect(d.subscriptions_real_enabled).toBe(false);
    expect(d.warnings).toEqual([]);
  });

  it("NUNCA expõe o valor do token/segredo no payload", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-super-secret-value-123";
    process.env.MP_WEBHOOK_SECRET = "webhook-hmac-secret-456";
    const d = getPaymentsGateDiagnostics();
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain("APP_USR-super-secret-value-123");
    expect(serialized).not.toContain("webhook-hmac-secret-456");
    // Apenas presença booleana é exposta
    expect(d.mercado_pago_token_present).toBe(true);
    expect(d.webhook_secret_present).toBe(true);
  });

  it("token presente sem gate → warning de checkout bloqueado + checkout_real_enabled=false", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    const d = getPaymentsGateDiagnostics();
    expect(d.checkout_real_enabled).toBe(false);
    expect(d.warnings.some((w) => /BLOQUEADOS/i.test(w))).toBe(true);
  });

  it("PAYMENTS_LIVE=true sem token → warning de credencial ausente", () => {
    process.env.PAYMENTS_LIVE = "true";
    const d = getPaymentsGateDiagnostics();
    expect(d.payments_live_enabled).toBe(true);
    expect(d.checkout_real_enabled).toBe(false);
    expect(d.warnings.some((w) => /MP_ACCESS_TOKEN ausente/i.test(w))).toBe(true);
  });

  it("cobrança real sem MP_WEBHOOK_SECRET → warning de webhook spoofável", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.PAYMENTS_LIVE = "true";
    const d = getPaymentsGateDiagnostics();
    expect(d.mode).toBe("live");
    expect(d.warnings.some((w) => /spoof/i.test(w))).toBe(true);
  });

  it("SUBSCRIPTIONS_LIVE ligado sem PAYMENTS_LIVE → warning de subordinação", () => {
    process.env.SUBSCRIPTIONS_LIVE = "1";
    const d = getPaymentsGateDiagnostics();
    expect(d.subscriptions_live_enabled).toBe(true);
    expect(d.subscriptions_real_enabled).toBe(false);
    expect(d.warnings.some((w) => /subordinada a PAYMENTS_LIVE/i.test(w))).toBe(true);
  });

  it("live + token + webhook secret + SUBSCRIPTIONS_LIVE → assinatura real habilitada, sem warning de spoof", () => {
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxxx";
    process.env.MP_WEBHOOK_SECRET = "secret";
    process.env.PAYMENTS_LIVE = "true";
    process.env.SUBSCRIPTIONS_LIVE = "1";
    process.env.NODE_ENV = "production";
    const d = getPaymentsGateDiagnostics();
    expect(d.mode).toBe("live");
    expect(d.checkout_real_enabled).toBe(true);
    expect(d.subscriptions_real_enabled).toBe(true);
    expect(d.warnings.some((w) => /spoof/i.test(w))).toBe(false);
  });
});
