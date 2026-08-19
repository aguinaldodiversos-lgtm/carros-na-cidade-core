/**
 * Entrada do FEED do lojista: filtros, ordenação e cursor.
 *
 * Funções PURAS — nenhuma toca banco, env ou storage. A existência da cidade e a
 * elegibilidade da loja são decididas no service; aqui só se decide o que a
 * query string SIGNIFICA.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FILTRO COM VALOR DESCONHECIDO É 400, NÃO É IGNORADO
 * ────────────────────────────────────────────────────────────────────────────
 * A paginação deste projeto é deliberadamente tolerante: `?limit=abc` cai no
 * default em vez de derrubar a listagem, porque limite é detalhe de transporte.
 * FILTRO é o contrário, e a diferença é comercial.
 *
 * Um `?auction_history=nao` (em português, fora do vocabulário) ignorado em
 * silêncio devolve o feed INTEIRO — inclusive os carros com passagem por leilão
 * — sob um cabeçalho que diz "sem passagem por leilão". O lojista faria proposta
 * em cima de uma promessa que a resposta não cumpriu.
 *
 * Recusar alto custa um erro legível; aceitar em silêncio custa uma proposta
 * errada. O vocabulário é imposto por CHECK no banco (migration 054), então ele
 * não encolhe sem migration — um link salvo continua válido enquanto o valor
 * existir.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O CURSOR DESTE FEED NÃO É O DE `shared/pagination/cursor.js`
 * ────────────────────────────────────────────────────────────────────────────
 * O codec compartilhado carrega uma TUPLA (timestamp, id) e valida a primeira
 * metade com `Date.parse`. Isso é correto para toda listagem ordenada por
 * `created_at` — e é exatamente por isso que ele não serve aqui.
 *
 * Este feed ordena também por `year` e por `mileage`, e a chave do cursor passa
 * a ser um INTEIRO:
 *
 *   `Date.parse("2019")`  → VÁLIDO (o ano 2019 vira uma data)   ← corrompe
 *   `Date.parse("45000")` → NaN, o cursor é descartado          ← perde a página
 *
 * Os dois modos de falha são silenciosos: o primeiro pagina a partir de uma data
 * inventada, o segundo devolve a primeira página para sempre e produz scroll
 * infinito. Um codec que conhece o TIPO da chave resolve os dois, e é o que está
 * abaixo.
 *
 * O que foi preservado do codec compartilhado, porque é o que importa: cursor
 * OPACO (base64url), comparação por TUPLA e tolerância a lixo — entrada
 * inválida devolve `null` e a listagem começa do início, em vez de 400 numa tela
 * que a pessoa só queria abrir.
 *
 * O cursor carrega o NOME DA ORDENAÇÃO junto. Sem isso, trocar de ordenação com
 * um cursor na mão compararia uma quilometragem com um `created_at` — o
 * PostgreSQL recusaria com erro de tipo, e o feed viraria 500 num caminho que o
 * usuário alcança clicando em dois controles na ordem errada.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { parseLimit as sharedParseLimit } from "../../shared/pagination/cursor.js";
import {
  normalizeFuelTypeForStorage,
  normalizeTransmissionForStorage,
} from "../ads/ads.storage-normalize.js";
import {
  CAUTION_REPORT_STATUSES,
  DECLARED_CONDITIONS,
  SALE_REQUEST_LIMITS,
  TIRE_CONDITIONS,
  YES_NO_UNKNOWN_VALUES,
  maxModelYear,
} from "./sale-requests.constants.js";
import {
  SALE_OPPORTUNITY_CODE,
  SALE_OPPORTUNITY_DEFAULT_SORT,
  SALE_OPPORTUNITY_FILTER_LIMITS,
  SALE_OPPORTUNITY_OFFER_LIMITS,
  SALE_OPPORTUNITY_PAGE,
  SALE_OPPORTUNITY_SORT_SPEC,
  SALE_OPPORTUNITY_SORTS,
} from "./sale-requests.dealer.constants.js";

function invalidFilter(message, field) {
  return new AppError(message, 400, true, {
    code: SALE_OPPORTUNITY_CODE.INVALID_FILTER,
    field,
  });
}

/** Ausente = `null`. `""` e `"   "` também: um filtro em branco não é um filtro. */
function optionalString(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/**
 * Valor opcional dentro de uma allowlist fechada.
 *
 * Comparação por igualdade estrita contra o vocabulário que os CHECKs da
 * migration 054 impõem. Sem `toLowerCase()` e sem sinônimos: normalizar aqui
 * aceitaria uma grafia que nenhum caminho de escrita produz, e o filtro casaria
 * zero linhas enquanto parece estar funcionando.
 */
function optionalEnum(raw, allowed, { field, label }) {
  const value = optionalString(raw);
  if (value == null) return null;

  if (!allowed.includes(value)) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }
  return value;
}

