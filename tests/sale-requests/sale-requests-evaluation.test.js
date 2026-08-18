// Ficha preliminar de avaliação — validação de entrada.
//
// O que este arquivo prova:
//   - cada vocabulário aceita EXATAMENTE os valores previstos e recusa o resto;
//   - a ausência de resposta é ERRO para solicitação nova (a obrigatoriedade
//     vive na aplicação, não no banco — ver migration 054);
//   - as cinco regras CRUZADAS normalizam ou recusam, nas duas direções;
//   - o valor monetário só sobrevive junto da resposta que o justifica;
//   - o `field` do erro é o nome da COLUNA, que é o que a tela usa para
//     destacar a seção certa.
//
// A disciplina dos casos negativos é deliberada: para cada regra cruzada há um
// teste que prova que ela RECUSA e outro que prova que ela NORMALIZA. Só o
// primeiro deixaria passar uma implementação que lança em vez de limpar o
// campo — e o usuário receberia um 400 por um texto que ele nem vê mais.

import { describe, expect, it } from "vitest";

import {
  validateBodyPaint,
  validateEvaluation,
  validateKnownIssues,
  validateMechanicalPart,
  validateMoney,
} from "../../src/modules/sale-requests/sale-requests.validation.js";
import {
  BODY_PAINT_ISSUES,
  CAUTION_REPORT_STATUSES,
  IPVA_STATUSES,
  LICENSING_STATUSES,
  MECHANICAL_CONDITIONS,
  SALE_REQUEST_EVALUATION_LIMITS,
  SALE_REQUEST_LIMITS,
  TIRE_CONDITIONS,
  YES_NO_UNKNOWN_VALUES,
} from "../../src/modules/sale-requests/sale-requests.constants.js";
import { EVALUATION_BODY } from "./evaluation-fixture.js";

/** Ficha válida com um campo trocado. */
function withField(overrides) {
  return { ...EVALUATION_BODY, ...overrides };
}

/** Captura o `field` do AppError — é o contrato com a tela. */
function fieldOfError(run) {
  try {
    run();
  } catch (error) {
    return { thrown: true, field: error?.details?.field, status: error?.statusCode ?? error?.status };
  }
  return { thrown: false };
}

describe("pneus", () => {
  it.each(TIRE_CONDITIONS)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ tire_condition: value })).tireCondition).toBe(value);
  });

  it("recusa valor fora da allowlist", () => {
    const result = fieldOfError(() => validateEvaluation(withField({ tire_condition: "otimo" })));
    expect(result.thrown).toBe(true);
    expect(result.field).toBe("tire_condition");
  });

  it("recusa ausência — solicitação nova precisa de resposta explícita", () => {
    // NULL no banco significa "a versão antiga do formulário não perguntou".
    // Deixar passar aqui produziria uma linha nova indistinguível de uma legada.
    const result = fieldOfError(() => validateEvaluation(withField({ tire_condition: undefined })));
    expect(result.thrown).toBe(true);
    expect(result.field).toBe("tire_condition");
  });
});

describe("financiamento", () => {
  it.each(YES_NO_UNKNOWN_VALUES)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ financing_status: value })).financingStatus).toBe(value);
  });

  it("guarda o saldo quando há financiamento", () => {
    const result = validateEvaluation(
      withField({ financing_status: "yes", financing_balance: "18500" })
    );
    expect(result.financingBalance).toBe("18500.00");
  });

  it("saldo é opcional mesmo com financiamento", () => {
    const result = validateEvaluation(withField({ financing_status: "yes" }));
    expect(result.financingBalance).toBeNull();
  });

  it("DESCARTA o saldo quando a resposta deixa de ser sim", () => {
    // Não é erro: é a pessoa mudando de ideia com o campo já preenchido na
    // tela. Recusar puniria uma correção legítima.
    for (const status of ["no", "unknown"]) {
      const result = validateEvaluation(
        withField({ financing_status: status, financing_balance: "18500" })
      );
      expect(result.financingBalance).toBeNull();
    }
  });

  it("recusa saldo com formato brasileiro", () => {
    const result = fieldOfError(() =>
      validateEvaluation(withField({ financing_status: "yes", financing_balance: "18.500,00" }))
    );
    expect(result.thrown).toBe(true);
    expect(result.field).toBe("financing_balance");
  });

  it("recusa status inválido", () => {
    const result = fieldOfError(() => validateEvaluation(withField({ financing_status: "talvez" })));
    expect(result.field).toBe("financing_status");
  });
});

