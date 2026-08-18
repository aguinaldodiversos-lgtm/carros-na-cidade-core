// Validação de entrada das solicitações de venda (Produto 2, Fase 4.1).
//
// Mesmo estilo de `purchase-intents.validation.js`: um helper por campo, que
// NORMALIZA e devolve o valor pronto para a coluna, ou lança `AppError`. Nenhum
// helper faz I/O — a existência da cidade é conferida no service.
//
// ────────────────────────────────────────────────────────────────────────────
// O CLIENTE NÃO É AUTORIDADE
// ────────────────────────────────────────────────────────────────────────────
// O formulário manda a marca crua da FIPE e a descrição FIPE do modelo. Quem
// produz `brand`, `brand_slug`, `model` e `model_slug` é o SERVIDOR, pelos
// mesmos helpers canônicos que os anúncios e as procuras usam. Se o cliente
// pudesse mandar o slug pronto, duas solicitações do mesmo carro poderiam ficar
// com slugs diferentes — e o casamento com o estoque da Fase 4.2 falharia sem
// nenhum erro visível.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { canonicalBrandLabel, canonicalBrandSlug } from "../../shared/utils/slugify.js";
import { deriveCommercialModel } from "../../shared/vehicle/commercial-model.js";
import { SALE_REQUEST_KEY_PREFIX } from "../../infrastructure/storage/r2.service.js";
// Reuso deliberado do validador que já protege o proxy de imagens: ele recusa
// `..`, `\`, `://`, `data:`/`javascript:`/`file:`/`blob:` e `//` inicial. Um
// segundo validador aqui teria de repetir essa lista — e a cópia que ficasse
// para trás numa correção seria justamente a que decide o que entra no storage.
// É função PURA (não toca env, não chama R2), então importá-la do controller não
// arrasta infraestrutura junto.
import { validateStorageKey } from "../vehicle-images/vehicle-images.controller.js";
import {
  normalizeFuelTypeForStorage,
  normalizeTransmissionForStorage,
} from "../ads/ads.storage-normalize.js";
import {
  decodeCursor as sharedDecodeCursor,
  encodeCursor as sharedEncodeCursor,
  parseLimit as sharedParseLimit,
} from "../../shared/pagination/cursor.js";
import {
  BODY_PAINT_ISSUES,
  BODY_PAINT_STATUS,
  BODY_PAINT_STATUSES,
  CAUTION_REPORT_STATUSES,
  DECLARED_CONDITIONS,
  IPVA_STATUS,
  IPVA_STATUSES,
  LICENSING_STATUSES,
  MECHANICAL_CONDITION,
  MECHANICAL_CONDITIONS,
  SALE_REQUEST_CODE,
  SALE_REQUEST_EVALUATION_LIMITS,
  SALE_REQUEST_LIMITS,
  SALE_REQUEST_PAGE,
  SALE_REQUEST_PHOTOS,
  TIRE_CONDITIONS,
  YES_NO_UNKNOWN,
  YES_NO_UNKNOWN_VALUES,
  maxModelYear,
} from "./sale-requests.constants.js";

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function invalid(message, field) {
  return new AppError(message, 400, true, { code: SALE_REQUEST_CODE.INVALID_FIELD, field });
}

/**
 * `brand` cru da FIPE → `{ brand, brandSlug }` canônicos.
 *
 * A FIPE devolve a marca com prefixo de grupo ("GM - Chevrolet",
 * "VW - VolksWagen"). `canonicalBrandLabel`/`canonicalBrandSlug` tiram o prefixo
 * e produzem o mesmo par que o resto do projeto usa em rota e agregação.
 */
export function validateBrand(raw) {
  const value = asTrimmedString(raw);
  if (value === "") {
    throw invalid("Escolha a marca do veículo.", "brand");
  }
  if (value.length > SALE_REQUEST_LIMITS.BRAND_MAX) {
    throw invalid(
      `A marca pode ter no máximo ${SALE_REQUEST_LIMITS.BRAND_MAX} caracteres.`,
      "brand"
    );
  }

  const brandSlug = canonicalBrandSlug(value);
  const brand = canonicalBrandLabel(value);
  if (!brandSlug || !brand) {
    throw invalid("Marca inválida.", "brand");
  }

  return { brand, brandSlug };
}