/** Slug opcional (marca/modelo). Formato conservador: o que `slugify` produz. */
function optionalSlug(raw, { field, label }) {
  const value = optionalString(raw);
  if (value == null) return null;

  if (value.length > SALE_OPPORTUNITY_FILTER_LIMITS.SLUG_MAX) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }
  return value;
}

/** Inteiro opcional dentro de uma faixa fechada. */
function optionalInteger(raw, { field, label, min, max }) {
  const value = optionalString(raw);
  if (value == null) return null;

  if (!/^\d+$/.test(value)) {
    throw invalidFilter(`Filtro de ${label} inválido.`, field);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw invalidFilter(`Filtro de ${label} fora da faixa aceita.`, field);
  }
  return parsed;
}

/**
 * Câmbio/combustível passam pelo MESMO normalizador da publicação.
 *
 * `?transmission=Automático` e `?transmission=automatico` precisam casar a mesma
 * coluna, porque é o normalizador que decidiu o que foi GRAVADO. Uma comparação
 * crua aqui faria o filtro vindo de um link com acento devolver lista vazia.
 *
 * Valor que o normalizador não reconhece é 400 — não `null` — pela mesma razão
 * dos enums: um filtro que não filtra é pior do que um filtro que recusa.
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

/** `sort` → uma das ordenações suportadas. Ausente cai no padrão. */
export function parseSort(raw) {
  const value = optionalString(raw);
  if (value == null) return SALE_OPPORTUNITY_DEFAULT_SORT;

  if (!SALE_OPPORTUNITY_SORTS.includes(value)) {
    throw invalidFilter("Ordenação inválida.", "sort");
  }
  return value;
}

/** `limit` → inteiro em [1, MAX]. Tolerante, como o resto do projeto. */
export function parseLimit(raw) {
  return sharedParseLimit(raw, {
    defaultLimit: SALE_OPPORTUNITY_PAGE.DEFAULT_LIMIT,
    maxLimit: SALE_OPPORTUNITY_PAGE.MAX_LIMIT,
  });
}

/**
 * Cursor → `{ sort, key, id }`, ou `null` para "começa do início".
 *
 * Devolve `null` — nunca lança — em TODOS os casos de entrada estranha: base64
 * truncado, cursor de outra listagem, id não numérico, chave incoerente com o
 * tipo da ordenação, e cursor cuja ordenação não é a ordenação pedida agora.
 * Esse último caso é o que acontece quando alguém troca o seletor de ordem com
 * uma página já carregada: recomeçar do início é o que o usuário espera ver.
 */
