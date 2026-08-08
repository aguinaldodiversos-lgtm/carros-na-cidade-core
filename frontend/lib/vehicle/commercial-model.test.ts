// @vitest-environment node
import { describe, expect, it } from "vitest";

import { deriveCommercialModel, commercialModelSlug } from "./commercial-model";
import { brandModelSlug } from "@/lib/seo/brand-model-slug";
// Fixtures COMPARTILHADAS com o backend. Importadas do arquivo original (e não
// copiadas) de propósito: é a cópia que apodrece. Se este import quebrar num
// futuro reempacotamento, copie o array E adicione um teste que compare os
// dois — nunca deixe as duas listas divergirem em silêncio.
import { COMMERCIAL_MODEL_FIXTURES } from "../../../src/shared/vehicle/commercial-model.fixtures.js";

interface Fixture {
  real?: boolean;
  brand: string | null;
  model: string;
  label: string | null;
  slug: string | null;
  source: string | null;
}

const fixtures = COMMERCIAL_MODEL_FIXTURES as unknown as Fixture[];

describe("deriveCommercialModel (frontend) — mesmas fixtures do backend", () => {
  for (const fx of fixtures) {
    const tag = fx.real ? "[prod]" : "[sint]";
    it(`${tag} ${fx.brand ?? "∅"} | ${fx.model || "∅"} → ${fx.label ?? "null"}`, () => {
      const result = deriveCommercialModel(fx.model, { brand: fx.brand });
      if (fx.label === null) {
        expect(result).toBeNull();
        return;
      }
      expect(result).not.toBeNull();
      expect(result!.label).toBe(fx.label);
      expect(result!.slug).toBe(fx.slug);
      expect(result!.source).toBe(fx.source);
    });
  }
});

describe("versão FIPE NUNCA é tratada como modelo comercial", () => {
  const onixFipeVersions = fixtures.filter((fx) => fx.real && fx.slug === "onix").map((f) => f.model);

  it("as 4 versões FIPE do Onix colapsam num único slug comercial", () => {
    expect(onixFipeVersions.length).toBe(4);
    const slugs = new Set(
      onixFipeVersions.map((m) => commercialModelSlug(m, { brand: "GM - Chevrolet" }))
    );
    expect([...slugs]).toEqual(["onix"]);
  });

  it("o slug ingênuo da versão FIPE seria diferente (prova do bug)", () => {
    const naive = new Set(onixFipeVersions.map((m) => brandModelSlug(m)));
    expect(naive.size).toBe(4);
    for (const slug of naive) expect(slug).not.toBe("onix");
  });
});

describe("guardas contra invenção", () => {
  it("recusa motorização/válvulas/portas como cabeça de modelo", () => {
    expect(deriveCommercialModel("1.6 MSI Flex 16V", { brand: "VW - VolksWagen" })).toBeNull();
    expect(deriveCommercialModel("16V Flex 4p", { brand: "Fiat" })).toBeNull();
    expect(deriveCommercialModel("5p Aut.", { brand: "Fiat" })).toBeNull();
  });

  it("não devolve um número puro como entidade", () => {
    const result = deriveCommercialModel("5 Luxury 1.5 TB FWD", { brand: "Omoda" });
    expect(result!.label).not.toBe("5");
    expect(result!.slug).not.toBe("5");
  });
});
