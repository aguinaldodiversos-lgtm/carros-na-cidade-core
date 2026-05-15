import { describe, expect, it } from "vitest";

import { detectTestAd } from "../../scripts/audit/lib/detect-test-ad.mjs";

describe("detectTestAd — anúncios reais não são flagados", () => {
  it("anúncio real com Honda Civic 2019 não é suspeito", () => {
    const result = detectTestAd({
      title: "Honda Civic LXR 2.0 2019 — Único dono",
      slug: "honda-civic-lxr-2-0-2019-unico-dono-12345",
      brand: "Honda",
      model: "Civic",
      version: "LXR 2.0",
      description: "Vendo Civic em ótimo estado, único dono, manual e chave reserva.",
    });
    expect(result.isSuspect).toBe(false);
    expect(result.confidence).toBe("none");
  });

  it("anúncio com descrição comum não dispara low só por isso", () => {
    const result = detectTestAd({
      title: "Toyota Corolla XEi 2.0 Flex 2022",
      slug: "toyota-corolla-xei-2-0-flex-2022-99887",
      brand: "Toyota",
      model: "Corolla",
      description: "Carro impecável, todas as revisões em concessionária Toyota.",
    });
    expect(result.isSuspect).toBe(false);
  });
});

describe("detectTestAd — HIGH severity (DeployModel, lorem ipsum, fila worker)", () => {
  it("título 'DeployModel1775172829' → high", () => {
    const result = detectTestAd({ title: "DeployModel1775172829" });
    expect(result.isSuspect).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.startsWith("title:"))).toBe(true);
  });

  it("título com 'fila worker' → high", () => {
    const result = detectTestAd({ title: "Teste fila worker — alerta 12h" });
    expect(result.confidence).toBe("high");
  });

  it("modelo 'DeployModel' → high mesmo com título limpo", () => {
    const result = detectTestAd({
      title: "Civic 2019",
      model: "DeployModel",
    });
    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.startsWith("model:"))).toBe(true);
  });

  it("descrição com 'lorem ipsum dolor' → high", () => {
    const result = detectTestAd({
      title: "Civic LXR",
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    });
    expect(result.confidence).toBe("high");
  });

  it("título 'Teste alerta automatic' → high (alerta + test combinados)", () => {
    const result = detectTestAd({ title: "Teste alerta automatic check" });
    expect(result.confidence).toBe("high");
  });

  it("título 'smoke test ad' → high", () => {
    const result = detectTestAd({ title: "Smoke test ad #42" });
    expect(result.confidence).toBe("high");
  });

  it("slug começa com 'test-' ou 'deploy-' → high", () => {
    expect(detectTestAd({ slug: "test-deploy-1234" }).confidence).toBe("high");
    expect(detectTestAd({ slug: "deploy-model-xyz" }).confidence).toBe("high");
    expect(detectTestAd({ slug: "seed-toyota-corolla" }).confidence).toBe("high");
  });

  it("slug com timestamp longo (10+ dígitos) → high", () => {
    const result = detectTestAd({ slug: "civic-1775172829-test" });
    expect(result.confidence).toBe("high");
  });
});

describe("detectTestAd — MEDIUM severity (palavras de teste em título)", () => {
  it("título 'Teste de Honda Civic' → medium", () => {
    const result = detectTestAd({ title: "Teste de Honda Civic" });
    expect(result.isSuspect).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("título começando com 'test' → medium", () => {
    expect(detectTestAd({ title: "Test ad publication" }).confidence).toBe("medium");
  });

  it("título com 'mock', 'fake', 'demo' isolados → medium", () => {
    expect(detectTestAd({ title: "Honda Civic mock" }).confidence).toBe("medium");
    expect(detectTestAd({ title: "Demo ad 2022" }).confidence).toBe("medium");
  });
});

describe("detectTestAd — LOW severity (heurísticas fracas)", () => {
  it("título muito curto < 8 chars → low", () => {
    const result = detectTestAd({ title: "Civic" });
    expect(result.confidence).toBe("low");
    expect(result.reasons).toContain("title:too-short");
  });

  it("título igual à marca pura → low", () => {
    const result = detectTestAd({ title: "Toyota", brand: "Toyota" });
    expect(result.confidence).toBe("low");
  });

  it("descrição com pontos repetidos → low", () => {
    const result = detectTestAd({
      title: "Honda Civic 2019",
      description: "...",
    });
    expect(result.confidence).toBe("low");
  });
});

describe("detectTestAd — robustez de input", () => {
  it("ad null/undefined → não-suspeito (não joga)", () => {
    expect(detectTestAd(null).isSuspect).toBe(false);
    expect(detectTestAd(undefined).isSuspect).toBe(false);
    expect(detectTestAd({}).isSuspect).toBe(false);
  });

  it("campos null individuais não jogam", () => {
    const result = detectTestAd({
      title: null,
      slug: null,
      brand: null,
      model: null,
      description: null,
    });
    expect(result.isSuspect).toBe(false);
  });

  it("severity HIGH stack — múltiplos reasons em campos diferentes", () => {
    const result = detectTestAd({
      title: "DeployModel test alerta",
      slug: "deploy-test-12345678901",
      model: "DeployModel",
      description: "lorem ipsum dolor",
    });
    expect(result.confidence).toBe("high");
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
