/**
 * Validação da avaliação presencial e da proposta final (Fase 4.5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OS VOCABULÁRIOS VÊM DA FICHA DECLARADA — NÃO SÃO REDECLARADOS
 * ────────────────────────────────────────────────────────────────────────────
 * `DECLARED_CONDITIONS`, `TIRE_CONDITIONS`, `MECHANICAL_CONDITIONS`,
 * `BODY_PAINT_STATUSES` e `BODY_PAINT_ISSUES` são importados de
 * `sale-requests.constants.js`. São os MESMOS valores que a pessoa física usou
 * para declarar o carro, e é isso que torna a comparação possível.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  BODY_PAINT_ISSUES,
  BODY_PAINT_STATUS,
  BODY_PAINT_STATUSES,
  DECLARED_CONDITIONS,
  MECHANICAL_CONDITIONS,
  SALE_REQUEST_LIMITS,
  TIRE_CONDITIONS,
} from "./sale-requests.constants.js";
import {
  ADJUSTMENT_REASON,
  ADJUSTMENT_REASONS,
  INSPECTION_CODE,
  INSPECTION_LIMITS,
  INSPECTION_SLOTS,
  POST_INSPECTION_DECISION,
  POST_INSPECTION_DECISIONS,
} from "./sale-requests.inspection.constants.js";

function invalid(message, code, field) {
  return new AppError(message, 400, true, {
    code,
    ...(field ? { field } : {}),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// HORÁRIOS
// ────────────────────────────────────────────────────────────────────────────

/**
 * ISO 8601 **COM OFFSET EXPLÍCITO**. Nada mais é aceito.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O OFFSET É OBRIGATÓRIO, E POR QUE ISSO NÃO É PEDANTISMO
 * ────────────────────────────────────────────────────────────────────────────
 * `2026-08-25T14:30:00` (sem offset) não é um instante — é um texto que precisa
 * de um fuso para virar um. Se o servidor completasse esse fuso por conta
 * própria, ele estaria adivinhando, e a adivinhação teria que vir de algum
 * lugar:
 *
 *   do fuso do PROCESSO   → o Render roda em UTC. Um horário digitado como
 *                           14:30 viraria 11:30 na tela do proprietário, e a
 *                           pessoa perderia a visita por três horas.
 *   do fuso do BANCO      → mesmo problema, mesma causa.
 *   da UF da cidade       → o portal opera em várias cidades e vai operar em
 *                           mais. Amazonas, Acre e Fernando de Noronha não são
 *                           `America/Sao_Paulo`, e a tabela de exceções
 *                           envelheceria em silêncio.
 *
 * Com offset explícito não há nada a adivinhar: o cliente diz de que instante
 * está falando, o PostgreSQL guarda em `TIMESTAMPTZ`, e cada tela formata no
 * fuso de quem lê. É por isso que nenhuma linha deste arquivo — nem do domínio
 * — menciona `America/Sao_Paulo`.
 *
 * `Date.parse` aceita a string sem offset e produz um valor plausível, então a
 * checagem NÃO pode ser "deu para converter?". Precisa ser sobre a FORMA do
 * texto, antes da conversão.
 *
 * @returns {Date}
 */
export function parseSlotTimestamp(raw, { now = new Date(), field = "starts_at" } = {}) {
  const text = String(raw ?? "").trim();

  if (text === "") {
    throw invalid("Informe o horário.", INSPECTION_CODE.INVALID_SLOT, field);
  }

  // `YYYY-MM-DDTHH:MM(:SS(.mmm)?)?` seguido de `Z` ou `±HH:MM`.
  //
  // O `Z` é aceito porque é um offset explícito (zero) — quem manda `Z` está
  // dizendo UTC, não omitindo a informação.
  const ISO_WITH_OFFSET =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

  if (!ISO_WITH_OFFSET.test(text)) {
    throw invalid(
      "Horário inválido. Envie a data e a hora com o fuso (ex.: 2026-08-25T14:30:00-03:00).",
      INSPECTION_CODE.INVALID_SLOT,
      field
    );
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    // Passa pelo formato mas não é data real — `2026-02-31T10:00:00-03:00`.
    throw invalid("Horário inválido.", INSPECTION_CODE.INVALID_SLOT, field);
  }

  if (parsed.getTime() <= now.getTime()) {
    throw invalid(
      "O horário precisa ser no futuro.",
      INSPECTION_CODE.INVALID_SLOT,
      field
    );
  }

  return parsed;
}

