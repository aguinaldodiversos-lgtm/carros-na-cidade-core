import { afterEach, describe, expect, it } from "vitest";
import { resolvePublicUrls } from "../../src/modules/payments/payments.routes.js";

const previousFrontendUrl = process.env.FRONTEND_URL;
const previousNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = previousFrontendUrl;
  process.env.NODE_ENV = previousNodeEnv;
});

describe("retornos do checkout — origem sob controle do servidor", () => {
  it("ignora overrides maliciosos de body e Host", () => {
    process.env.FRONTEND_URL = "https://www.carrosnacidade.com";
    process.env.NODE_ENV = "production";
    const urls = resolvePublicUrls({
      body: { success_url: "https://checkout-falso.example/phishing" },
      protocol: "https",
      get: () => "checkout-falso.example",
    });
    expect(urls).toEqual({
      successUrl: "https://www.carrosnacidade.com/pagamento/sucesso",
      failureUrl: "https://www.carrosnacidade.com/pagamento/erro",
      pendingUrl: "https://www.carrosnacidade.com/pagamento/erro",
    });
  });

  it("recusa origem externa mesmo quando configurada acidentalmente", () => {
    process.env.FRONTEND_URL = "https://phishing.example";
    process.env.NODE_ENV = "production";
    expect(() => resolvePublicUrls()).toThrow(/Origem de retorno/);
  });

  it("recusa http em produção", () => {
    process.env.FRONTEND_URL = "http://www.carrosnacidade.com";
    process.env.NODE_ENV = "production";
    expect(() => resolvePublicUrls()).toThrow(/Origem de retorno/);
  });
});