/**
 * Descrição FIPE do modelo → `{ fipeModelDescription, model, modelSlug }`.
 *
 * Guarda a descrição INTEIRA (que carrega a versão — "EX", "LX", "200 TSI") e
 * DERIVA o modelo comercial dela. Os dois são necessários e servem a coisas
 * diferentes: a descrição é o que o lojista precisa para avaliar; o comercial é
 * o que aparece na tela e o que a Fase 4.2 vai comparar com o estoque.
 *
 * `deriveCommercialModel` precisa da marca CRUA (com prefixo de grupo, se
 * houver) para que a derivação enxergue o mesmo texto que a FIPE entregou —
 * modelos de cabeça numérica dependem disso ("5 Luxury 1.5 TB FWD" só vira
 * "Omoda 5" quando a marca chega junto).
 */
export function validateFipeModelDescription(raw, { brand } = {}) {
  const value = asTrimmedString(raw);
  if (value === "") {
    throw invalid("Escolha o modelo do veículo.", "fipe_model_description");
  }
  if (value.length > SALE_REQUEST_LIMITS.MODEL_DESCRIPTION_MAX) {
    throw invalid(
      `O modelo pode ter no máximo ${SALE_REQUEST_LIMITS.MODEL_DESCRIPTION_MAX} caracteres.`,
      "fipe_model_description"
    );
  }

  const commercial = deriveCommercialModel(value, { brand });
  if (!commercial?.slug || !commercial?.label) {
    throw invalid("Modelo inválido.", "fipe_model_description");
  }

  return {
    fipeModelDescription: value,
    model: commercial.label,
    modelSlug: commercial.slug,
  };
}

/**
 * `year` → inteiro dentro de [1950, ano civil + 1].
 *
 * O teto acompanha o relógio porque ano-modelo legítimo pode ser o próximo ano
 * civil. O CHECK da migration usa a faixa larga (1950–2100) como rede
 * anti-digitação; a regra fina é esta, que devolve mensagem legível.
 */
export function validateYear(raw, { now = new Date() } = {}) {
  const asText = String(raw ?? "").trim();
  if (!/^\d{4}$/.test(asText)) {
    throw invalid("Informe o ano do veículo com 4 dígitos.", "year");
  }

  const year = Number.parseInt(asText, 10);
  const max = maxModelYear(now);
  if (year < SALE_REQUEST_LIMITS.YEAR_MIN || year > max) {
    throw invalid(`O ano deve estar entre ${SALE_REQUEST_LIMITS.YEAR_MIN} e ${max}.`, "year");
  }
  return year;
}

/**
 * `mileage` → inteiro ≥ 0.
 *
 * Zero é aceito (carro 0 km é vendido). O teto pega o erro de unidade — quem
 * digita metros no lugar de quilômetros.
 */
export function validateMileage(raw) {
  if (raw == null || String(raw).trim() === "") {
    throw invalid("Informe a quilometragem.", "mileage");
  }

  const asText = String(raw).trim();
  if (!/^\d+$/.test(asText)) {
    throw invalid("Quilometragem inválida. Use apenas números.", "mileage");
  }

  const mileage = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(mileage) || mileage < 0) {
    throw invalid("Quilometragem inválida.", "mileage");
  }
  if (mileage > SALE_REQUEST_LIMITS.MILEAGE_MAX) {
    throw invalid("Quilometragem acima do máximo permitido.", "mileage");
  }
  return mileage;
}

/** `transmission` → slug canônico. Mesmo normalizador dos anúncios. */
export function validateTransmission(raw) {
  const slug = normalizeTransmissionForStorage(raw);
  if (!slug) {
    throw invalid("Escolha o câmbio.", "transmission");
  }
  return slug;
}

/** `fuel_type` → slug canônico. Mesmo normalizador dos anúncios. */
export function validateFuelType(raw) {
  const slug = normalizeFuelTypeForStorage(raw);
  if (!slug) {
    throw invalid("Escolha o combustível.", "fuel_type");
  }
  return slug;
}