/**
 * A rodada inteira: 1 a 3 instantes distintos e futuros.
 *
 * A comparação de duplicidade é feita sobre o INSTANTE (`getTime()`), e não
 * sobre o texto. `2026-08-25T14:30:00-03:00` e `2026-08-25T17:30:00Z` são
 * strings diferentes e o MESMO momento — aceitá-las como dois horários poria
 * dois botões idênticos na tela do proprietário.
 *
 * @returns {Date[]} ordenados cronologicamente
 */
export function validateSlotRound(raw, { now = new Date() } = {}) {
  const list = Array.isArray(raw) ? raw : [];

  if (list.length < INSPECTION_SLOTS.MIN || list.length > INSPECTION_SLOTS.MAX) {
    throw invalid(
      `Envie de ${INSPECTION_SLOTS.MIN} a ${INSPECTION_SLOTS.MAX} horários.`,
      INSPECTION_CODE.INVALID_SLOT_COUNT,
      "slots"
    );
  }

  const parsed = list.map((value, index) =>
    parseSlotTimestamp(value, { now, field: `slots[${index}]` })
  );

  const seen = new Set();
  for (const date of parsed) {
    const key = date.getTime();
    if (seen.has(key)) {
      throw invalid(
        "Os horários precisam ser diferentes entre si.",
        INSPECTION_CODE.DUPLICATE_SLOT,
        "slots"
      );
    }
    seen.add(key);
  }

  // Ordena para que a tela do proprietário receba cronológico sem ter de
  // ordenar — e para que a ordem não dependa de como a loja preencheu.
  return parsed.sort((a, b) => a.getTime() - b.getTime());
}

/** `slot_id` do corpo → inteiro positivo. */
export function parseSlotId(raw) {
  const text = String(raw ?? "").trim();

  if (text === "" || !/^\d+$/.test(text)) {
    throw invalid("Escolha um horário.", INSPECTION_CODE.INVALID_SLOT, "slot_id");
  }

  const id = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw invalid("Escolha um horário.", INSPECTION_CODE.INVALID_SLOT, "slot_id");
  }
  return id;
}

// ────────────────────────────────────────────────────────────────────────────
// A FICHA OBSERVADA
// ────────────────────────────────────────────────────────────────────────────

/** Validador de allowlist. Mesma forma do `allowlistValidator` da ficha declarada. */
function pickFrom(values, { field, label }) {
  return (raw) => {
    const text = String(raw ?? "").trim();
    if (!values.includes(text)) {
      throw invalid(`Informe ${label}.`, INSPECTION_CODE.INVALID_FIELD, field);
    }
    return text;
  };
}

/**
 * Quilometragem LIDA NO ODÔMETRO.
 *
 * Aceita QUALQUER valor válido — maior, menor ou igual ao declarado. Em
 * especial, um valor MENOR não é recusado: o proprietário pode ter errado para
 * cima, e recusar a leitura real forçaria a loja a registrar um número falso
 * para conseguir concluir.
 *
 * O mesmo teto de sanidade da declaração (`MILEAGE_MAX`), pelo mesmo motivo:
 * pegar erro de unidade sem virar regra de negócio.
 */
export function validateObservedMileage(raw) {
  const text = String(raw ?? "").trim();

  if (text === "" || !/^\d+$/.test(text)) {
    throw invalid(
      "Informe a quilometragem lida no veículo.",
      INSPECTION_CODE.INVALID_FIELD,
      "observed_mileage"
    );
  }

  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value < 0 || value > SALE_REQUEST_LIMITS.MILEAGE_MAX) {
    throw invalid(
      "Quilometragem inválida.",
      INSPECTION_CODE.INVALID_FIELD,
      "observed_mileage"
    );
  }

  return value;
}

/** Texto opcional, aparado e limitado. `null` quando vazio. */
function optionalText(raw, { max, field }) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;

  if (text.length > max) {
    throw invalid(
      `O texto precisa ter no máximo ${max} caracteres.`,
      INSPECTION_CODE.INVALID_FIELD,
      field
    );
  }
  return text;
}

/**
 * A ficha inteira que a loja registra ao concluir.
 *
 * As sete dimensões são exatamente as que a PF declarou e que se apuram OLHANDO
 * o carro. Documentação, multas, IPVA, financiamento, laudo e histórico de
 * leilão ficam de fora da ficha — a loja não os "observa" no pátio como observa
 * um pneu, e quando divergem o caminho é a JUSTIFICATIVA da proposta final
 * (`adjustment_reason = 'documentation'`), não um campo de inspeção.
 *
 * `body_paint_issues` é obrigatório **quando** o status é `issues`, e proibido
 * nos outros dois — a mesma relação cruzada que a ficha declarada impõe. Sem
 * isso, `issues` sem detalhe nenhum seria uma avaria sem descrição, e
 * `none` com detalhes seria contradição.
 */