describe("multas", () => {
  it.each(YES_NO_UNKNOWN_VALUES)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ fines_status: value })).finesStatus).toBe(value);
  });

  it("guarda o valor quando há multas", () => {
    const result = validateEvaluation(withField({ fines_status: "yes", fines_amount: "320.55" }));
    expect(result.finesAmount).toBe("320.55");
  });

  it("descarta o valor quando não há multas", () => {
    const result = validateEvaluation(withField({ fines_status: "no", fines_amount: "320.55" }));
    expect(result.finesAmount).toBeNull();
  });
});

describe("IPVA", () => {
  it.each(IPVA_STATUSES)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ ipva_status: value })).ipvaStatus).toBe(value);
  });

  it.each(["installments", "open"])("guarda o valor pendente quando %s", (status) => {
    const result = validateEvaluation(withField({ ipva_status: status, ipva_amount_due: "450.5" }));
    expect(result.ipvaAmountDue).toBe("450.50");
  });

  it.each(["paid", "unknown"])("descarta o valor pendente quando %s", (status) => {
    const result = validateEvaluation(withField({ ipva_status: status, ipva_amount_due: "450.5" }));
    expect(result.ipvaAmountDue).toBeNull();
  });
});

describe("licenciamento", () => {
  it.each(LICENSING_STATUSES)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ licensing_status: value })).licensingStatus).toBe(value);
  });

  it("recusa valor inventado", () => {
    expect(fieldOfError(() => validateEvaluation(withField({ licensing_status: "atrasado" }))).field)
      .toBe("licensing_status");
  });
});

describe("laudo cautelar", () => {
  it.each(CAUTION_REPORT_STATUSES)("aceita %s", (value) => {
    expect(validateEvaluation(withField({ caution_report_status: value })).cautionReportStatus).toBe(
      value
    );
  });

  it("o estado impossível não é exprimível", () => {
    // "não possui laudo" e "aprovado" são valores do MESMO campo, então não há
    // como marcar os dois. Este teste documenta a propriedade que o vocabulário
    // único garante — e falharia no dia em que alguém separasse em duas colunas.
    const values = new Set(CAUTION_REPORT_STATUSES);
    expect(values.has("not_available")).toBe(true);
    expect(values.has("approved")).toBe(true);

    const result = validateEvaluation(withField({ caution_report_status: "not_available" }));
    expect(result.cautionReportStatus).toBe("not_available");
    expect(Object.keys(result)).not.toContain("cautionReportResult");
  });
});

describe("leilão e sinistro", () => {
  it.each(YES_NO_UNKNOWN_VALUES)("leilão aceita %s", (value) => {
    expect(validateEvaluation(withField({ auction_history: value })).auctionHistory).toBe(value);
  });

  it.each(YES_NO_UNKNOWN_VALUES)("colisão aceita %s", (value) => {
    expect(validateEvaluation(withField({ collision_history: value })).collisionHistory).toBe(value);
  });

  it("recusa boolean — o vocabulário tem três estados", () => {
    // `true`/`false` colapsariam "não sei" em "não". O validador trabalha só com
    // texto da allowlist, então um boolean cai fora por construção.
    expect(fieldOfError(() => validateEvaluation(withField({ auction_history: false }))).field).toBe(
      "auction_history"
    );
  });
});

