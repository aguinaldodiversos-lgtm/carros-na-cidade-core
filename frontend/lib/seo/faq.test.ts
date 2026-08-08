import { describe, it, expect } from "vitest";
import {
  buildFaqPageJsonLd,
  buildCityFaqEntries,
  buildCityInventoryFaqEntries,
  buildBelowFipeFaqEntries,
} from "./faq";

describe("buildFaqPageJsonLd", () => {
  it("monta FAQPage com Question/Answer", () => {
    const ld = buildFaqPageJsonLd([{ question: "P?", answer: "R." }]);
    expect(ld).toBeTruthy();
    expect(ld!["@type"]).toBe("FAQPage");
    const main = ld!.mainEntity as Array<Record<string, unknown>>;
    expect(main[0]["@type"]).toBe("Question");
    expect(main[0].name).toBe("P?");
    expect((main[0].acceptedAnswer as Record<string, unknown>).text).toBe("R.");
  });

  it("retorna null para lista vazia (não emite schema sem conteúdo visível)", () => {
    expect(buildFaqPageJsonLd([])).toBe(null);
    expect(buildFaqPageJsonLd([{ question: "", answer: "x" }])).toBe(null);
    // @ts-expect-error defensivo
    expect(buildFaqPageJsonLd(null)).toBe(null);
  });
});

describe("buildCityFaqEntries", () => {
  it("inclui o nome da cidade e cobre as 5 perguntas do §7", () => {
    const entries = buildCityFaqEntries({ cityName: "Atibaia", stateUf: "SP" });
    expect(entries).toHaveLength(5);
    expect(entries[0].question).toContain("Atibaia");
    expect(entries.every((e) => e.answer.trim().length > 0)).toBe(true);
  });

  it("não quebra sem cidade", () => {
    const entries = buildCityFaqEntries({ cityName: "" });
    expect(entries[0].question).toContain("sua cidade");
  });
});

describe("buildBelowFipeFaqEntries", () => {
  it("cobre o que é, por que, golpe e laudo cautelar", () => {
    const entries = buildBelowFipeFaqEntries({ cityName: "Atibaia" });
    const joined = entries.map((e) => e.question.toLowerCase()).join(" ");
    expect(joined).toContain("abaixo da fipe");
    expect(joined).toContain("golpe");
    expect(joined).toContain("laudo cautelar");
    expect(entries[0].answer).toContain("Atibaia");
  });
});

describe("buildCityInventoryFaqEntries — perguntas respondidas com dado real", () => {
  const atibaia = {
    cityName: "Atibaia",
    activeAds: 27,
    activeDealers: 1,
    automaticCount: 9,
    belowFipeCount: 8,
    brandLabels: ["Fiat", "Chevrolet", "Volkswagen"],
    medianPrice: 72500,
  };

  it("responde a contagem com o número real da cidade", () => {
    const entries = buildCityInventoryFaqEntries(atibaia);
    const q = entries.find((e) => e.question.includes("Quantos carros"));
    expect(q!.question).toContain("Atibaia");
    expect(q!.answer).toContain("27 veículos anunciados");
    expect(q!.answer).toContain("1 anunciante");
  });

  it("usa o rótulo canônico da marca, nunca a grafia crua da FIPE", () => {
    const entries = buildCityInventoryFaqEntries(atibaia);
    const text = entries.map((e) => e.answer).join(" ");
    expect(text).toContain("Chevrolet");
    expect(text).not.toContain("GM - Chevrolet");
    expect(text).not.toContain("VolksWagen");
  });

  it("OMITE a pergunta quando o dado que a responde não existe", () => {
    const entries = buildCityInventoryFaqEntries({
      ...atibaia,
      automaticCount: 0,
      belowFipeCount: 0,
      medianPrice: null,
      brandLabels: [],
    });
    const questions = entries.map((e) => e.question).join(" | ");
    expect(questions).not.toMatch(/automáticos/i);
    expect(questions).not.toMatch(/abaixo da FIPE/i);
    expect(questions).not.toMatch(/Quanto custa/i);
    expect(questions).not.toMatch(/Quais marcas/i);
    // A contagem e a natureza do portal sobrevivem — são sempre respondíveis.
    expect(questions).toMatch(/Quantos carros/);
  });

  it("cidade sem estoque não gera nenhuma pergunta de inventário", () => {
    expect(buildCityInventoryFaqEntries({ ...atibaia, activeAds: 0 })).toEqual([]);
  });

  it("declara que o portal NÃO vende nem intermedeia (alinhado aos Termos)", () => {
    const entries = buildCityInventoryFaqEntries(atibaia);
    const answer = entries.find((e) => e.question.includes("vendidos pelo"))!.answer;
    expect(answer).toMatch(/não vende/i);
    expect(answer).toMatch(/não intermedia pagamento/i);
    expect(answer).toMatch(/não garante o veículo/i);
  });

  it("a mediana é apresentada como retrato do anunciado, não como avaliação", () => {
    const answer = buildCityInventoryFaqEntries(atibaia).find((e) =>
      e.question.includes("Quanto custa")
    )!.answer;
    expect(answer).toMatch(/mediana do que está anunciado/i);
    expect(answer).toMatch(/não uma avaliação de mercado/i);
  });

  it("independência territorial: outra cidade, outros números", () => {
    const braganca = buildCityInventoryFaqEntries({
      cityName: "Bragança Paulista",
      activeAds: 9,
      activeDealers: 2,
      automaticCount: 4,
      belowFipeCount: 0,
      brandLabels: ["Toyota"],
      medianPrice: 55000,
    });
    const text = braganca.map((e) => `${e.question} ${e.answer}`).join(" ");
    expect(text).toContain("Bragança Paulista");
    expect(text).not.toContain("Atibaia");
    expect(text).toContain("9 veículos anunciados");
    expect(text).not.toContain("27");
  });
});

describe("FAQ visível e FAQPage saem da MESMA lista", () => {
  it("toda pergunta de inventário entra no schema", () => {
    const entries = [
      ...buildCityInventoryFaqEntries({
        cityName: "Atibaia",
        activeAds: 27,
        activeDealers: 1,
        automaticCount: 9,
        belowFipeCount: 8,
        brandLabels: ["Fiat"],
        medianPrice: 72500,
      }),
      ...buildCityFaqEntries({ cityName: "Atibaia", stateUf: "SP" }),
    ];
    const ld = buildFaqPageJsonLd(entries)!;
    const main = ld.mainEntity as Array<Record<string, unknown>>;
    expect(main.length).toBe(entries.length);
    expect(main.map((q) => q.name)).toEqual(entries.map((e) => e.question));
  });
});
