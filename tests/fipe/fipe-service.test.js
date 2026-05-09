import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveFipeReference,
  fipeValueForRiskScoring,
} from "../../src/modules/fipe/fipe.service.js";

beforeEach(() => {
  delete process.env.FIPE_BACKEND_DISABLED;
  delete process.env.FIPE_ALLOW_CLIENT_HINT;
});

describe("resolveFipeReference — fonte autoritativa do valor FIPE", () => {
  it("HIGH confidence quando códigos canônicos + provider OK", async () => {
    const quote = vi.fn(async () => ({
      ok: true,
      price: 85_123,
      fipeCode: "001234-5",
      referenceMonth: "maio de 2026",
    }));
    const r = await resolveFipeReference(
      {
        brand: "Honda",
        model: "Civic",
        year: 2018,
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
      },
      { quote, logger: { warn() {}, info() {} } }
    );
    expect(r.ok).toBe(true);
    expect(r.value).toBe(85_123);
    expect(r.confidence).toBe("high");
    expect(r.fipe_source).toBe("parallelum");
    expect(r.used_client_hint).toBe(false);
    expect(r.fipe_code).toBe("001234-5");
  });

  it("CLIENT_HINT (low) quando NÃO há códigos mas cliente enviou fipe_value plausível", async () => {
    const quote = vi.fn();
    const r = await resolveFipeReference(
      { brand: "Honda", model: "Civic", year: 2018, client_hint_value: 80_000 },
      { quote, logger: { warn() {}, info() {} } }
    );
    expect(r.ok).toBe(false); // hint NUNCA é autoritativo
    expect(r.value).toBe(null); // pipeline lê null
    expect(r.confidence).toBe("low");
    expect(r.used_client_hint).toBe(true);
    expect(r.client_hint_value).toBe(80_000);
    expect(quote).not.toHaveBeenCalled();
  });

  it("UNAVAILABLE quando sem códigos e sem hint", async () => {
    const r = await resolveFipeReference(
      { brand: "Honda", model: "Civic", year: 2018 },
      { quote: vi.fn(), logger: { warn() {}, info() {} } }
    );
    expect(r.ok).toBe(false);
    expect(r.value).toBe(null);
    expect(r.confidence).toBe("none");
    expect(r.failure_reason).toBe("no_codes_no_hint");
  });

  it("códigos presentes mas provider falha → cai em CLIENT_HINT se houver", async () => {
    const quote = vi.fn(async () => ({ ok: false, reason: "network_error" }));
    const r = await resolveFipeReference(
      {
        brand: "Honda",
        model: "Civic",
        year: 2018,
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
        client_hint_value: 80_000,
      },
      { quote, logger: { warn() {}, info() {} } }
    );
    expect(r.confidence).toBe("low");
    expect(r.used_client_hint).toBe(true);
    expect(r.failure_reason).toBe("server_lookup_skipped");
  });

  it("códigos presentes, provider falha, sem hint → UNAVAILABLE", async () => {
    const quote = vi.fn(async () => ({ ok: false, reason: "network_error" }));
    const r = await resolveFipeReference(
      {
        fipe_brand_code: "23",
        fipe_model_code: "5585",
        fipe_year_code: "2018-1",
      },
      { quote, logger: { warn() {}, info() {} } }
    );
    expect(r.ok).toBe(false);
    expect(r.confidence).toBe("none");
    expect(r.failure_reason).toBe("provider_unavailable");
  });

  it("FIPE_ALLOW_CLIENT_HINT=false desliga até o registro do hint", async () => {
    process.env.FIPE_ALLOW_CLIENT_HINT = "false";
    const r = await resolveFipeReference(
      { client_hint_value: 80_000 },
      { quote: vi.fn(), logger: { warn() {}, info() {} } }
    );
    expect(r.ok).toBe(false);
    expect(r.confidence).toBe("none");
    expect(r.used_client_hint).toBe(false);
  });

  it("hint extremo (negativo, gigante, 0) é descartado mesmo com flag aceita", async () => {
    for (const v of [-1, 0, 100, 999, 99_999_999, "abc"]) {
      const r = await resolveFipeReference(
        { client_hint_value: v },
        { quote: vi.fn(), logger: { warn() {}, info() {} } }
      );
      expect(r.confidence).toBe("none");
    }
  });
});

describe("fipeValueForRiskScoring — extração para o adRiskService", () => {
  it("retorna o valor SOMENTE quando confidence='high'", () => {
    expect(
      fipeValueForRiskScoring({ ok: true, value: 85_000, confidence: "high" })
    ).toBe(85_000);
  });

  it("retorna null para confidence='low' (hint do cliente)", () => {
    expect(
      fipeValueForRiskScoring({
        ok: false,
        value: null,
        confidence: "low",
        used_client_hint: true,
      })
    ).toBe(null);
  });

  it("retorna null quando snapshot inválido", () => {
    expect(fipeValueForRiskScoring(null)).toBe(null);
    expect(fipeValueForRiskScoring(undefined)).toBe(null);
    expect(fipeValueForRiskScoring({ ok: true, value: 0, confidence: "high" })).toBe(
      null
    );
  });
});