/** `declared_condition` → allowlist fechada. */
export function validateDeclaredCondition(raw) {
  const value = asTrimmedString(raw);
  if (!DECLARED_CONDITIONS.includes(value)) {
    throw invalid("Escolha o estado de conservação do veículo.", "declared_condition");
  }
  return value;
}

/**
 * `known_issues` → texto opcional, no máximo 1000 caracteres.
 *
 * String vazia vira `null` e não `""`: um campo opcional tem UM jeito de estar
 * ausente. Sem isso, metade das linhas teria NULL e a outra metade string vazia,
 * e todo `IS NULL` futuro erraria em metade dos casos.
 */
export function validateKnownIssues(raw) {
  if (raw == null) return null;

  const value = asTrimmedString(raw);
  if (value === "") return null;

  if (value.length > SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX) {
    throw invalid(
      `A descrição de problemas pode ter no máximo ${SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX} caracteres.`,
      "known_issues"
    );
  }
  return value;
}

/**
 * `city_id` → inteiro positivo.
 *
 * A EXISTÊNCIA da cidade é conferida no service, com consulta ao catálogo:
 * validar formato aqui e existência lá mantém este arquivo sem I/O.
 *
 * Não existe fallback nenhum — nem `users.city`, nem cookie territorial, nem
 * "primeira cidade". Ausência é 400, e precisa ser: a cidade errada entrega a
 * solicitação para as lojas erradas.
 */
export function parseCityId(raw) {
  if (raw == null || String(raw).trim() === "") {
    throw new AppError("Escolha a cidade.", 400, true, {
      code: SALE_REQUEST_CODE.CITY_REQUIRED,
      field: "city_id",
    });
  }

  const asText = String(raw).trim();
  if (!/^\d+$/.test(asText)) {
    throw invalid("Cidade inválida.", "city_id");
  }

  const cityId = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(cityId) || cityId <= 0) {
    throw invalid("Cidade inválida.", "city_id");
  }
  return cityId;
}

/**
 * `:id` da rota → inteiro positivo, ou 404.
 *
 * 404 e não 400 pelo mesmo motivo de `parsePurchaseIntentId`: quem manda
 * `/sale-requests/abc` está sondando, e "id inválido" confirma o formato da
 * chave. A string INTEIRA precisa ser dígitos — `Number.parseInt` sozinho leria
 * o prefixo de "12abc" e agiria sobre a solicitação 12.
 */
export function parseSaleRequestId(raw) {
  const asText = String(raw ?? "").trim();
  if (!/^\d+$/.test(asText)) {
    throw new AppError("Solicitação não encontrada.", 404);
  }

  const id = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError("Solicitação não encontrada.", 404);
  }
  return id;
}

/**
 * Chaves de foto recebidas do cliente → lista ordenada e PROVADA como do dono.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AS TRÊS GUARDAS, NESTA ORDEM
 * ────────────────────────────────────────────────────────────────────────────
 *   1. QUANTIDADE — entre 4 e 12. O backend é a autoridade; o formulário valida
 *      em paralelo só para dar resposta imediata.
 *   2. FORMA — `validateStorageKey` recusa traversal, barra invertida, URL
 *      absoluta e esquema perigoso. Reusado, não reescrito.
 *   3. POSSE — a chave normalizada precisa começar com
 *      `sale-requests/{ownerUserId}/`. É o que impede reivindicar o objeto de
 *      outra pessoa mandando a chave dela no corpo.
 *
 * A guarda 3 depende de a 2 ter normalizado a chave primeiro: sem remover a
 * barra inicial, `/sale-requests/7/...` não casaria o prefixo e um caminho
 * legítimo seria recusado; pior, `sale-requests/7/../9/foto.webp` passaria pelo
 * prefixo se o traversal não tivesse sido barrado antes.
 *
 * `ownerUserId` é sempre `^\d+$` (garantido por `requireUserId`), e a
 * sanitização de segmento que o gerador de chave aplica é identidade para
 * dígitos — por isso o prefixo pode ser montado por concatenação direta sem
 * divergir do que `generateSaleRequestImageKey` produziu.
 *
 * Duplicatas são recusadas ANTES do banco: o `UNIQUE` global de `storage_key`
 * também pegaria, mas devolveria erro de constraint em vez de mensagem de campo.
 *
 * @returns {Array<{ storageKey: string, sortOrder: number }>} índice 0 = capa
 */
