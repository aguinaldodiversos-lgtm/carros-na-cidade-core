// Validação de entrada das procuras. Mesmo estilo de
// `notifications.validation.js`: um helper por campo, que NORMALIZA e devolve o
// valor pronto para o banco, ou lança AppError.
//
// O backend é a fonte de verdade. O formulário valida em paralelo só para dar
// resposta imediata ao usuário — nada do que chega aqui é assumido como já
// checado, inclusive porque a mesma rota atende o BFF e qualquer cliente com um
// token válido.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { canonicalBrandLabel, canonicalBrandSlug } from "../../shared/utils/slugify.js";
import { deriveCommercialModel } from "../../shared/vehicle/commercial-model.js";
import {
  normalizeBodyTypeForStorage,
  normalizeTransmissionForStorage,
} from "../ads/ads.storage-normalize.js";
import {
  PURCHASE_INTENT_LIMITS,
  PURCHASE_INTENT_PAGE,
  PURCHASE_INTENT_TYPE,
  PURCHASE_INTENT_TYPES,
  PURCHASE_TIMEFRAMES,
} from "./purchase-intents.constants.js";

const CODE = "PURCHASE_INTENT_INVALID_FIELD";

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function invalid(message, field) {
  return new AppError(message, 400, true, { code: CODE, field });
}

/** `intent_type`: allowlist fechada. */
export function validateIntentType(raw) {
  const value = asTrimmedString(raw);
  if (!PURCHASE_INTENT_TYPES.includes(value)) {
    throw invalid("Escolha o que você procura.", "intent_type");
  }
  return value;
}

/** `purchase_timeframe`: allowlist fechada. */
export function validateTimeframe(raw) {
  const value = asTrimmedString(raw);
  if (!PURCHASE_TIMEFRAMES.includes(value)) {
    throw invalid("Escolha quando pretende comprar.", "purchase_timeframe");
  }
  return value;
}

/**
 * `transmission`: obrigatório nos dois modos.
 *
 * Passa pelo normalizador dos anúncios, então o formulário pode mandar o rótulo
 * ("Automático", "Automatizado") e o que grava é sempre o slug canônico
 * ('automatico'). É o mesmo caminho que o anúncio percorre — se divergisse, uma
 * procura por "automatico" nunca casaria com um anúncio gravado por outra regra.
 */
export function validateTransmission(raw) {
  const slug = normalizeTransmissionForStorage(raw);
  if (!slug) {
    throw invalid("Escolha o câmbio.", "transmission");
  }
  return slug;
}

/** `body_type`: obrigatório apenas em 'open_category'. Mesmo normalizador dos anúncios. */
export function validateBodyType(raw) {
  const slug = normalizeBodyTypeForStorage(raw);
  if (!slug) {
    throw invalid("Escolha o tipo de carroceria.", "body_type");
  }
  return slug;
}

/**
 * `brand` → `{ brand, brandSlug }` canônicos.
 *
 * A FIPE devolve a marca com prefixo de grupo ("GM - Chevrolet",
 * "VW - VolksWagen"). `canonicalBrandLabel`/`canonicalBrandSlug` tiram o
 * prefixo e é o mesmo par que o resto do projeto usa em rota e agregação — usar
 * o valor cru aqui faria a procura por "GM - Chevrolet" não casar com o slug
 * "chevrolet" que a Fase 3 vai comparar.
 */
