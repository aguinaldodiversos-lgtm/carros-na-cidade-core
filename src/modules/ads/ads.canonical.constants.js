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
