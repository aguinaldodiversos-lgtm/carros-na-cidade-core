// Compatibilidade entre uma PROCURA e um ANÚNCIO. Módulo PURO: sem I/O, sem
// logger, sem AppError. É a mesma função que decide o que aparece na lista do
// lojista e o que o POST aceita — e é por ser a mesma que o ataque de §58
// (trocar `ad_id` no request) não passa.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE O CASAMENTO NÃO É FEITO EM SQL
// ────────────────────────────────────────────────────────────────────────────
// `ads.model` guarda a DESCRIÇÃO FIPE inteira ("ONIX HATCH LT 1.0 12V Flex 5p
// Mec."), enquanto `purchase_intents.model_slug` guarda o MODELO COMERCIAL
// ("onix"). Um `WHERE ads.model = pi.model` não casaria nada, e um `LIKE
// '%onix%'` casaria "Onix" com "Onix Plus" e com qualquer texto que contivesse
// a sequência. A redução de um para o outro é `deriveCommercialModel`, que é
// JavaScript (mapa de overrides, compostos e heurística guardada) e não tem
// equivalente em SQL.
//
// Consequência aceita: o estoque ATIVO do lojista é lido e filtrado na
// aplicação. Para o volume desta fase (dezenas de anúncios por loja) o custo é
// irrelevante, e o ganho é ter UMA regra de compatibilidade em vez de duas
// versões — uma em SQL e outra em JS — que divergem no primeiro modelo novo.
//
// ────────────────────────────────────────────────────────────────────────────
// TAXONOMIA NORMALIZADA DOS DOIS LADOS
// ────────────────────────────────────────────────────────────────────────────
// Câmbio e carroceria do ANÚNCIO passam por `normalize*ForStorage` antes da
// comparação, mesmo já devendo estar canônicos na coluna. Em produção existe
// dado antigo gravado fora do padrão (auditoria de câmbio/carroceria,
// 2026-08-08): comparar cru faria um "Automático" acentuado de 2024 nunca casar
// com a procura por 'automatico'. Normalizar é o comportamento CORRETO, não uma
// concessão: é exatamente o mesmo caminho que o formulário da procura percorre
// (ver purchase-intents.validation.js).
//
// ────────────────────────────────────────────────────────────────────────────
// FAIL CLOSED
// ────────────────────────────────────────────────────────────────────────────
// Qualquer valor que não seja possível determinar com segurança recusa o
// anúncio. Modelo comercial indeterminável (`deriveCommercialModel` → null),
// câmbio ilegível, preço não numérico: tudo é "não elegível", nunca "deixa
// passar". Oferecer o carro errado para uma pessoa real é pior do que não
// oferecer nada.

import { commercialModelSlug } from "../../shared/vehicle/commercial-model.js";
import { canonicalBrandSlug } from "../../shared/utils/slugify.js";
import {
  normalizeBodyTypeForStorage,
  normalizeTransmissionForStorage,
} from "../ads/ads.storage-normalize.js";
import { BUDGET_RELATION } from "./purchase-intent-offers.constants.js";
import { PURCHASE_INTENT_TYPE } from "./purchase-intents.constants.js";

