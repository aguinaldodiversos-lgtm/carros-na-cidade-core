/**
 * Entrada do FEED do lojista (Compradores ativos): filtros, ordenação e cursor.
 *
 * Funções PURAS — nenhuma toca banco, env ou storage. Quem decide de que cidade
 * é o lojista continua sendo o service (`resolveDealerCityId`); aqui só se
 * decide o que a query string SIGNIFICA.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM ARQUIVO NOVO, E NÃO MAIS FUNÇÕES EM `purchase-intents.validation`
 * ────────────────────────────────────────────────────────────────────────────
 * Aquele arquivo valida a ESCRITA de uma procura — o que o comprador publica. O
 * que está aqui valida a LEITURA que o lojista faz do conjunto. São dois
 * vocabulários com regras opostas: na escrita, campo ausente é erro; na leitura,
 * campo ausente é "sem filtro".
 *
 * O `decodeCursor` de lá continua servindo a listagem do COMPRADOR, que tem uma
 * ordem só (`created_at DESC`) e por isso não precisa carregar o nome da
 * ordenação. Estender aquele codec para os dois casos faria a listagem do
 * comprador pagar o preço de uma flexibilidade que ela não usa — e mudaria um
 * formato de cursor já em produção.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FILTRO COM VALOR DESCONHECIDO É 400, NÃO É IGNORADO
 * ────────────────────────────────────────────────────────────────────────────
 * A paginação deste projeto é deliberadamente tolerante: `?limit=abc` cai no
 * default em vez de derrubar a listagem, porque limite é detalhe de transporte.
 * FILTRO é o contrário, e a diferença é comercial.
 *
 * Um `?transmission=Manual%20ou%20automatico` ignorado em silêncio devolve o
 * feed INTEIRO sob um cabeçalho que promete "Manual". O lojista montaria a
 * abordagem em cima de uma promessa que a resposta não cumpriu.
 *
 * Recusar alto custa um erro legível; aceitar em silêncio custa uma abordagem
 * errada. É a mesma decisão já tomada no feed do Produto 2
 * (`sale-requests.dealer.validation.js`) — e ela vale aqui pelo mesmo motivo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O CURSOR CARREGA O NOME DA ORDENAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Este feed ordena por `created_at` E por `max_price`. Sem o nome da ordenação
 * dentro do cursor, trocar o seletor com uma página já carregada compararia um
 * `numeric` com um `timestamptz` — o PostgreSQL recusaria com erro de tipo, e o
 * feed viraria 500 num caminho que o usuário alcança clicando em dois controles
 * na ordem errada.
 *
 * `Date.parse("95000")` é VÁLIDO em JavaScript (vira o ano 95000), então validar
 * a chave sem conhecer o tipo não pegaria a troca — daí `keyType` no spec.
 */

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { canonicalBrandSlug } from "../../shared/utils/slugify.js";
import {
  normalizeBodyTypeForStorage,
  normalizeTransmissionForStorage,
} from "../ads/ads.storage-normalize.js";
import {
  DEALER_OPPORTUNITY_SORT,
  DEALER_OPPORTUNITY_SORT_SPEC,
  DEALER_OPPORTUNITY_SORTS,
  PURCHASE_INTENT_LIMITS,
  PURCHASE_INTENT_TYPES,
  PURCHASE_TIMEFRAMES,
} from "./purchase-intents.constants.js";

export const DEALER_OPPORTUNITY_DEFAULT_SORT = DEALER_OPPORTUNITY_SORT.RECENT;

const CODE = "PURCHASE_INTENT_INVALID_FILTER";

function invalidFilter(message, field) {
  return new AppError(message, 400, true, { code: CODE, field });
}

/** Ausente = `null`. `""` e `"   "` também: um filtro em branco não é um filtro. */
function optionalString(raw) {
  if (raw == null) return null;
  // Query string repetida (`?x=a&x=b`) chega como array no Express. Um array
  // virando "a,b" casaria zero linhas e pareceria um filtro funcionando.
  if (Array.isArray(raw)) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/**
 * Valor opcional dentro de uma allowlist fechada.
 *
 * Igualdade estrita contra o vocabulário que o CHECK do banco impõe. Sem
 * `toLowerCase()` e sem sinônimos: normalizar aqui aceitaria uma grafia que
 * nenhum caminho de escrita produz, e o filtro casaria zero linhas enquanto
 * parece estar funcionando.
 */
function optionalEnum(raw, allowed, { field, label }) {
  const value = optionalString(raw);
  if (value == null) return null;
  if (!allowed.includes(value)) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }
  return value;
}

