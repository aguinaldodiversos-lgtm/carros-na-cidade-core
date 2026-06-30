import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * getFrontendPublicUrl — fonte da back_url do preapproval (assinatura).
 *
 * O MP /preapproval valida back_url estritamente: precisa ser https público
 * absoluto. Este helper garante isso a partir das envs de frontend, falhando
 * com 500 claro quando ausente (em vez de deixar o MP devolver 400 genérico).
 */

const FRONTEND_ENV_KEYS = ["FRONTEND_URL", "SITE_URL", "NEXT_PUBLIC_SITE_URL", "PUBLIC_SITE_URL"];

let getFrontendPublicUrl;
let saved;

beforeEach(async () => {
  saved = {};
  for (const k of FRONTEND_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  ({ getFrontendPublicUrl } = await import("../../src/modules/payments/payments.service.js"));
});

afterEach(() => {
  for (const k of FRONTEND_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getFrontendPublicUrl", () => {
  it("usa FRONTEND_URL https e remove a barra final", () => {
    process.env.FRONTEND_URL = "https://carrosnacidade.com/";
    expect(getFrontendPublicUrl()).toBe("https://carrosnacidade.com");
  });

  it("ordem de precedência: FRONTEND_URL > SITE_URL > NEXT_PUBLIC_SITE_URL > PUBLIC_SITE_URL", () => {
    process.env.SITE_URL = "https://site.example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://next.example.com";
    expect(getFrontendPublicUrl()).toBe("https://site.example.com");

    process.env.FRONTEND_URL = "https://front.example.com";
    expect(getFrontendPublicUrl()).toBe("https://front.example.com");
  });

  it("cai para PUBLIC_SITE_URL quando é a única definida", () => {
    process.env.PUBLIC_SITE_URL = "https://public.example.com";
    expect(getFrontendPublicUrl()).toBe("https://public.example.com");
  });

  it("lança 500 quando nenhuma env de frontend está definida", () => {
    expect(() => getFrontendPublicUrl()).toThrow(/frontend.*back_url|FRONTEND_URL/i);
    try {
      getFrontendPublicUrl();
    } catch (e) {
      expect(e.statusCode).toBe(500);
    }
  });

  it("REJEITA http:// (MP /preapproval exige https)", () => {
    process.env.FRONTEND_URL = "http://carrosnacidade.com";
    expect(() => getFrontendPublicUrl()).toThrow();
  });

  it("REJEITA localhost http (motivo do 400 do MP em teste local)", () => {
    process.env.FRONTEND_URL = "http://localhost:3000";
    expect(() => getFrontendPublicUrl()).toThrow();
  });

  it("REJEITA valor relativo / sem esquema", () => {
    process.env.FRONTEND_URL = "carrosnacidade.com/pagamento";
    expect(() => getFrontendPublicUrl()).toThrow();
  });
});
