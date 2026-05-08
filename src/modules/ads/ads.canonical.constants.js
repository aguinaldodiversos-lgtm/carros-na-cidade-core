/**
 * Enum canônico de status de anúncio.
 *
 * Fonte única — qualquer literal de status no código deve passar por aqui.
 * Mantido alinhado ao que o banco aceita hoje em `ads.status`. Adicionar
 * novo valor (ex: pending_review) requer migration + atualização desta lista.
 *
 * Semântica:
 *   ACTIVE   — anúncio público, listável em `/comprar` e páginas territoriais.
 *   PAUSED   — escondido temporariamente pelo dono; reativável via PATCH.
 *   DELETED  — soft-delete; oculto em todo lugar; nunca volta para ACTIVE
 *              pelo caminho do dono (ver account.service.updateOwnedAdStatus).
 *   BLOCKED  — bloqueio administrativo; mesmo tratamento que DELETED no
 *              guard do dono.
 */
export const AD_STATUS = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  DELETED: "deleted",
  BLOCKED: "blocked",
});

/** Status que aparecem publicamente em listagens. */
export const AD_STATUS_PUBLIC = Object.freeze([AD_STATUS.ACTIVE]);

/** Status que o dono pode operar via PATCH/PUT (pause/activate). */
export const AD_STATUS_OWNER_OPERABLE = Object.freeze([AD_STATUS.ACTIVE, AD_STATUS.PAUSED]);

/** Conjunto de todos os status conhecidos (defesa contra strings desconhecidas). */
export const AD_STATUS_VALUES = Object.freeze(Object.values(AD_STATUS));

export function isKnownAdStatus(value) {
  return AD_STATUS_VALUES.includes(String(value || ""));
}

/**
 * Fonte única de verdade para slugs de veículo persistidos em `ads`.
 * Deve permanecer alinhada ao CHECK do Postgres (ver docs/database/ads-schema-contract.sql).
 */
export const BODY_TYPE_SYNONYMS = Object.freeze({
  suv: ["suv", "utilitario", "utilitário", "crossover"],
  hatch: ["hatch", "hatchback"],
  sedan: ["sedan", "sedã", "seda"],
  picape: ["picape", "pickup", "camionete"],
  coupe: ["coupe", "coupé"],
  minivan: ["minivan", "van"],
  wagon: ["wagon", "perua"],
});

export const FUEL_SYNONYMS = Object.freeze({
  flex: ["flex", "totalflex", "total-flex"],
  gasolina: ["gasolina"],
  diesel: ["diesel"],
  eletrico: ["eletrico", "elétrico", "ev"],
  hibrido: ["hibrido", "híbrido", "hybrid"],
  gnv: ["gnv"],
  etanol: ["etanol", "alcool", "álcool"],
});

export const TRANSMISSION_SYNONYMS = Object.freeze({
  automatico: [
    "automatico",
    "automático",
    "auto",
    "at",
    "automatizado",
    "robotizado",
    "semi-automatico",
    "semi-automático",
    "semi automatico",
    "dsg",
  ],
  manual: ["manual", "mt"],
  cvt: ["cvt"],
});

/** @readonly */
export const CANONICAL_BODY_TYPE_SLUGS = Object.freeze(Object.keys(BODY_TYPE_SYNONYMS));

/** @readonly */
export const CANONICAL_FUEL_TYPE_SLUGS = Object.freeze(Object.keys(FUEL_SYNONYMS));

/** @readonly */
export const CANONICAL_TRANSMISSION_SLUGS = Object.freeze(Object.keys(TRANSMISSION_SYNONYMS));

/**
 * Listas canônicas (slugs) para contrato Zod / API — mesmas chaves dos mapas de sinônimos.
 * @type {readonly string[]}
 */
export const BODY_TYPES = CANONICAL_BODY_TYPE_SLUGS;

/** @type {readonly string[]} */
export const FUEL_TYPES = CANONICAL_FUEL_TYPE_SLUGS;

/** @type {readonly string[]} */
export const TRANSMISSION_TYPES = CANONICAL_TRANSMISSION_SLUGS;