export function validateBrand(raw) {
  const value = asTrimmedString(raw);
  if (value === "") {
    throw invalid("Escolha a marca.", "brand");
  }
  if (value.length > PURCHASE_INTENT_LIMITS.BRAND_MAX) {
    throw invalid(
      `A marca pode ter no máximo ${PURCHASE_INTENT_LIMITS.BRAND_MAX} caracteres.`,
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
 * `model` → `{ model, modelSlug }` do MODELO COMERCIAL.
 *
 * Aceita tanto a descrição FIPE completa ("T-Cross 200 TSI 1.0 Flex 12V 5p
 * Aut.") quanto um rótulo já comercial ("T-Cross"), e devolve sempre o
 * comercial. Quem faz a redução é `deriveCommercialModel`, a MESMA função que
 * as páginas territoriais usam — não uma segunda heurística.
 *
 * Precisa da marca porque modelos de cabeça numérica dependem dela: "5 Luxury
 * 1.5 TB FWD" só vira "Omoda 5" quando a marca chega junto. Sem marca a função
 * devolve null de propósito, e aqui isso vira 400 em vez de uma linha com
 * modelo errado.
 */
export function validateModel(raw, { brand } = {}) {
  const value = asTrimmedString(raw);
  if (value === "") {
    throw invalid("Escolha o modelo.", "model");
  }
  if (value.length > PURCHASE_INTENT_LIMITS.MODEL_MAX) {
    throw invalid(
      `O modelo pode ter no máximo ${PURCHASE_INTENT_LIMITS.MODEL_MAX} caracteres.`,
      "model"
    );
  }

  const commercial = deriveCommercialModel(value, { brand });
  if (!commercial?.slug || !commercial?.label) {
    throw invalid("Modelo inválido.", "model");
  }

  return { model: commercial.label, modelSlug: commercial.slug };
}

/**
 * `max_price` → string decimal com 2 casas, pronta para NUMERIC(14,2).
 *
 * Aceita number e string (o JSON do formulário manda number; um cliente pode
 * mandar string). Devolve STRING e não Number de propósito: o driver `pg`
 * entrega NUMERIC como texto, então manter o valor em texto nas duas direções
 * evita que um float de ida e um texto de volta pareçam valores diferentes.
 *
 * Recusa notação científica e separador de milhar: "1e6" e "95.000" são
 * ambíguos o suficiente para que adivinhar a intenção seja pior do que pedir de
 * novo. O formulário já manda número puro.
 */
export function validateMaxPrice(raw) {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    throw invalid("Informe até quanto pretende pagar.", "max_price");
  }

  const asText = typeof raw === "number" ? String(raw) : asTrimmedString(raw);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(asText)) {
    throw invalid("Valor inválido. Use apenas números.", "max_price");
  }

  const numeric = Number(asText);
  if (!Number.isFinite(numeric) || numeric < PURCHASE_INTENT_LIMITS.MAX_PRICE_MIN) {
    throw invalid(
      `O orçamento mínimo é de R$ ${PURCHASE_INTENT_LIMITS.MAX_PRICE_MIN.toLocaleString("pt-BR")}.`,
      "max_price"
    );
  }
  if (numeric > PURCHASE_INTENT_LIMITS.MAX_PRICE_MAX) {
    throw invalid("Valor acima do máximo permitido.", "max_price");
  }

  return numeric.toFixed(2);
}

/**
 * `city_id` → inteiro positivo.
 *
 * A EXISTÊNCIA da cidade é conferida no service, com uma consulta ao catálogo:
 * validar formato aqui e existência lá mantém este arquivo sem I/O, do mesmo
 * jeito que `resolveCityIdForNewAdvertiser` faz na Fase 0.1.
 *
 * Não existe fallback nenhum — nem `users.city`, nem cookie territorial, nem
 * "primeira cidade da tabela". Ausência é 400, e é assim que precisa ser: a
 * cidade errada entrega a procura para a cidade errada.
 */
export function parseCityId(raw) {
  if (raw == null || String(raw).trim() === "") {
    throw invalid("Escolha a cidade.", "city_id");
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
 * 404 e não 400 pelo mesmo motivo do módulo de notificações: quem manda
 * `/purchase-intents/abc` está sondando, e "id inválido" confirma o formato da
 * chave. A string INTEIRA precisa ser dígitos — `Number.parseInt` sozinho leria
 * o prefixo de "12abc" e agiria sobre a procura 12.
 */
export function parsePurchaseIntentId(raw) {
  const asText = String(raw ?? "").trim();
  if (!/^\d+$/.test(asText)) {
    throw new AppError("Procura não encontrada.", 404);
  }

  const id = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError("Procura não encontrada.", 404);
  }
  return id;
}

/** `limit` da query → [1, MAX]. Ausente/absurdo → default. */
export function parseLimit(raw) {
  if (raw == null || String(raw).trim() === "") return PURCHASE_INTENT_PAGE.DEFAULT_LIMIT;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return PURCHASE_INTENT_PAGE.DEFAULT_LIMIT;
  return Math.min(parsed, PURCHASE_INTENT_PAGE.MAX_LIMIT);
}

/**
 * Cursor `"<createdAtISO>|<id>"` em base64url. Idêntico ao de notificações —
 * opaco para o cliente e tolerante a lixo (volta à primeira página em vez de
 * derrubar a listagem por causa de um link velho).
 *
 * @returns {{ createdAt: string, id: number }|null}
 */
export function decodeCursor(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  try {
    const decoded = Buffer.from(String(raw), "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) return null;

    const createdAt = decoded.slice(0, separator);
    const id = Number.parseInt(decoded.slice(separator + 1), 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;

    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Inverso de `decodeCursor`. */
export function encodeCursor(row) {
  if (!row?.created_at || row?.id == null) return null;
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return Buffer.from(`${createdAt}|${row.id}`, "utf8").toString("base64url");
}

/**
 * Valida o corpo inteiro de uma nova procura e devolve o registro NORMALIZADO,
 * já no formato das colunas.
 *
 * A forma é validada aqui e no CHECK do banco. Redundância proposital: o CHECK
 * protege contra qualquer caminho que não passe por esta função (script, SQL
 * manual, módulo futuro), e esta função dá a mensagem legível que o CHECK não
 * consegue dar.
 */
export function validateNewPurchaseIntent(input = {}) {
  const intentType = validateIntentType(input.intent_type);
  const transmission = validateTransmission(input.transmission);
  const maxPrice = validateMaxPrice(input.max_price);
  const purchaseTimeframe = validateTimeframe(input.purchase_timeframe);
  const cityId = parseCityId(input.city_id);

  if (intentType === PURCHASE_INTENT_TYPE.SPECIFIC_MODEL) {
    const { brand, brandSlug } = validateBrand(input.brand);
    // O modelo precisa da marca CRUA (com prefixo de grupo, se houver) para que
    // a derivação enxergue o mesmo texto que a FIPE entregou.
    const { model, modelSlug } = validateModel(input.model, { brand: input.brand });

    return {
      intentType,
      cityId,
      brand,
      brandSlug,
      model,
      modelSlug,
      bodyType: null,
      transmission,
      maxPrice,
      purchaseTimeframe,
    };
  }

  return {
    intentType,
    cityId,
    brand: null,
    brandSlug: null,
    model: null,
    modelSlug: null,
    bodyType: validateBodyType(input.body_type),
    transmission,
    maxPrice,
    purchaseTimeframe,
  };
}
