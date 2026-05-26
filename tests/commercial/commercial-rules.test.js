/**
 * Testes unitários do service central de regras comerciais (Fase 2.1).
 *
 * Mocka `platform/settings.service.js#getSetting` para simular:
 *   - chave ausente → cai no default canônico
 *   - chave com valor válido → retorna o valor
 *   - chave com valor fora de range → cai no default
 *   - chave com tipo inválido → cai no default
 *   - banco falhando → ainda assim DEFAULTS são retornados (NUNCA throw)
 *
 * O service de produção é offline-safe e nunca pode derrubar checkout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/platform/settings.service.js", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "../../src/modules/platform/settings.service.js";
import {
  getCommercialRules,
  getBoostOptions,
  getBoostOptionsFallback,
  BOOST_OPTIONS_FALLBACK,
  DUPLICATE_BEHAVIORS,
} from "../../src/modules/commercial/commercial-rules.service.js";

const DEFAULTS = Object.freeze({
  boost_default_price_cents: 3990,
  boost_default_days: 7,
  boost_duplicate_behavior: "extend_duration",
  boost_max_extension_days: 90,
  allow_boost_cpf: true,
  allow_boost_cnpj: true,
  pro_ad_limit_guard: 1000,
});

function mockSettings(values) {
  vi.mocked(getSetting).mockImplementation((key, fallback) => {
    if (key in values) return Promise.resolve(values[key]);
    return Promise.resolve(fallback);
  });
}

describe("commercial-rules.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCommercialRules — defaults", () => {
    it("retorna DEFAULTS quando nenhuma chave existe", async () => {
      mockSettings({});
      const rules = await getCommercialRules();
      expect(rules).toEqual(DEFAULTS);
    });

    it("nunca lança exception — banco quebrado vira fallback silencioso", async () => {
      vi.mocked(getSetting).mockImplementation(() => Promise.reject(new Error("db down")));
      const rules = await getCommercialRules();
      expect(rules).toEqual(DEFAULTS);
    });
  });

  describe("getCommercialRules — override válido", () => {
    it("reflete preço editado pelo admin", async () => {
      mockSettings({ "commercial.boost_default_price_cents": 4990 });
      const rules = await getCommercialRules();
      expect(rules.boost_default_price_cents).toBe(4990);
      // demais valores caem no default
      expect(rules.boost_default_days).toBe(DEFAULTS.boost_default_days);
    });

    it("reflete dias editados pelo admin", async () => {
      mockSettings({ "commercial.boost_default_days": 14 });
      const rules = await getCommercialRules();
      expect(rules.boost_default_days).toBe(14);
    });

    it("reflete bloqueios CPF/CNPJ", async () => {
      mockSettings({
        "commercial.allow_boost_cpf": false,
        "commercial.allow_boost_cnpj": false,
      });
      const rules = await getCommercialRules();
      expect(rules.allow_boost_cpf).toBe(false);
      expect(rules.allow_boost_cnpj).toBe(false);
    });

    it("aceita boost_duplicate_behavior canônico", async () => {
      for (const behavior of DUPLICATE_BEHAVIORS) {
        mockSettings({ "commercial.boost_duplicate_behavior": behavior });
        const rules = await getCommercialRules();
        expect(rules.boost_duplicate_behavior).toBe(behavior);
      }
    });

    it("reflete pro_ad_limit_guard editado pelo admin", async () => {
      mockSettings({ "commercial.pro_ad_limit_guard": 5000 });
      const rules = await getCommercialRules();
      expect(rules.pro_ad_limit_guard).toBe(5000);
    });
  });

  describe("getCommercialRules — valor inválido cai no default", () => {
    it("range-out price → default", async () => {
      mockSettings({ "commercial.boost_default_price_cents": 50 }); // < min=100
      const rules = await getCommercialRules();
      expect(rules.boost_default_price_cents).toBe(DEFAULTS.boost_default_price_cents);
    });

    it("range-out days → default", async () => {
      mockSettings({ "commercial.boost_default_days": 9999 }); // > max=365
      const rules = await getCommercialRules();
      expect(rules.boost_default_days).toBe(DEFAULTS.boost_default_days);
    });

    it("tipo errado em int → default", async () => {
      mockSettings({ "commercial.boost_default_price_cents": "not-a-number" });
      const rules = await getCommercialRules();
      expect(rules.boost_default_price_cents).toBe(DEFAULTS.boost_default_price_cents);
    });

    it("duplicate_behavior fora da whitelist → default extend_duration", async () => {
      mockSettings({ "commercial.boost_duplicate_behavior": "wrong_value" });
      const rules = await getCommercialRules();
      expect(rules.boost_duplicate_behavior).toBe(DEFAULTS.boost_duplicate_behavior);
    });
  });

  describe("getBoostOptions", () => {
    it("monta boost-7d com preço/dias de platform_settings", async () => {
      mockSettings({
        "commercial.boost_default_price_cents": 4990,
        "commercial.boost_default_days": 14,
      });
      const options = await getBoostOptions();
      const boost7d = options.find((o) => o.id === "boost-7d");
      expect(boost7d).toMatchObject({
        id: "boost-7d",
        days: 14,
        price: 49.9,
      });
    });

    it("mantém boost-30d como fallback estático", async () => {
      mockSettings({});
      const options = await getBoostOptions();
      const boost30d = options.find((o) => o.id === "boost-30d");
      expect(boost30d).toMatchObject({
        id: "boost-30d",
        days: 30,
        price: 129.9,
      });
    });

    it("nunca retorna lista vazia", async () => {
      mockSettings({});
      const options = await getBoostOptions();
      expect(options.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getBoostOptionsFallback", () => {
    it("retorna snapshot estático sem hit no banco", () => {
      // não chama mockSettings — confirma que NÃO usa getSetting
      const options = getBoostOptionsFallback();
      expect(getSetting).not.toHaveBeenCalled();
      expect(options.length).toBe(BOOST_OPTIONS_FALLBACK.length);
      expect(options[0]).toMatchObject({ id: "boost-7d", days: 7, price: 39.9 });
    });

    it("devolve clone independente — caller pode mutar sem afetar próximos", () => {
      const a = getBoostOptionsFallback();
      a[0].price = 999;
      const b = getBoostOptionsFallback();
      expect(b[0].price).toBe(39.9);
    });
  });
});
