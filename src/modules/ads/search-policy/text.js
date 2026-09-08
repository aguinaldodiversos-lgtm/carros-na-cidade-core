// src/modules/ads/search-policy/text.js
//
// Utilitários de texto do resolvedor v1 (D2).
//
// `normalizeText`, `extractPriceSignals` e `extractYearSignals` são cópias
// literais das funções internas de ads-free-query.parser.js. Duplicadas de
// propósito: D2 exige o parser legado INTOCADO (nem para exportar), porque
// qualquer edição ali é mudança no caminho `off`. Se uma das cópias mudar, o
// teste tests/search-policy/text.test.js compara o comportamento das duas.
//
// O que é NOVO aqui e não existe no legado: `matchWordBoundary` — casamento
// por fronteira de palavra (\b). É a correção dos dois defeitos que o gate
// expôs (Icó dentro de "automático"; "at" dentro de "atibaia"/"fiat").

import {
  FREE_QUERY_MAX_TERMS,
  FREE_QUERY_MIN_TOKEN_LENGTH,
  FREE_QUERY_STOPWORDS,
} from "../filters/ads-free-query.constants.js";

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./,-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token && token.length >= FREE_QUERY_MIN_TOKEN_LENGTH && !FREE_QUERY_STOPWORDS.has(token)
    )
    .slice(0, FREE_QUERY_MAX_TERMS);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `phrase` aparece em `normalizedText` como palavra(s) inteira(s)?
 * Ambos já normalizados. Hífen e ponto dentro da frase são literais.
 * Retorna a RegExp usada (para o caller remover o trecho) ou null.
 */
export function matchWordBoundary(normalizedText, phrase) {
  const p = normalizeText(phrase);
  if (!p) return null;
  // (?<![\p{L}\p{N}]) e (?![\p{L}\p{N}]) em vez de \b: \b em JS só entende
  // [A-Za-z0-9_], e o texto normalizado ainda pode ter letras fora do ASCII
  // (ç cai fora do NFD-strip? não — mas ñ/ß ficam). Fronteira Unicode é o
  // que se quer: "ico" não casa em "automatico", "at" não casa em "fiat".
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(p)}(?![\\p{L}\\p{N}])`, "iu");
  return re.test(normalizedText) ? re : null;
}

export function extractPriceSignals(text) {
  const normalized = normalizeText(text);

  let min_price;
  let max_price;

  const parseMoney = (raw) => {
    const clean = String(raw).replace(/\./g, "").replace(",", ".").trim();
    const numeric = Number(clean);
    if (!Number.isFinite(numeric)) return undefined;
    if (numeric < 1000) return Math.round(numeric * 1000);
    return Math.round(numeric);
  };

  const betweenRegex =
    /\b(?:entre|de)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\s+(?:e|a|ate|até)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const maxRegex =
    /\b(?:ate|até|no maximo|no máximo|maximo|max)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const minRegex =
    /\b(?:acima de|mais de|a partir de|minimo|minimo de|mínimo|mínimo de)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/i;

  const betweenMatch = normalized.match(betweenRegex);
  if (betweenMatch) {
    return { min_price: parseMoney(betweenMatch[1]), max_price: parseMoney(betweenMatch[3]) };
  }

  const maxMatch = normalized.match(maxRegex);
  if (maxMatch) max_price = parseMoney(maxMatch[1]);

  const minMatch = normalized.match(minRegex);
  if (minMatch) min_price = parseMoney(minMatch[1]);

  const compactRegex = /\b(\d{1,3})\s*(mil|k)\b/gi;
  const compactMatches = [...normalized.matchAll(compactRegex)];
  if (!min_price && !max_price && compactMatches.length === 1) {
    max_price = parseMoney(compactMatches[0][1]);
  }

  return { min_price, max_price };
}

export function extractYearSignals(text) {
  const matches = [...normalizeText(text).matchAll(/\b(19\d{2}|20\d{2}|2100)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1900 && year <= 2100);

  if (!matches.length) return {};
  if (matches.length === 1) return { year_min: matches[0], year_max: matches[0] };
  return { year_min: Math.min(...matches), year_max: Math.max(...matches) };
}

/**
 * Texto residual: remove os trechos consumidos (marca, modelo, cidade,
 * sinônimos), os sinais de preço/ano e as palavras de ligação. O que sobra,
 * tokenizado, é a "versão" (§4.3). DEFAULT §12 aplicado: basta UM token
 * (o legado exigia dois) — "onix ltz" tem que virar SEARCH_VERSION com q="ltz".
 */
export function buildResidualQuery(text, consumedRegexes = []) {
  let residual = normalizeText(text);
  for (const re of consumedRegexes) {
    if (re) residual = residual.replace(new RegExp(re.source, "giu"), " ");
  }
  residual = residual
    .replace(
      /\b(ate|até|acima de|mais de|entre|de|e|a partir de|minimo|minimo de|mínimo|mínimo de|no maximo|maximo|max)\b/gi,
      " "
    )
    .replace(/\b\d{1,3}(?:[.,]\d{3})*\b/g, " ")
    .replace(/\b(19\d{2}|20\d{2}|2100)\b/g, " ")
    .replace(/\b(mil|k)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = tokenize(residual);
  return tokens.length >= 1 ? tokens.join(" ") : "";
}
