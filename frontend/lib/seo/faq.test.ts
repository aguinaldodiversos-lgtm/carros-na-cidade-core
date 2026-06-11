import { describe, it, expect } from "vitest";
import { buildFaqPageJsonLd, buildCityFaqEntries, buildBelowFipeFaqEntries } from "./faq";

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