export function decodeCursor(raw, sort) {
  if (raw == null || String(raw).trim() === "") return null;

  const spec = SALE_OPPORTUNITY_SORT_SPEC[sort];
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

    if (spec.keyType === "integer") {
      if (!/^-?\d+$/.test(key)) return null;
      return { sort, key: Number.parseInt(key, 10), id };
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
export function encodeCursor(row, sort) {
  const spec = SALE_OPPORTUNITY_SORT_SPEC[sort];
  if (!spec || row?.id == null) return null;

  // `spec.column` é `sr.<coluna>`; a linha devolvida pelo driver traz só o nome
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
 * NÃO existe `city_id` aqui, e é a omissão mais importante do arquivo. A cidade
 * do lojista é resolvida no servidor a partir da loja dele
 * (`resolveDealerStore`); aceitá-la como parâmetro daria ao cliente o poder de
 * listar a demanda privada de qualquer cidade trocando um número na URL.
 *
 * Também não existe filtro de PREÇO PEDIDO: uma solicitação de venda não tem
 * preço. A FIPE é referência de mercado, não pedido do vendedor, e oferecer um
 * filtro de "faixa de preço" faria o lojista acreditar no contrário.
 */
export function parseFeedFilters(rawQuery = {}, { now = new Date() } = {}) {
  const yearCeiling = maxModelYear(now);

  const filters = {
    brandSlug: optionalSlug(rawQuery.brand, { field: "brand", label: "marca" }),
    modelSlug: optionalSlug(rawQuery.model, { field: "model", label: "modelo" }),

    yearMin: optionalInteger(rawQuery.year_min, {
      field: "year_min",
      label: "ano mínimo",
      min: SALE_REQUEST_LIMITS.YEAR_MIN,
      max: yearCeiling,
    }),
    yearMax: optionalInteger(rawQuery.year_max, {
      field: "year_max",
      label: "ano máximo",
      min: SALE_REQUEST_LIMITS.YEAR_MIN,
      max: yearCeiling,
    }),

    mileageMax: optionalInteger(rawQuery.mileage_max, {
      field: "mileage_max",
      label: "quilometragem",
      min: 0,
      max: SALE_REQUEST_LIMITS.MILEAGE_MAX,
    }),

    transmission: optionalNormalized(rawQuery.transmission, normalizeTransmissionForStorage, {
      field: "transmission",
      label: "câmbio",
    }),
    fuelType: optionalNormalized(rawQuery.fuel_type, normalizeFuelTypeForStorage, {
      field: "fuel_type",
      label: "combustível",
    }),

    declaredCondition: optionalEnum(rawQuery.declared_condition, DECLARED_CONDITIONS, {
      field: "declared_condition",
      label: "estado geral",
    }),
    tireCondition: optionalEnum(rawQuery.tire_condition, TIRE_CONDITIONS, {
      field: "tire_condition",
      label: "pneus",
    }),
    cautionReportStatus: optionalEnum(rawQuery.caution_report_status, CAUTION_REPORT_STATUSES, {
      field: "caution_report_status",
      label: "laudo cautelar",
    }),
    // `auction_history` e `financing_status` compartilham o vocabulário
    // yes/no/unknown — o mesmo que os CHECKs da 054 impõem às duas colunas.
    auctionHistory: optionalEnum(rawQuery.auction_history, YES_NO_UNKNOWN_VALUES, {
      field: "auction_history",
      label: "passagem por leilão",
    }),
    financingStatus: optionalEnum(rawQuery.financing_status, YES_NO_UNKNOWN_VALUES, {
      field: "financing_status",
      label: "financiamento",
    }),
  };

  // Faixa invertida é erro de ENTRADA, não faixa vazia. Devolver zero resultados
  // faria o lojista concluir que a cidade não tem carro entre 2020 e 2015 —
  // quando o que houve foi um campo trocado de lugar.
  if (filters.yearMin != null && filters.yearMax != null && filters.yearMin > filters.yearMax) {
    throw invalidFilter("O ano mínimo não pode ser maior que o ano máximo.", "year_min");
  }

  return filters;
}

// ============================================================================
// PROPOSTAS
// ============================================================================

/**
 * Valor monetário → CENTAVOS INTEIROS.
 *
 * Toda comparação de dinheiro deste módulo acontece em centavos, e nunca sobre
 * `Number("50000.00")`. O motivo não é teórico: a regra da fase é "a nova
 * proposta precisa SUPERAR a maior atual", e ela é decidida por um `>`. Em ponto
 * flutuante binário, dois valores que representam a mesma quantia podem
 * comparar como diferentes — e o lado errado desse `>` aceita um lance que
 * deveria ser recusado, ou recusa um legítimo, num caminho onde há dinheiro em
 * disputa.
 *
 * Inteiro de centavos é exato para toda a faixa que o CHECK do banco permite.
 *
 * @param {string|number|null} raw — "50000.00" (como o driver devolve) ou 50000
 * @returns {number|null} centavos, ou `null` quando não há valor
 */
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
 * Corpo do POST de proposta → `{ amount, note }` normalizados.
 *
 * `advertiser_id` e `dealer_user_id` NÃO são lidos daqui, e nem poderiam: o
 * corpo carrega o QUANTO; o QUEM é do servidor. Um cliente que os enviasse veria
 * os campos serem ignorados — não existe caminho de leitura para eles.
 *
 * O valor chega em REAIS ("52000" ou "52000.00"), não em centavos: é o que o
 * formulário digita e o que o banco guarda. A conversão para centavos acontece
 * na comparação, não no transporte.
 */
export function validateOfferInput(body = {}) {
  const rawAmount = body.amount;

  if (rawAmount == null || String(rawAmount).trim() === "") {
    throw new AppError("Informe o valor da proposta.", 400, true, {
      code: SALE_OPPORTUNITY_CODE.INVALID_AMOUNT,
      field: "amount",
    });
  }

  const text = typeof rawAmount === "number" ? rawAmount.toFixed(2) : String(rawAmount).trim();

  // Formato antes de faixa: "50.000,00", "R$ 50000" e "-1" precisam de uma
  // mensagem sobre a FORMA, não sobre o valor. O cliente normaliza para dígitos
  // e ponto antes de enviar; isto é a rede de segurança de quem fala HTTP direto.
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) {
    throw new AppError("Valor da proposta inválido. Use apenas números.", 400, true, {
      code: SALE_OPPORTUNITY_CODE.INVALID_AMOUNT,
      field: "amount",
    });
  }

  const cents = toCents(text);
  if (cents == null || cents <= 0) {
    throw new AppError("A proposta precisa ser maior que zero.", 400, true, {
      code: SALE_OPPORTUNITY_CODE.INVALID_AMOUNT,
      field: "amount",
    });
  }

  if (cents > SALE_OPPORTUNITY_OFFER_LIMITS.MAX_AMOUNT_CENTS) {
    throw new AppError("Valor da proposta acima do máximo permitido.", 400, true, {
      code: SALE_OPPORTUNITY_CODE.INVALID_AMOUNT,
      field: "amount",
    });
  }

  // Texto com 2 casas nas duas direções: o driver `pg` devolve NUMERIC como
  // string, e manter o valor em texto na ida evita que um float de ida e um
  // texto de volta pareçam valores diferentes. Mesma disciplina de
  // `validateMoney` e de `fipeReferenceValue`.
  const amount = (cents / 100).toFixed(2);

  return { amount, amountCents: cents, note: validateOfferNote(body.note) };
}

/**
 * Observação da proposta — opcional, curta, e NÃO é conversa.
 *
 * String vazia vira `null` e não `""`: um campo opcional tem UM jeito de estar
 * ausente. Sem isso, metade das linhas teria NULL e a outra metade string
 * vazia, e todo `IS NULL` futuro erraria em metade dos casos. Mesma regra de
 * `known_issues`.
 */
export function validateOfferNote(raw) {
  if (raw == null) return null;

  const value = String(raw).trim();
  if (value === "") return null;

  if (value.length > SALE_OPPORTUNITY_OFFER_LIMITS.NOTE_MAX) {
    throw new AppError(
      `A observação pode ter no máximo ${SALE_OPPORTUNITY_OFFER_LIMITS.NOTE_MAX} caracteres.`,
      400,
      true,
      { code: SALE_OPPORTUNITY_CODE.INVALID_NOTE, field: "note" }
    );
  }

  return value;
}