describe("mecânica", () => {
  const parts = [
    { field: "engine_condition", notes: "engine_notes", key: "engineCondition", noteKey: "engineNotes" },
    { field: "gearbox_condition", notes: "gearbox_notes", key: "gearboxCondition", noteKey: "gearboxNotes" },
    {
      field: "suspension_condition",
      notes: "suspension_notes",
      key: "suspensionCondition",
      noteKey: "suspensionNotes",
    },
  ];

  it.each(parts)("$field aceita todos os estados", (part) => {
    for (const condition of MECHANICAL_CONDITIONS) {
      const body = withField({
        [part.field]: condition,
        [part.notes]: condition === "issue" ? "barulho ao frear" : undefined,
      });
      expect(validateEvaluation(body)[part.key]).toBe(condition);
    }
  });

  it.each(parts)("$field com problema EXIGE descrição", (part) => {
    const result = fieldOfError(() =>
      validateEvaluation(withField({ [part.field]: "issue", [part.notes]: "   " }))
    );
    expect(result.thrown).toBe(true);
    expect(result.field).toBe(part.notes);
  });

  it.each(parts)("$field sem problema DESCARTA a descrição", (part) => {
    for (const condition of ["ok", "unknown"]) {
      const result = validateEvaluation(
        withField({ [part.field]: condition, [part.notes]: "texto de uma resposta anterior" })
      );
      expect(result[part.noteKey]).toBeNull();
    }
  });

  it("recusa descrição acima do limite", () => {
    const long = "x".repeat(SALE_REQUEST_EVALUATION_LIMITS.MECHANICAL_NOTES_MAX + 1);
    const result = fieldOfError(() =>
      validateEvaluation(withField({ engine_condition: "issue", engine_notes: long }))
    );
    expect(result.field).toBe("engine_notes");
  });

  it("aceita descrição exatamente no limite", () => {
    const exact = "x".repeat(SALE_REQUEST_EVALUATION_LIMITS.MECHANICAL_NOTES_MAX);
    const result = validateEvaluation(withField({ engine_condition: "issue", engine_notes: exact }));
    expect(result.engineNotes).toHaveLength(SALE_REQUEST_EVALUATION_LIMITS.MECHANICAL_NOTES_MAX);
  });

  it("validateMechanicalPart deriva o campo de notas do campo de condição", () => {
    // O nome do campo do erro é derivado, não digitado: `gearbox_condition` →
    // `gearbox_notes`. Um erro aqui apontaria a tela para uma seção errada.
    const result = fieldOfError(() =>
      validateMechanicalPart("issue", "", { field: "gearbox_condition", label: "câmbio" })
    );
    expect(result.field).toBe("gearbox_notes");
  });
});

describe("lataria e pintura", () => {
  it("aceita issues com pelo menos um detalhe", () => {
    const result = validateBodyPaint({
      body_paint_status: "issues",
      body_paint_issues: ["scratches", "dents"],
      body_paint_notes: "porta traseira direita",
    });
    expect(result.issues).toEqual(["scratches", "dents"]);
    expect(result.notes).toBe("porta traseira direita");
  });

  it.each(BODY_PAINT_ISSUES)("aceita o detalhe %s", (issue) => {
    const result = validateBodyPaint({
      body_paint_status: "issues",
      body_paint_issues: [issue],
    });
    expect(result.issues).toEqual([issue]);
  });

  it("remove duplicatas em vez de recusar", () => {
    const result = validateBodyPaint({
      body_paint_status: "issues",
      body_paint_issues: ["dents", "dents", "scratches"],
    });
    expect(result.issues).toEqual(["dents", "scratches"]);
  });

  it("recusa issues com lista vazia", () => {
    const result = fieldOfError(() =>
      validateBodyPaint({ body_paint_status: "issues", body_paint_issues: [] })
    );
    expect(result.field).toBe("body_paint_issues");
  });

  it.each(["none", "unknown"])("%s não aceita detalhe marcado", (status) => {
    const result = fieldOfError(() =>
      validateBodyPaint({ body_paint_status: status, body_paint_issues: ["scratches"] })
    );
    expect(result.thrown).toBe(true);
    expect(result.field).toBe("body_paint_issues");
  });

  it.each(["none", "unknown"])("%s zera detalhes e observação", (status) => {
    const result = validateBodyPaint({
      body_paint_status: status,
      body_paint_notes: "texto que sobrou",
    });
    expect(result.issues).toEqual([]);
    expect(result.notes).toBeNull();
  });

  it("recusa detalhe fora da allowlist", () => {
    const result = fieldOfError(() =>
      validateBodyPaint({ body_paint_status: "issues", body_paint_issues: ["ferrugem"] })
    );
    expect(result.field).toBe("body_paint_issues");
  });

  it("observação é opcional quando há detalhes", () => {
    const result = validateBodyPaint({
      body_paint_status: "issues",
      body_paint_issues: ["scratches"],
    });
    expect(result.notes).toBeNull();
  });

  it("recusa observação acima do limite", () => {
    const long = "x".repeat(SALE_REQUEST_EVALUATION_LIMITS.BODY_PAINT_NOTES_MAX + 1);
    const result = fieldOfError(() =>
      validateBodyPaint({
        body_paint_status: "issues",
        body_paint_issues: ["scratches"],
        body_paint_notes: long,
      })
    );
    expect(result.field).toBe("body_paint_notes");
  });
});