export function validatePhotoKeys(raw, { ownerUserId }) {
  const list = Array.isArray(raw) ? raw : [];

  if (list.length < SALE_REQUEST_PHOTOS.MIN) {
    throw new AppError(
      `Envie pelo menos ${SALE_REQUEST_PHOTOS.MIN} fotos do veículo.`,
      400,
      true,
      { code: SALE_REQUEST_CODE.PHOTO_COUNT, field: "images", min: SALE_REQUEST_PHOTOS.MIN }
    );
  }

  if (list.length > SALE_REQUEST_PHOTOS.MAX) {
    throw new AppError(
      `Envie no máximo ${SALE_REQUEST_PHOTOS.MAX} fotos do veículo.`,
      400,
      true,
      { code: SALE_REQUEST_CODE.PHOTO_COUNT, field: "images", max: SALE_REQUEST_PHOTOS.MAX }
    );
  }

  const expectedPrefix = `${SALE_REQUEST_KEY_PREFIX}/${ownerUserId}/`;
  const seen = new Set();
  const photos = [];

  for (let index = 0; index < list.length; index += 1) {
    // Aceita tanto a string crua quanto `{ storage_key }` — o cliente monta a
    // lista a partir da resposta do upload, que devolve objetos.
    const item = list[index];
    const rawKey =
      typeof item === "string" ? item : typeof item?.storage_key === "string" ? item.storage_key : "";

    const validation = validateStorageKey(rawKey);
    if (!validation.ok) {
      throw new AppError("Foto inválida. Envie as fotos novamente.", 400, true, {
        code: SALE_REQUEST_CODE.INVALID_PHOTO,
        field: "images",
        index,
      });
    }

    if (!validation.key.startsWith(expectedPrefix)) {
      // Mensagem genérica de propósito: quem tentou reivindicar a foto de outra
      // pessoa não recebe confirmação de que o prefixo é o critério.
      throw new AppError("Foto inválida. Envie as fotos novamente.", 400, true, {
        code: SALE_REQUEST_CODE.INVALID_PHOTO,
        field: "images",
        index,
      });
    }

    if (seen.has(validation.key)) {
      throw new AppError("Há fotos repetidas. Envie as fotos novamente.", 400, true, {
        code: SALE_REQUEST_CODE.INVALID_PHOTO,
        field: "images",
        index,
      });
    }
    seen.add(validation.key);

    photos.push({ storageKey: validation.key, sortOrder: index });
  }

  return photos;
}

