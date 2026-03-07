// src/modules/ads/filters/ads-free-query.constants.js

export const FREE_QUERY_CACHE_TTL_MS = Number(
  process.env.ADS_FREE_QUERY_CACHE_TTL_MS || 10 * 60 * 1000
);

export const FREE_QUERY_MAX_TERMS = 24;
export const FREE_QUERY_MIN_TOKEN_LENGTH = 2;

export const FREE_QUERY_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "sem",
  "para",
  "por",
  "um",
  "uma",
  "uns",
  "umas",
  "e",
  "ou",
  "o",
  "a",
  "os",
  "as",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "que",
  "carro",
  "carros",
  "veiculo",
  "veiculos",
  "veículo",
  "veículos",
  "procuro",
  "quero",
  "buscar",
  "busca",
  "anuncio",
  "anúncio",
  "anuncios",
  "anúncios",
]);

export const FUEL_SYNONYMS = {
  flex: ["flex", "totalflex", "total-flex"],
  gasolina: ["gasolina"],
  diesel: ["diesel"],
  eletrico: ["eletrico", "elétrico", "ev"],
  hibrido: ["hibrido", "híbrido", "hybrid"],
  gnv: ["gnv"],
  etanol: ["etanol", "alcool", "álcool"],
};

export const TRANSMISSION_SYNONYMS = {
  automatico: ["automatico", "automático", "auto", "at"],
  manual: ["manual", "mt"],
  cvt: ["cvt"],
};

export const BODY_TYPE_SYNONYMS = {
  suv: ["suv", "utilitario", "utilitário", "crossover"],
  hatch: ["hatch", "hatchback"],
  sedan: ["sedan", "sedã", "seda"],
  picape: ["picape", "pickup", "camionete"],
  coupe: ["coupe", "coupé"],
  minivan: ["minivan", "van"],
  wagon: ["wagon", "perua"],
};

export const BELOW_FIPE_TERMS = [
  "abaixo da fipe",
  "abaixo fipe",
  "menos que a fipe",
  "menor que a fipe",
  "oportunidade",
  "oportunidades",
  "barato",
  "baratos",
];

export const HIGHLIGHT_TERMS = [
  "destaque",
  "destaques",
  "premium",
  "top",
];