describe("observações adicionais (known_issues)", () => {
  it("ausente vira null", () => {
    expect(validateKnownIssues(null)).toBeNull();
    expect(validateKnownIssues(undefined)).toBeNull();
  });

  it("string vazia vira null, não string vazia", () => {
    expect(validateKnownIssues("   ")).toBeNull();
  });

  it("aceita exatamente o máximo", () => {
    const exact = "x".repeat(SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX);
    expect(validateKnownIssues(exact)).toHaveLength(SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX);
  });

  it("recusa acima do máximo", () => {
    const long = "x".repeat(SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX + 1);
    expect(fieldOfError(() => validateKnownIssues(long)).field).toBe("known_issues");
  });
});

describe("validateMoney", () => {
  it("aceita inteiro, decimal e número", () => {
    expect(validateMoney("18500", "f", "V")).toBe("18500.00");
    expect(validateMoney("18500.5", "f", "V")).toBe("18500.50");
    expect(validateMoney(18500.55, "f", "V")).toBe("18500.55");
  });

  it("aceita zero", () => {
    expect(validateMoney("0", "f", "V")).toBe("0.00");
  });

  it("ausente e vazio viram null", () => {
    expect(validateMoney(null, "f", "V")).toBeNull();
    expect(validateMoney("  ", "f", "V")).toBeNull();
  });

  it("recusa negativo, texto e mais de duas decimais", () => {
    for (const bad of ["-1", "abc", "10.999", "1e5", "R$ 10"]) {
      expect(fieldOfError(() => validateMoney(bad, "financing_balance", "V")).thrown).toBe(true);
    }
  });

  it("recusa acima do teto de sanidade", () => {
    const over = String(SALE_REQUEST_EVALUATION_LIMITS.MONEY_MAX + 1);
    expect(fieldOfError(() => validateMoney(over, "f", "V")).thrown).toBe(true);
  });
});

describe("ficha completa", () => {
  it("devolve todas as chaves esperadas, sem nenhuma extra", () => {
    const result = validateEvaluation(EVALUATION_BODY);

    expect(Object.keys(result).sort()).toEqual(
      [
        "tireCondition",
        "financingStatus",
        "financingBalance",
        "finesStatus",
        "finesAmount",
        "ipvaStatus",
        "ipvaAmountDue",
        "licensingStatus",
        "cautionReportStatus",
        "auctionHistory",
        "collisionHistory",
        "engineCondition",
        "engineNotes",
        "gearboxCondition",
        "gearboxNotes",
        "suspensionCondition",
        "suspensionNotes",
        "bodyPaintStatus",
        "bodyPaintIssues",
        "bodyPaintNotes",
      ].sort()
    );
  });

  it("uma ficha totalmente 'não sei' é válida", () => {
    // O produto aceita quem não sabe responder. Exigir certeza afastaria
    // exatamente o vendedor que mais precisa da avaliação da loja.
    const result = validateEvaluation({
      tire_condition: "unknown",
      financing_status: "unknown",
      fines_status: "unknown",
      ipva_status: "unknown",
      licensing_status: "unknown",
      caution_report_status: "unknown",
      auction_history: "unknown",
      collision_history: "unknown",
      engine_condition: "unknown",
      gearbox_condition: "unknown",
      suspension_condition: "unknown",
      body_paint_status: "unknown",
    });

    expect(result.tireCondition).toBe("unknown");
    expect(result.bodyPaintIssues).toEqual([]);
    expect(result.financingBalance).toBeNull();
  });
});
