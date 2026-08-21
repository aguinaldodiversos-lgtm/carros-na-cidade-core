import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM_STATE,
  buildMissingMessage,
  buildValidationState,
  fieldDomId,
  resolveCautionReportStatus,
  toCreatePayload,
  type SaleRequestFormState,
} from "./evaluation";

/**
 * Regras de completude da ficha — testadas SEM montar a tela.
 *
 * É o ganho concreto de a validação ser uma função pura: aqui dá para provar
 * "saldo devedor some quando o financiamento deixa de ser sim" em três linhas,
 * enquanto pela interface a mesma prova exigiria renderizar nove seções,
 * escolher marca, modelo e ano, e enviar quatro fotos.
 */

/** Ficha inteira respondida — o ponto de partida dos testes de regressão. */
const COMPLETE: SaleRequestFormState = {
  ...EMPTY_FORM_STATE,
  brandName: "VW - VolksWagen",
  modelName: "Golf Comfortline 1.4 TSI",
  year: "2016",
  mileage: "85000",
  transmission: "automatico",
  fuelType: "flex",
  cityId: 42,

  condition: "bom",
  tireCondition: "good",

  financingStatus: "no",
  finesStatus: "no",
  ipvaStatus: "paid",
  licensingStatus: "ok",

  cautionReportHas: "no",
  auctionHistory: "no",
  collisionHistory: "no",

  engineCondition: "ok",
  gearboxCondition: "ok",
  suspensionCondition: "ok",

  bodyPaintStatus: "none",

  photoCount: 4,

  // O PISO (4.3.3) — nona seção essencial. Dígitos: R$ 62.500,00.
  minimumPrice: "6250000",
};

const PAYLOAD_EXTRAS = {
  photoKeys: ["sale-requests/7/s/a.webp"],
  fipeBrandCode: "59",
  fipeModelCode: "5940",
  fipeYearCode: "2016-1",
};