/** Número finito e não negativo, ou `null`. NUMERIC do `pg` chega como string. */
export function toPrice(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

/**
 * "Dentro" ou "acima" do orçamento. `null` quando algum dos lados não é
 * numérico — sem preço legível não existe classificação honesta a dar.
 */
export function budgetRelationOf(adPrice, maxPrice) {
  const price = toPrice(adPrice);
  const budget = toPrice(maxPrice);
  if (price == null || budget == null) return null;
  return price <= budget ? BUDGET_RELATION.WITHIN : BUDGET_RELATION.ABOVE;
}

/**
 * Compatibilidade de UM anúncio com UMA procura.
 *
 * @param {object} ad linha de `ads` (brand, model, transmission, body_type, price)
 * @param {object} intent linha de `purchase_intents` (intent_type, brand_slug,
 *   model_slug, body_type, transmission, max_price)
 * @returns {{ eligible: boolean, reason: string, budgetRelation: string|null }}
 *   `reason` é diagnóstico interno (log/teste) — nunca vai para o cliente, que
 *   receberia dela a pista de quais anúncios existem.
 */
export function evaluateAdForIntent(ad, intent) {
  const budgetRelation = budgetRelationOf(ad?.price, intent?.max_price);

  if (!ad || !intent) {
    return { eligible: false, reason: "missing_input", budgetRelation };
  }

  // Câmbio é RÍGIDO nos dois modos. Quem procura automático não dirige manual —
  // não é preferência de acabamento, é o carro servir ou não servir.
  const adTransmission = normalizeTransmissionForStorage(ad.transmission);
  if (!adTransmission || adTransmission !== intent.transmission) {
    return { eligible: false, reason: "transmission", budgetRelation };
  }

  if (intent.intent_type === PURCHASE_INTENT_TYPE.SPECIFIC_MODEL) {
    // Marca canônica: `ads.brand` pode vir com prefixo de grupo da FIPE
    // ("VW - VolksWagen"), e a procura guarda 'volkswagen'. É o mesmo par de
    // helpers que a validação da procura usa.
    const adBrandSlug = canonicalBrandSlug(ad.brand);
    if (!adBrandSlug || adBrandSlug !== intent.brand_slug) {
      return { eligible: false, reason: "brand", budgetRelation };
    }

    // Modelo COMERCIAL derivado da descrição FIPE. `""` quando a derivação não
    // é segura — e aí o anúncio fica de fora, em vez de virar um chute.
    const adModelSlug = commercialModelSlug(ad.model, { brand: ad.brand });
    if (!adModelSlug || adModelSlug !== intent.model_slug) {
      return { eligible: false, reason: "model", budgetRelation };
    }

    // Preço NÃO bloqueia aqui, de propósito. O comprador que já sabe qual carro
    // quer se beneficia de ver o que existe um pouco acima do teto que digitou —
    // e a classificação (`budgetRelation`) diz a ele qual é qual sem esconder
    // nada. Ver §24 da especificação da fase.
    return { eligible: true, reason: "match", budgetRelation };
  }

  if (intent.intent_type === PURCHASE_INTENT_TYPE.OPEN_CATEGORY) {
    const adBodyType = normalizeBodyTypeForStorage(ad.body_type);
    if (!adBodyType || adBodyType !== intent.body_type) {
      return { eligible: false, reason: "body_type", budgetRelation };
    }

    // Aqui o orçamento É rígido. Quem disse "um SUV automático até R$ 100.000"
    // não escolheu o carro — escolheu a faixa. Mandar um de R$ 130.000 seria
    // responder outra pergunta.
    if (budgetRelation !== BUDGET_RELATION.WITHIN) {
      return { eligible: false, reason: "price", budgetRelation };
    }

    return { eligible: true, reason: "match", budgetRelation };
  }

  return { eligible: false, reason: "unknown_intent_type", budgetRelation };
}

/** Conveniência booleana. */
export function isAdEligibleForIntent(ad, intent) {
  return evaluateAdForIntent(ad, intent).eligible;
}

/**
 * Ordem de apresentação da lista do lojista.
 *
 * 1. dentro do orçamento antes de acima — é o que o comprador pediu;
 * 2. preço crescente dentro de cada grupo;
 * 3. id decrescente como desempate ESTÁVEL.
 *
 * O terceiro critério não é decoração: sem ele, dois anúncios de mesmo preço
 * podem trocar de lugar entre dois carregamentos (a ordem que o Postgres
 * devolve não é garantida), e o lojista clicaria em "Enviar" no card errado.
 */
export function compareMatchingAds(a, b) {
  const aAbove = a.budget_relation === BUDGET_RELATION.ABOVE ? 1 : 0;
  const bAbove = b.budget_relation === BUDGET_RELATION.ABOVE ? 1 : 0;
  if (aAbove !== bAbove) return aAbove - bAbove;

  const aPrice = toPrice(a.price);
  const bPrice = toPrice(b.price);
  // Preço ilegível vai para o fim: não dá para ordenar por um valor que não
  // existe, e o card sem preço não é o que o lojista quer enviar primeiro.
  if (aPrice == null && bPrice == null) return Number(b.id) - Number(a.id);
  if (aPrice == null) return 1;
  if (bPrice == null) return -1;
  if (aPrice !== bPrice) return aPrice - bPrice;

  return Number(b.id) - Number(a.id);
}