/** `limit` da query → [1, MAX]. Ausente/absurdo → default. */
export function parseLimit(raw) {
  return sharedParseLimit(raw, {
    defaultLimit: SALE_REQUEST_PAGE.DEFAULT_LIMIT,
    maxLimit: SALE_REQUEST_PAGE.MAX_LIMIT,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// FICHA DE AVALIAÇÃO — VALIDADORES
// ────────────────────────────────────────────────────────────────────────────
// Mesmo contrato dos validadores acima: NORMALIZAM e devolvem o valor pronto
// para a coluna, ou lançam `AppError` com o `field` exato. O `field` é o nome da
// COLUNA porque é assim que a tela sabe em qual seção destacar o erro — um nome
// de conveniência aqui quebraria esse mapeamento sem quebrar nenhum teste.

/** Fábrica de validador de allowlist fechada. Um por vocabulário. */
function allowlistValidator(values, field, message) {
  return function validate(raw) {
    const value = asTrimmedString(raw);
    if (!values.includes(value)) {
      throw invalid(message, field);
    }
    return value;
  };
}

/** `tire_condition` → allowlist fechada. Obrigatório. */
export const validateTireCondition = allowlistValidator(
  TIRE_CONDITIONS,
  "tire_condition",
  "Informe como estão os pneus."
);

/** `financing_status` → sim/não/não sei. Obrigatório. */
export const validateFinancingStatus = allowlistValidator(
  YES_NO_UNKNOWN_VALUES,
  "financing_status",
  "Informe se o veículo possui financiamento ativo."
);

/** `fines_status` → sim/não/não sei. Obrigatório. */
export const validateFinesStatus = allowlistValidator(
  YES_NO_UNKNOWN_VALUES,
  "fines_status",
  "Informe se há multas pendentes."
);

/** `ipva_status` → quitado/parcelado/em aberto/não sei. Obrigatório. */
export const validateIpvaStatus = allowlistValidator(
  IPVA_STATUSES,
  "ipva_status",
  "Informe a situação do IPVA."
);

/** `licensing_status` → em dia/pendente/não sei. Obrigatório. */
export const validateLicensingStatus = allowlistValidator(
  LICENSING_STATUSES,
  "licensing_status",
  "Informe a situação do licenciamento."
);

/** `caution_report_status` → vocabulário ÚNICO (ver constante). Obrigatório. */
export const validateCautionReportStatus = allowlistValidator(
  CAUTION_REPORT_STATUSES,
  "caution_report_status",
  "Informe a situação do laudo cautelar."
);

/** `auction_history` → sim/não/não sei. Obrigatório. */
export const validateAuctionHistory = allowlistValidator(
  YES_NO_UNKNOWN_VALUES,
  "auction_history",
  "Informe se o veículo passou por leilão."
);

/** `collision_history` → sim/não/não sei. Obrigatório. */
export const validateCollisionHistory = allowlistValidator(
  YES_NO_UNKNOWN_VALUES,
  "collision_history",
  "Informe se há colisão ou sinistro conhecido."
);

/**
 * Valor monetário OPCIONAL → string com 2 casas, ou `null`.
 *
 * Aceita número ou string de dígitos com no máximo duas decimais e PONTO como
 * separador. NÃO aceita "18.500,00": num formato em que o ponto é milhar em um
 * lugar e decimal em outro, "1.500" é ambíguo entre mil e um e meio — e
 * adivinhar errado num campo de saldo devedor é um erro caro. A conversão do
 * texto brasileiro é trabalho da TELA, que sabe o que a pessoa digitou; o
 * payload trafega o número já desambiguado.
 *
 * Vazio vira `null` pelo mesmo motivo de `validateKnownIssues`: um campo
 * opcional tem UM jeito de estar ausente.
 */
export function validateMoney(raw, field, label) {
  if (raw == null) return null;

  const asText = typeof raw === "number" ? String(raw) : asTrimmedString(raw);
  if (asText === "") return null;

  if (!/^\d{1,9}(\.\d{1,2})?$/.test(asText)) {
    throw invalid(`${label} inválido. Use apenas números.`, field);
  }

  const value = Number(asText);
  if (!Number.isFinite(value) || value < 0) {
    throw invalid(`${label} inválido.`, field);
  }
  if (value > SALE_REQUEST_EVALUATION_LIMITS.MONEY_MAX) {
    throw invalid(`${label} acima do máximo permitido.`, field);
  }

  // Texto com 2 casas nas duas direções: o driver `pg` devolve NUMERIC como
  // string, e manter o valor em texto na ida evita que um float de ida e um
  // texto de volta pareçam valores diferentes. Mesma disciplina de
  // `fipeReferenceValue`.
  return value.toFixed(2);
}

/**
 * Um conjunto mecânico → `{ condition, notes }`.
 *
 * A REGRA CRUZADA vive aqui, e não no chamador: "possui problema" sem descrição
 * é uma solicitação que não ajuda ninguém a avaliar nada, e qualquer outro
 * estado COM descrição preenchida é lixo de UI — o texto que ficou para trás
 * quando a pessoa mudou de ideia. Normalizar para `null` é o que garante que a
 * coluna não guarde a resposta de uma pergunta que deixou de ser feita.
 */
export function validateMechanicalPart(rawCondition, rawNotes, { field, label }) {
  const condition = allowlistValidator(
    MECHANICAL_CONDITIONS,
    field,
    `Informe a situação do ${label}.`
  )(rawCondition);

  const notesField = `${field.replace(/_condition$/, "")}_notes`;

  if (condition !== MECHANICAL_CONDITION.ISSUE) {
    // Descarta o texto: a pergunta deixou de existir quando a resposta mudou.
    return { condition, notes: null };
  }

  const notes = asTrimmedString(rawNotes);
  if (notes === "") {
    throw invalid(`Descreva o problema do ${label}.`, notesField);
  }
  if (notes.length > SALE_REQUEST_EVALUATION_LIMITS.MECHANICAL_NOTES_MAX) {
    throw invalid(
      `A descrição pode ter no máximo ${SALE_REQUEST_EVALUATION_LIMITS.MECHANICAL_NOTES_MAX} caracteres.`,
      notesField
    );
  }

  return { condition, notes };
}

/**
 * Lataria e pintura → `{ status, issues, notes }`.
 *
 * As duas regras cruzadas são simétricas e existem para tornar impossível o
 * registro contraditório:
 *
 *   `issues`         → precisa de PELO MENOS UM detalhe marcado. "Possui
 *                      detalhes" sem dizer quais não informa nada.
 *   `none`/`unknown` → NENHUM detalhe, e nenhuma observação. Guardar "riscos"
 *                      junto de "nenhum detalhe conhecido" gravaria uma
 *                      contradição que nenhuma leitura futura saberia desfazer.
 *
 * Duplicatas são removidas em vez de recusadas: marcar a mesma caixa duas vezes
 * é impossível na tela, e um payload repetido não é hostil — é ruído.
 */
export function validateBodyPaint(input = {}) {
  const status = allowlistValidator(
    BODY_PAINT_STATUSES,
    "body_paint_status",
    "Informe a situação da lataria e pintura."
  )(input.body_paint_status);

  const rawIssues = Array.isArray(input.body_paint_issues) ? input.body_paint_issues : [];
  const issues = [];
  for (const item of rawIssues) {
    const value = asTrimmedString(item);
    if (!BODY_PAINT_ISSUES.includes(value)) {
      throw invalid("Detalhe de lataria inválido.", "body_paint_issues");
    }
    if (!issues.includes(value)) issues.push(value);
  }

  if (status !== BODY_PAINT_STATUS.ISSUES) {
    if (issues.length > 0) {
      throw invalid(
        "Não é possível marcar detalhes junto com esta resposta.",
        "body_paint_issues"
      );
    }
    return { status, issues: [], notes: null };
  }

  if (issues.length === 0) {
    throw invalid("Marque pelo menos um detalhe da lataria ou pintura.", "body_paint_issues");
  }

  const notes = asTrimmedString(input.body_paint_notes);
  if (notes.length > SALE_REQUEST_EVALUATION_LIMITS.BODY_PAINT_NOTES_MAX) {
    throw invalid(
      `A descrição pode ter no máximo ${SALE_REQUEST_EVALUATION_LIMITS.BODY_PAINT_NOTES_MAX} caracteres.`,
      "body_paint_notes"
    );
  }

  return { status, issues, notes: notes === "" ? null : notes };
}

/**
 * A ficha inteira → objeto normalizado, já no formato das colunas.
 *
 * Separado de `validateNewSaleRequest` para poder ser exercitado sozinho: são
 * dezoito colunas com cinco regras cruzadas, e testá-las através do corpo
 * completo exigiria montar marca, modelo, cidade e quatro fotos só para provar
 * que o saldo devedor vira NULL.
 */
export function validateEvaluation(input = {}) {
  const financingStatus = validateFinancingStatus(input.financing_status);
  const finesStatus = validateFinesStatus(input.fines_status);
  const ipvaStatus = validateIpvaStatus(input.ipva_status);

  const engine = validateMechanicalPart(input.engine_condition, input.engine_notes, {
    field: "engine_condition",
    label: "motor",
  });
  const gearbox = validateMechanicalPart(input.gearbox_condition, input.gearbox_notes, {
    field: "gearbox_condition",
    label: "câmbio",
  });
  const suspension = validateMechanicalPart(input.suspension_condition, input.suspension_notes, {
    field: "suspension_condition",
    label: "suspensão",
  });

  const bodyPaint = validateBodyPaint(input);

  // O valor só sobrevive quando a resposta que o justifica foi dada. Fora disso
  // é `null` — e não erro: quem responde "não tenho financiamento" enquanto o
  // payload ainda carrega um saldo antigo da tela não cometeu falta nenhuma,
  // apenas mudou de ideia.
  const financingBalance =
    financingStatus === YES_NO_UNKNOWN.YES
      ? validateMoney(input.financing_balance, "financing_balance", "Saldo devedor")
      : null;

  const finesAmount =
    finesStatus === YES_NO_UNKNOWN.YES
      ? validateMoney(input.fines_amount, "fines_amount", "Valor das multas")
      : null;

  const ipvaAmountDue =
    ipvaStatus === IPVA_STATUS.INSTALLMENTS || ipvaStatus === IPVA_STATUS.OPEN
      ? validateMoney(input.ipva_amount_due, "ipva_amount_due", "Valor pendente do IPVA")
      : null;

  return {
    tireCondition: validateTireCondition(input.tire_condition),

    financingStatus,
    financingBalance,
    finesStatus,
    finesAmount,
    ipvaStatus,
    ipvaAmountDue,
    licensingStatus: validateLicensingStatus(input.licensing_status),

    cautionReportStatus: validateCautionReportStatus(input.caution_report_status),
    auctionHistory: validateAuctionHistory(input.auction_history),
    collisionHistory: validateCollisionHistory(input.collision_history),

    engineCondition: engine.condition,
    engineNotes: engine.notes,
    gearboxCondition: gearbox.condition,
    gearboxNotes: gearbox.notes,
    suspensionCondition: suspension.condition,
    suspensionNotes: suspension.notes,

    bodyPaintStatus: bodyPaint.status,
    bodyPaintIssues: bodyPaint.issues,
    bodyPaintNotes: bodyPaint.notes,
  };
}

/**
 * Valida o corpo inteiro de uma nova solicitação e devolve o registro
 * NORMALIZADO, já no formato das colunas.
 *
 * A forma é validada aqui e nos CHECKs do banco. Redundância proposital: os
 * CHECKs protegem contra qualquer caminho que não passe por esta função (script,
 * SQL manual, módulo futuro), e esta função dá a mensagem legível que o CHECK
 * não consegue dar.
 *
 * O que NÃO está aqui, de propósito: `plate` (não é coletada — ver §17 da
 * especificação e §7 da auditoria), `fipe_reference_value` e `fipe_code`
 * (resolvidos no SERVIDOR, nunca aceitos do cliente como autoridade).
 */
export function validateNewSaleRequest(input = {}, { ownerUserId, now = new Date() } = {}) {
  const { brand, brandSlug } = validateBrand(input.brand);

  // A marca CRUA vai para a derivação do modelo; a canônica vai para a coluna.
  const { fipeModelDescription, model, modelSlug } = validateFipeModelDescription(
    input.fipe_model_description,
    { brand: input.brand }
  );

  return {
    cityId: parseCityId(input.city_id),
    brand,
    brandSlug,
    model,
    modelSlug,
    fipeModelDescription,
    year: validateYear(input.year, { now }),
    mileage: validateMileage(input.mileage),
    transmission: validateTransmission(input.transmission),
    fuelType: validateFuelType(input.fuel_type),
    declaredCondition: validateDeclaredCondition(input.declared_condition),
    knownIssues: validateKnownIssues(input.known_issues),
    ...validateEvaluation(input),
    photos: validatePhotoKeys(input.images, { ownerUserId }),
  };
}

// Reexports do codec compartilhado, para que o service importe tudo de um lugar
// só e o teste do módulo exercite exatamente o que a rota usa.
export function decodeCursor(raw) {
  return sharedDecodeCursor(raw);
}

export function encodeCursor(row) {
  return sharedEncodeCursor(row);
}