describe("progresso", () => {
  it("formulário vazio começa em 0% e com as 9 seções pendentes", () => {
    const result = buildValidationState(EMPTY_FORM_STATE);

    expect(result.progress).toBe(0);
    expect(result.completedSections).toBe(0);
    expect(result.totalSections).toBe(9);
    expect(result.isComplete).toBe(false);
    expect(result.missingSections).toHaveLength(9);
  });

  it("ficha completa chega a 100%", () => {
    const result = buildValidationState(COMPLETE);

    expect(result.progress).toBe(100);
    expect(result.completedSections).toBe(9);
    expect(result.isComplete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("avança seção a seção conforme as respostas entram", () => {
    const tiresOnly = buildValidationState({ ...EMPTY_FORM_STATE, tireCondition: "good" });
    expect(tiresOnly.completedSections).toBe(1);
    expect(tiresOnly.sections.find((s) => s.key === "tires")?.complete).toBe(true);

    const plusCondition = buildValidationState({
      ...EMPTY_FORM_STATE,
      tireCondition: "good",
      condition: "bom",
    });
    expect(plusCondition.completedSections).toBe(2);
    // 2 de 9 seções (o piso entrou como nona na 4.3.3).
    expect(plusCondition.progress).toBe(22);
  });

  it("observações adicionais NÃO entram na contagem", () => {
    // São opcionais. Contá-las travaria a ficha em 8/9 para quem não tem nada a
    // acrescentar — e a barra nunca chegaria a 100%.
    const semNota = buildValidationState(COMPLETE);
    const comNota = buildValidationState({ ...COMPLETE, notes: "Revisões em concessionária." });

    expect(semNota.progress).toBe(100);
    expect(comNota.progress).toBe(100);
    expect(comNota.totalSections).toBe(9);
  });
});

describe("quilometragem — a regressão do gate antigo", () => {
  it("campo VAZIO é incompleto", () => {
    // `Number("")` é `0`, e o gate anterior aceitava isso como "km informada".
    // O envio era liberado e o backend recusava com 400.
    const result = buildValidationState({ ...COMPLETE, mileage: "" });

    expect(result.isComplete).toBe(false);
    expect(result.missing.map((item) => item.field)).toContain("mileage");
  });

  it("zero é VÁLIDO — carro 0 km existe", () => {
    const result = buildValidationState({ ...COMPLETE, mileage: "0" });
    expect(result.isComplete).toBe(true);
  });

  it("acima do teto de sanidade é incompleto", () => {
    const result = buildValidationState({ ...COMPLETE, mileage: "9999999" });
    expect(result.missing.map((item) => item.field)).toContain("mileage");
  });
});

describe("cidade — a causa raiz do botão cinza", () => {
  it("sem cidade ESCOLHIDA a ficha fica incompleta e nomeia o campo", () => {
    // O componente de cidade mantém o texto digitado no input mesmo sem
    // seleção. "Tem texto" nunca pode ser confundido com "tem cidade": só o
    // `id` do catálogo conta.
    const result = buildValidationState({ ...COMPLETE, cityId: null });

    expect(result.isComplete).toBe(false);
    const city = result.missing.find((item) => item.field === "city");
    expect(city?.label).toBe("Cidade");
    expect(city?.message).toMatch(/escolha a cidade na lista/i);
  });
});

describe("regras condicionais", () => {
  it("financiamento sim NÃO exige o saldo", () => {
    const result = buildValidationState({ ...COMPLETE, financingStatus: "yes" });
    expect(result.isComplete).toBe(true);
  });

  it("mecânica com problema EXIGE a descrição", () => {
    const result = buildValidationState({ ...COMPLETE, engineCondition: "issue" });

    expect(result.isComplete).toBe(false);
    expect(result.missing.map((item) => item.field)).toContain("engine_notes");
  });

  it("mecânica com problema e descrição fica completa", () => {
    const result = buildValidationState({
      ...COMPLETE,
      engineCondition: "issue",
      engineNotes: "trepida ao frear",
    });
    expect(result.isComplete).toBe(true);
  });

  it("descrição só com espaços não conta", () => {
    const result = buildValidationState({
      ...COMPLETE,
      gearboxCondition: "issue",
      gearboxNotes: "   ",
    });
    expect(result.missing.map((item) => item.field)).toContain("gearbox_notes");
  });

  it("lataria com detalhes EXIGE ao menos um marcado", () => {
    const result = buildValidationState({ ...COMPLETE, bodyPaintStatus: "issues" });
    expect(result.missing.map((item) => item.field)).toContain("body_paint_issues");
  });

  it("lataria com detalhes marcados fica completa", () => {
    const result = buildValidationState({
      ...COMPLETE,
      bodyPaintStatus: "issues",
      bodyPaintIssues: ["scratches"],
    });
    expect(result.isComplete).toBe(true);
  });

  it("laudo com 'sim' EXIGE o resultado", () => {
    const result = buildValidationState({ ...COMPLETE, cautionReportHas: "yes" });
    expect(result.missing.map((item) => item.field)).toContain("caution_report_result");
  });

  it("laudo 'não' e 'não sei' NÃO exigem resultado", () => {
    expect(buildValidationState({ ...COMPLETE, cautionReportHas: "no" }).isComplete).toBe(true);
    expect(buildValidationState({ ...COMPLETE, cautionReportHas: "unknown" }).isComplete).toBe(true);
  });
});

describe("fotos", () => {
  it("menos que o mínimo é incompleto", () => {
    const result = buildValidationState({ ...COMPLETE, photoCount: 3 });
    expect(result.missing.map((item) => item.field)).toContain("photos");
    expect(result.missing.find((i) => i.field === "photos")?.message).toMatch(/pelo menos 4/i);
  });

  it("acima do máximo é incompleto, com a mensagem do TETO", () => {
    const result = buildValidationState({ ...COMPLETE, photoCount: 13 });
    expect(result.missing.find((i) => i.field === "photos")?.message).toMatch(/no máximo 12/i);
  });

  it("nove fotos é válido", () => {
    expect(buildValidationState({ ...COMPLETE, photoCount: 9 }).isComplete).toBe(true);
  });
});

describe("laudo cautelar — duas perguntas, um valor", () => {
  it("não possui vira not_available", () => {
    expect(resolveCautionReportStatus("no", "")).toBe("not_available");
  });

  it("não sei vira unknown", () => {
    expect(resolveCautionReportStatus("unknown", "")).toBe("unknown");
  });

  it("possui + resultado vira o resultado", () => {
    expect(resolveCautionReportStatus("yes", "approved_with_notes")).toBe("approved_with_notes");
  });

  it("possui sem resultado ainda não resolve", () => {
    expect(resolveCautionReportStatus("yes", "")).toBeNull();
  });

  it("o resultado é IGNORADO quando não possui laudo", () => {
    // O estado impossível "não possui + aprovado" não tem como ser produzido:
    // o resultado só é lido no ramo `yes`.
    expect(resolveCautionReportStatus("no", "approved")).toBe("not_available");
  });
});

describe("mensagem de campos faltantes", () => {
  it("nomeia o que falta, em vez de 'preencha todos os campos'", () => {
    const state = {
      ...COMPLETE,
      tireCondition: "" as const,
      ipvaStatus: "" as const,
      suspensionCondition: "" as const,
    };
    const message = buildMissingMessage(buildValidationState(state).missing);

    expect(message).toContain("Revise 3 informações antes de enviar");
    expect(message).toContain("Pneus");
    expect(message).toContain("Situação do IPVA");
    expect(message).toContain("Suspensão");
  });

  it("usa o singular com um item só", () => {
    const message = buildMissingMessage(
      buildValidationState({ ...COMPLETE, tireCondition: "" }).missing
    );
    expect(message).toBe("Revise 1 informação antes de enviar: Pneus.");
  });

  it("corta a lista longa mantendo a contagem honesta", () => {
    const message = buildMissingMessage(buildValidationState(EMPTY_FORM_STATE).missing);
    // 22 requisitos: os 21 anteriores mais o valor mínimo.
    expect(message).toMatch(/^Revise 22 informações/);
    expect(message).toContain("e mais 18");
  });

  it("string vazia quando não falta nada", () => {
    expect(buildMissingMessage([])).toBe("");
  });
});

describe("ordem dos faltantes", () => {
  it("o primeiro item é o mais ALTO na página", () => {
    // É quem recebe foco no clique. Mandar o foco para o fim da ficha quando o
    // que falta está no topo faria a pessoa procurar no lugar errado.
    const state = { ...COMPLETE, mileage: "", bodyPaintStatus: "" as const };
    const { missing } = buildValidationState(state);

    expect(missing[0].field).toBe("mileage");
    expect(missing[0].section).toBe("vehicle");
  });
});

describe("payload", () => {
  it("normaliza os condicionais antes de sair da tela", () => {
    const payload = toCreatePayload(
      {
        ...COMPLETE,
        // Valores digitados e depois abandonados quando a resposta mudou.
        financingStatus: "no",
        financingBalance: "1850000",
        finesStatus: "no",
        finesAmount: "50000",
        ipvaStatus: "paid",
        ipvaAmountDue: "30000",
        engineCondition: "ok",
        engineNotes: "texto antigo",
        bodyPaintStatus: "none",
        bodyPaintIssues: ["scratches"],
        bodyPaintNotes: "sobrou",
      },
      PAYLOAD_EXTRAS
    );

    expect(payload.financing_balance).toBeNull();
    expect(payload.fines_amount).toBeNull();
    expect(payload.ipva_amount_due).toBeNull();
    expect(payload.engine_notes).toBeNull();
    expect(payload.body_paint_issues).toEqual([]);
    expect(payload.body_paint_notes).toBeNull();
  });

  it("converte centavos para decimal com ponto", () => {
    const payload = toCreatePayload(
      { ...COMPLETE, financingStatus: "yes", financingBalance: "1850000" },
      PAYLOAD_EXTRAS
    );
    expect(payload.financing_balance).toBe("18500.00");
  });

  it("manda os CÓDIGOS FIPE e nenhum valor de mercado", () => {
    const payload = toCreatePayload(COMPLETE, PAYLOAD_EXTRAS);

    expect(payload.fipe_brand_code).toBe("59");
    expect(payload.fipe_model_code).toBe("5940");
    expect(payload.fipe_year_code).toBe("2016-1");
    expect(payload.year).toBe("2016");

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("fipe_reference_value");
    // Sem placa, em nenhuma forma.
    expect(serialized).not.toContain("plate");
    expect(serialized).not.toContain("placa");
  });

  it("observação vazia vira null, não string vazia", () => {
    expect(toCreatePayload({ ...COMPLETE, notes: "   " }, PAYLOAD_EXTRAS).known_issues).toBeNull();
  });

  it("recusa montar payload de ficha incompleta", () => {
    expect(() => toCreatePayload({ ...COMPLETE, tireCondition: "" }, PAYLOAD_EXTRAS)).toThrow(
      /incompleta/i
    );
  });
});

describe("ids de DOM", () => {
  it("são previsíveis e estáveis", () => {
    // O formulário dá foco por `getElementById`. Um prefixo diferente aqui
    // quebraria o foco sem quebrar nenhuma renderização — falha silenciosa.
    expect(fieldDomId("tire_condition")).toBe("sr-field-tire_condition");
  });
});
