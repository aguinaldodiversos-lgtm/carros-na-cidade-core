import { describe, it, expect } from "vitest";

import { deriveCommercialModel, commercialModelSlug } from "./commercial-model.js";
import { COMMERCIAL_MODEL_FIXTURES } from "./commercial-model.fixtures.js";
import { brandModelSlug } from "../utils/slugify.js";

describe("deriveCommercialModel — fixtures compartilhadas", () => {
  for (const fx of COMMERCIAL_MODEL_FIXTURES) {
    const tag = fx.real ? "[prod]" : "[sint]";
    it(`${tag} ${fx.brand ?? "∅"} | ${fx.model || "∅"} → ${fx.label ?? "null"}`, () => {
      const result = deriveCommercialModel(fx.model, { brand: fx.brand });
      if (fx.label === null) {
        expect(result).toBeNull();
        return;
      }
      expect(result).not.toBeNull();
      expect(result.label).toBe(fx.label);
      expect(result.slug).toBe(fx.slug);
      expect(result.source).toBe(fx.source);
    });
  }
});

describe("versão FIPE NUNCA é tratada como modelo comercial", () => {
  // A regressão que esta fase existe para impedir: as quatro descrições FIPE
  // do Onix em produção precisam colapsar numa entidade só. Se voltarem a ser
  // quatro, o sitemap de modelos volta a ficar vazio e as quatro URLs viram
  // páginas magras.
  const onixFipeVersions = COMMERCIAL_MODEL_FIXTURES.filter(
    (fx) => fx.real && fx.slug === "onix"
  ).map((fx) => fx.model);

  it("as 4 versões FIPE do Onix existem nas fixtures", () => {
    expect(onixFipeVersions.length).toBe(4);
  });

  it("colapsam num único slug comercial", () => {
    const slugs = new Set(
      onixFipeVersions.map((m) => commercialModelSlug(m, { brand: "GM - Chevrolet" }))
    );
    expect([...slugs]).toEqual(["onix"]);
  });

  it("o slug ingênuo da versão FIPE seria DIFERENTE do comercial", () => {
    // Prova de que o bug era real: sem esta camada cada versão gera sua URL.
    const naive = new Set(onixFipeVersions.map((m) => brandModelSlug(m)));
    expect(naive.size).toBe(4);
    for (const slug of naive) expect(slug).not.toBe("onix");
  });
});

describe("guardas contra invenção", () => {
  it("recusa quando o primeiro token é motorização", () => {
    expect(deriveCommercialModel("1.6 MSI Flex 16V", { brand: "VW - VolksWagen" })).toBeNull();
  });

  it("recusa quando o primeiro token é contagem de válvulas/portas", () => {
    expect(deriveCommercialModel("16V Flex 4p", { brand: "Fiat" })).toBeNull();
    expect(deriveCommercialModel("5p Aut.", { brand: "Fiat" })).toBeNull();
  });

  it("recusa modelo numérico sem marca resolvível", () => {
    expect(deriveCommercialModel("208 Active 1.6", { brand: "" })).toBeNull();
    expect(deriveCommercialModel("208 Active 1.6", {})).toBeNull();
  });

  it("não devolve um número puro como entidade de modelo", () => {
    const result = deriveCommercialModel("5 Luxury 1.5 TB FWD", { brand: "Omoda" });
    expect(result.label).not.toBe("5");
    expect(result.slug).not.toBe("5");
  });

  it("aceita null/undefined sem lançar", () => {
    expect(deriveCommercialModel(null, { brand: "Fiat" })).toBeNull();
    expect(deriveCommercialModel(undefined, {})).toBeNull();
  });
});

describe("caixa de exibição", () => {
  it("title-case em siglas FIPE em caixa alta", () => {
    expect(deriveCommercialModel("VIRTUS 1.6 MSI", { brand: "VW" }).label).toBe("Virtus");
  });

  it("preserva identificadores com dígito ou hífen", () => {
    expect(deriveCommercialModel("HB20 Sense 1.0", { brand: "Hyundai" }).label).toBe("HB20");
    expect(deriveCommercialModel("HR-V EXL 1.8", { brand: "Honda" }).label).toBe("HR-V");
    expect(deriveCommercialModel("C3 Live 1.0", { brand: "Citroën" }).label).toBe("C3");
  });
});
