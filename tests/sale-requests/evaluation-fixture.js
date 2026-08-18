// Ficha de avaliação — fixture COMPARTILHADA pelos testes de validação, service
// e rotas.
//
// Existe por um motivo específico: os três arquivos montam o corpo de uma
// solicitação nova, e a ficha acrescentou dezoito respostas obrigatórias. Três
// cópias divergiriam no primeiro campo que mudasse de vocabulário, e a que
// ficasse para trás falharia num arquivo só — dando a impressão de bug no
// código em vez de fixture desatualizada.
//
// É a RESPOSTA COMPLETA E VÁLIDA. Cada teste que quer provar uma regra
// específica sobrescreve só o campo em questão.

/** Corpo (snake_case, como chega do cliente) com a ficha inteira respondida. */
export const EVALUATION_BODY = Object.freeze({
  tire_condition: "good",

  financing_status: "no",
  fines_status: "no",
  ipva_status: "paid",
  licensing_status: "ok",

  caution_report_status: "not_available",
  auction_history: "no",
  collision_history: "no",

  engine_condition: "ok",
  gearbox_condition: "ok",
  suspension_condition: "ok",

  body_paint_status: "none",
});

/**
 * Colunas (snake_case) de uma linha JÁ persistida com a ficha respondida.
 *
 * Difere de `EVALUATION_BODY` no que o banco guarda e o corpo não carrega: os
 * valores condicionais já normalizados para `null` e a lista vazia de detalhes
 * de lataria.
 */
export const EVALUATION_ROW = Object.freeze({
  tire_condition: "good",

  financing_status: "no",
  financing_balance: null,
  fines_status: "no",
  fines_amount: null,
  ipva_status: "paid",
  ipva_amount_due: null,
  licensing_status: "ok",

  caution_report_status: "not_available",
  auction_history: "no",
  collision_history: "no",

  engine_condition: "ok",
  engine_notes: null,
  gearbox_condition: "ok",
  gearbox_notes: null,
  suspension_condition: "ok",
  suspension_notes: null,

  body_paint_status: "none",
  body_paint_issues: [],
  body_paint_notes: null,
});

/**
 * Linha LEGADA: publicada antes da ficha existir.
 *
 * Todas as colunas novas em NULL — inclusive `body_paint_issues`, que numa linha
 * nova seria `[]`. A diferença entre NULL e `[]` é a diferença entre "não foi
 * perguntado" e "respondeu que não há detalhe", e os testes de compatibilidade
 * dependem dela.
 */
export const LEGACY_EVALUATION_ROW = Object.freeze({
  tire_condition: null,

  financing_status: null,
  financing_balance: null,
  fines_status: null,
  fines_amount: null,
  ipva_status: null,
  ipva_amount_due: null,
  licensing_status: null,

  caution_report_status: null,
  auction_history: null,
  collision_history: null,

  engine_condition: null,
  engine_notes: null,
  gearbox_condition: null,
  gearbox_notes: null,
  suspension_condition: null,
  suspension_notes: null,

  body_paint_status: null,
  body_paint_issues: null,
  body_paint_notes: null,
});
