// src/modules/ads/filters/ads-free-query.constants.js

export {
  BODY_TYPE_SYNONYMS,
  FUEL_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "../ads.canonical.constants.js";

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

export const HIGHLIGHT_TERMS = ["destaque", "destaques", "premium", "top"];