/**
 * Câmbio e carroceria passam pelo MESMO normalizador da publicação.
 *
 * `?transmission=Automático` e `?transmission=automatico` precisam casar a mesma
 * coluna, porque é o normalizador que decidiu o que foi GRAVADO. Comparação crua
 * aqui faria o filtro vindo de um link com acento devolver lista vazia.
 */
function optionalNormalized(raw, normalizer, { field, label }) {
  const value = optionalString(raw);
  if (value == null) return null;

  const slug = normalizer(value);
  if (!slug) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }
  return slug;
}

/**
 * Marca → `brand_slug`.
 *
 * O cliente manda o RÓTULO que recebeu no próprio feed ("Volkswagen"), não um
 * slug: `brand_slug` não faz parte do DTO do lojista, e acrescentá-lo ao
 * payload só para alimentar um `<select>` seria expor uma coluna a mais sem
 * necessidade.
 *
 * `canonicalBrandSlug` é a MESMA função que gravou a coluna (via
 * `validateBrand`), e ela é idempotente sobre o rótulo canônico — então
 * "Volkswagen", "VW - VolksWagen" e "volkswagen" convergem para a mesma linha.
 */
function optionalBrandSlug(raw) {
  const value = optionalString(raw);
  if (value == null) return null;

  if (value.length > PURCHASE_INTENT_LIMITS.BRAND_MAX) {
    throw invalidFilter("Filtro de marca inválido.", "brand");
  }

  const slug = canonicalBrandSlug(value);
  if (!slug) {
    throw invalidFilter("Filtro de marca inválido.", "brand");
  }
  return slug;
}

/**
 * Dinheiro do filtro de orçamento.
 *
 * Aceita só dígitos (opcionalmente com centavos), na MESMA faixa que a escrita
 * aceita. Um teto fora da faixa é 400 e não um `clamp` silencioso: quem digitou
 * "999999999" precisa saber que o número não valeu, senão lê o feed inteiro como
 * se fosse o resultado do filtro.
 */
function optionalMoney(raw, { field, label }) {
  const value = optionalString(raw);
  if (value == null) return null;

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > PURCHASE_INTENT_LIMITS.MAX_PRICE_MAX) {
    throw invalidFilter(`Filtro de ${label} fora da faixa aceita.`, field);
  }
  return parsed;
}

/** `sort` → uma das ordenações suportadas. Ausente cai no padrão. */
export function parseDealerSort(raw) {
  const value = optionalString(raw);
  if (value == null) return DEALER_OPPORTUNITY_DEFAULT_SORT;

  if (!DEALER_OPPORTUNITY_SORTS.includes(value)) {
    throw invalidFilter("Ordenação inválida.", "sort");
  }
  return value;
}

/**
 * Cursor → `{ sort, key, id }`, ou `null` para "começa do início".
 *
 * Devolve `null` — nunca lança — em TODOS os casos de entrada estranha: base64
 * truncado, cursor de outra listagem, id não numérico, chave incoerente com o
 * tipo da ordenação, e cursor cuja ordenação não é a ordenação pedida agora.
 * Esse último é o que acontece quando alguém troca o seletor de ordem com uma
 * página já carregada: recomeçar do início é o que o usuário espera ver.
 */