export function validateInspectionForm(body = {}) {
  const bodyPaintStatus = pickFrom(BODY_PAINT_STATUSES, {
    field: "observed_body_paint_status",
    label: "o estado da lataria e pintura",
  })(body.observed_body_paint_status);

  const rawIssues = body.observed_body_paint_issues;
  let issues = null;

  if (bodyPaintStatus === BODY_PAINT_STATUS.ISSUES) {
    const list = Array.isArray(rawIssues) ? rawIssues.map((v) => String(v ?? "").trim()) : [];

    if (list.length === 0) {
      throw invalid(
        "Selecione ao menos um detalhe de lataria e pintura.",
        INSPECTION_CODE.INVALID_FIELD,
        "observed_body_paint_issues"
      );
    }

    for (const issue of list) {
      if (!BODY_PAINT_ISSUES.includes(issue)) {
        throw invalid(
          "Detalhe de lataria inválido.",
          INSPECTION_CODE.INVALID_FIELD,
          "observed_body_paint_issues"
        );
      }
    }

    // Sem duplicatas: a mesma avaria duas vezes não descreve nada a mais.
    issues = [...new Set(list)];
  } else if (Array.isArray(rawIssues) && rawIssues.length > 0) {
    throw invalid(
      "Só informe detalhes de lataria quando houver detalhes a registrar.",
      INSPECTION_CODE.INVALID_FIELD,
      "observed_body_paint_issues"
    );
  }

  return {
    observedMileage: validateObservedMileage(body.observed_mileage),

    observedCondition: pickFrom(DECLARED_CONDITIONS, {
      field: "observed_condition",
      label: "o estado geral observado",
    })(body.observed_condition),

    observedTireCondition: pickFrom(TIRE_CONDITIONS, {
      field: "observed_tire_condition",
      label: "o estado dos pneus",
    })(body.observed_tire_condition),

    observedEngineCondition: pickFrom(MECHANICAL_CONDITIONS, {
      field: "observed_engine_condition",
      label: "o estado do motor",
    })(body.observed_engine_condition),

    observedGearboxCondition: pickFrom(MECHANICAL_CONDITIONS, {
      field: "observed_gearbox_condition",
      label: "o estado do câmbio",
    })(body.observed_gearbox_condition),

    observedSuspensionCondition: pickFrom(MECHANICAL_CONDITIONS, {
      field: "observed_suspension_condition",
      label: "o estado da suspensão",
    })(body.observed_suspension_condition),

    observedBodyPaintStatus: bodyPaintStatus,
    observedBodyPaintIssues: issues,

    inspectionNotes: optionalText(body.inspection_notes, {
      max: INSPECTION_LIMITS.NOTES_MAX,
      field: "inspection_notes",
    }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// A DECISÃO FINAL
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valor monetário → string decimal com duas casas.
 *
 * **O ÚNICO PISO É `> 0`.**
 *
 * Não existe aqui — e não pode passar a existir — comparação com
 * `minimum_accepted_price`, com a proposta selecionada ou com a maior proposta
 * da disputa. Aquelas três regras governavam a DISPUTA, e a disputa acabou. A
 * avaliação presencial existe justamente para descobrir que o carro vale menos
 * do que parecia na foto, e um piso aqui recusaria exatamente esse resultado.
 *
 * O que protege o proprietário não é um valor mínimo: é a exigência de
 * justificativa quando o valor cai (ver `validateFinalDecision`).
 */
function parseMoney(raw, { field }) {
  const text = String(raw ?? "").trim();

  if (text === "") {
    throw invalid(
      "Informe o valor da proposta final.",
      INSPECTION_CODE.INVALID_FINAL_AMOUNT,
      field
    );
  }

  if (!/^\d+([.,]\d{1,2})?$/.test(text)) {
    throw invalid(
      "Valor inválido.",
      INSPECTION_CODE.INVALID_FINAL_AMOUNT,
      field
    );
  }

  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    throw invalid(
      "O valor precisa ser maior que zero.",
      INSPECTION_CODE.INVALID_FINAL_AMOUNT,
      field
    );
  }

  if (value > INSPECTION_LIMITS.MONEY_MAX) {
    throw invalid(
      "Valor acima do limite aceito.",
      INSPECTION_CODE.INVALID_FINAL_AMOUNT,
      field
    );
  }

  // String com 2 casas: o driver `pg` devolve NUMERIC como texto, e manter o
  // formato nas duas direções evita que "60000" na ida e "60000.00" na volta
  // pareçam valores diferentes numa comparação.
  return value.toFixed(2);
}

/** Centavos inteiros, para comparar dinheiro sem ponto flutuante binário. */
export function toCents(raw) {
  if (raw == null) return null;
  const text = typeof raw === "number" ? raw.toFixed(2) : String(raw).trim();
  if (text === "") return null;

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;

  const cents = String(match[2] ?? "").padEnd(2, "0");
  return Number(match[1]) * 100 + Number(cents);
}

/**
 * O corpo da decisão pós-inspeção.
 *
 * `preliminaryAmount` vem do SERVIDOR (lido dentro da transação, da própria
 * seleção), nunca do cliente: é ele que decide se houve redução e, portanto, se
 * a justificativa é obrigatória. Aceitá-lo do corpo permitiria a uma loja
 * declarar um preliminar falso e escapar da exigência.
 *
 * @param {object} body
 * @param {{ preliminaryAmount: string }} context
 */
export function validateFinalDecision(body = {}, { preliminaryAmount } = {}) {
  const decisionType = String(body.decision_type ?? "").trim();

  if (!POST_INSPECTION_DECISIONS.includes(decisionType)) {
    throw invalid(
      "Escolha uma opção.",
      INSPECTION_CODE.INVALID_FIELD,
      "decision_type"
    );
  }

  const rawReason = String(body.adjustment_reason ?? "").trim();
  const reason = rawReason === "" ? null : rawReason;

  if (reason !== null && !ADJUSTMENT_REASONS.includes(reason)) {
    throw invalid(
      "Motivo inválido.",
      INSPECTION_CODE.INVALID_FIELD,
      "adjustment_reason"
    );
  }

  const note = optionalText(body.adjustment_note, {
    max: INSPECTION_LIMITS.ADJUSTMENT_NOTE_MAX,
    field: "adjustment_note",
  });

  // A nota INTERNA nunca chega ao proprietário. Validada aqui só quanto ao
  // tamanho; o que garante a separação é o DTO, que não a seleciona.
  const internalNote = optionalText(body.internal_note, {
    max: INSPECTION_LIMITS.INTERNAL_NOTE_MAX,
    field: "internal_note",
  });

  // ── Desistência ─────────────────────────────────────────────────────────
  if (decisionType === POST_INSPECTION_DECISION.NO_OFFER) {
    // Desistir depois de ver o carro SEMPRE exige motivo: é a informação mais
    // valiosa que o proprietário pode receber neste ponto, porque ele vai
    // continuar tentando vender o veículo.
    if (!reason) {
      throw invalid(
        "Informe o motivo para não apresentar proposta.",
        INSPECTION_CODE.ADJUSTMENT_REASON_REQUIRED,
        "adjustment_reason"
      );
    }

    if (reason === ADJUSTMENT_REASON.OTHER && !note) {
      throw invalid(
        "Descreva o motivo.",
        INSPECTION_CODE.ADJUSTMENT_NOTE_REQUIRED,
        "adjustment_note"
      );
    }

    return {
      decisionType,
      finalAmount: null,
      adjustmentReason: reason,
      adjustmentNote: note,
      internalNote,
    };
  }

  // ── Proposta final ──────────────────────────────────────────────────────
  const finalAmount = parseMoney(body.final_amount, { field: "final_amount" });

  const finalCents = toCents(finalAmount);
  const preliminaryCents = toCents(preliminaryAmount);

  // Comparação em CENTAVOS INTEIROS. `Number("65000.00") > Number("65000.00")`
  // é falso por sorte, não por garantia — e aqui a sorte decidiria se uma
  // justificativa é exigida ou dispensada.
  const isReduction =
    finalCents != null && preliminaryCents != null && finalCents < preliminaryCents;

  if (isReduction) {
    if (!reason) {
      throw invalid(
        "Informe o motivo da redução do valor.",
        INSPECTION_CODE.ADJUSTMENT_REASON_REQUIRED,
        "adjustment_reason"
      );
    }

    if (reason === ADJUSTMENT_REASON.OTHER && !note) {
      throw invalid(
        "Descreva o motivo da redução.",
        INSPECTION_CODE.ADJUSTMENT_NOTE_REQUIRED,
        "adjustment_note"
      );
    }
  }

  return {
    decisionType,
    finalAmount,
    // Valor MAIOR ou IGUAL não precisa de justificativa — não há o que explicar
    // quando ninguém perde nada. Se a loja mandar um motivo mesmo assim, ele é
    // preservado: nada impede explicar um aumento.
    adjustmentReason: reason,
    adjustmentNote: note,
    internalNote,
  };
}