export function decodeDealerCursor(raw, sort) {
  if (raw == null || String(raw).trim() === "") return null;

  const spec = DEALER_OPPORTUNITY_SORT_SPEC[sort];
  if (!spec) return null;

  try {
    const decoded = Buffer.from(String(raw), "base64url").toString("utf8");

    // `sort|key|id`. Os cortes usam o PRIMEIRO e o ÚLTIMO separador, e a chave é
    // o que está entre eles: assim uma chave que venha a conter "|" no futuro
    // não desloca o id silenciosamente.
    const first = decoded.indexOf("|");
    const last = decoded.lastIndexOf("|");
    if (first <= 0 || last <= first) return null;

    const cursorSort = decoded.slice(0, first);
    const key = decoded.slice(first + 1, last);
    const id = Number.parseInt(decoded.slice(last + 1), 10);

    if (cursorSort !== sort) return null;
    if (!Number.isInteger(id) || id <= 0) return null;

    if (spec.keyType === "numeric") {
      if (!/^-?\d+(?:\.\d+)?$/.test(key)) return null;
      return { sort, key, id };
    }

    if (Number.isNaN(Date.parse(key))) return null;
    return { sort, key, id };
  } catch {
    return null;
  }
}

/**
 * Inverso: última linha da página → cursor opaco.
 *
 * `null` quando a linha não tem a chave ou o id. Quem chama trata isso como "não
 * há próxima página" — um cursor incompleto faria a página seguinte recomeçar do
 * início e paginar para sempre.
 */
export function encodeDealerCursor(row, sort) {
  const spec = DEALER_OPPORTUNITY_SORT_SPEC[sort];
  if (!spec || row?.id == null) return null;

  // `spec.column` é `pi.<coluna>`; a linha devolvida pelo driver traz só o nome
  // da coluna. Derivar daqui (em vez de repetir o nome) mantém UM lugar onde a
  // ordenação e o cursor concordam sobre qual campo é a chave.
  const field = spec.column.split(".").pop();
  const rawKey = row[field];
  if (rawKey == null) return null;

  const key = rawKey instanceof Date ? rawKey.toISOString() : String(rawKey);
  return Buffer.from(`${sort}|${key}|${row.id}`, "utf8").toString("base64url");
}

/**
 * Query string → filtros normalizados do feed.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NÃO EXISTE AQUI, E POR QUÊ
 * ────────────────────────────────────────────────────────────────────────────
 * `city_id` — a omissão mais importante do arquivo. A cidade do lojista é
 * resolvida no servidor a partir da loja dele; aceitá-la como parâmetro daria ao
 * cliente o poder de listar a demanda privada de qualquer cidade trocando um
 * número na URL. A tela mostra a cidade como texto fixo, não como seletor.
 *
 * `fuel_type` — a referência visual traz "Combustível", e `purchase_intents` não
 * tem essa coluna. Um `<select>` de combustível que não filtra nada seria um
 * controle morto com aparência de funcional. O lugar dele é uma fase que
 * acrescente o campo à PROCURA, no formulário do comprador, antes da tela do
 * lojista.
 *
 * `year_min`/`year_max` — mesma razão: a procura não declara faixa de ano.
 */
export function parseDealerFeedFilters(rawQuery = {}) {
  const filters = {
    intentType: optionalEnum(rawQuery.intent_type, PURCHASE_INTENT_TYPES, {
      field: "intent_type",
      label: "tipo de procura",
    }),
    brandSlug: optionalBrandSlug(rawQuery.brand),
    bodyType: optionalNormalized(rawQuery.body_type, normalizeBodyTypeForStorage, {
      field: "body_type",
      label: "carroceria",
    }),
    transmission: optionalNormalized(rawQuery.transmission, normalizeTransmissionForStorage, {
      field: "transmission",
      label: "câmbio",
    }),
    purchaseTimeframe: optionalEnum(rawQuery.purchase_timeframe, PURCHASE_TIMEFRAMES, {
      field: "purchase_timeframe",
      label: "prazo de compra",
    }),
    budgetMin: optionalMoney(rawQuery.budget_min, {
      field: "budget_min",
      label: "orçamento mínimo",
    }),
    budgetMax: optionalMoney(rawQuery.budget_max, {
      field: "budget_max",
      label: "orçamento máximo",
    }),
  };

  // Faixa invertida é 400, e não uma troca silenciosa dos dois valores.
  // Reordenar por conta própria devolveria um conjunto que o usuário não pediu
  // sob um rótulo que ele digitou — o mesmo mal do filtro ignorado.
  if (filters.budgetMin != null && filters.budgetMax != null && filters.budgetMin > filters.budgetMax) {
    throw invalidFilter(
      "O orçamento mínimo não pode ser maior que o máximo.",
      "budget_min"
    );
  }

  return filters;
}
