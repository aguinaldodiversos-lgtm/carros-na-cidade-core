/**
 * Service central de regras comerciais — Fase 2.1.
 *
 * Lê as 7 chaves `commercial.*` de `platform_settings` (criadas pela
 * migration 031) e devolve um objeto plano usado por hot-paths:
 *   - ads.publication-options (preço/dias do destaque exibido no card)
 *   - payments.service#createBoostCheckout (preço/dias cobrados + allowlist CPF/CNPJ)
 *   - account.service#getBoostOptions (lista de opções no dashboard)
 *
 * INVARIANTES DE PROJETO:
 *
 *   1. NUNCA quebra hot path. Se uma chave estiver ausente, valor inválido
 *      ou o banco indisponível, devolvemos o DEFAULT canônico — o mesmo
 *      que era hardcoded antes desta fase. Conta de produto não pode cair
 *      por um SELECT.
 *
 *   2. Cache implícito via `getSetting()` (60s TTL local ao processo —
 *      ver platform/settings.service.js#cache). Edição no admin via
 *      setSetting invalida a entry, então a próxima leitura vê o valor
 *      novo em poucos segundos.
 *
 *   3. Sem audit aqui. Quem AUDITA é admin-commercial-settings.service.js
 *      (caminho de WRITE). Este service é APENAS leitura.
 *
 *   4. Sem efeito colateral. Não dispara fetch para terceiros, não toca
 *      em payments, não persiste nada.
 *
 *   5. boost-7d é o ÚNICO produto de destaque autorizado/configurável hoje.
 *      Tem chaves dedicadas em platform_settings (migration 031) e é
 *      editável no admin comercial. boost-30d foi REMOVIDO da oferta: nunca
 *      teve chaves dedicadas (não era administrável) e não estava autorizado.
 *      Toda opção exibida ao usuário precisa partir de configuração
 *      administrativa real — por isso este service só expõe boost-7d.
 *      Reintroduzir boost-30d exigiria chaves próprias
 *      (commercial.boost_30d_price_cents/days) + decisão de produto.
 */

import { getSetting } from "../platform/settings.service.js";
import { logger } from "../../shared/logger.js";

// Keys canônicas — espelha admin-commercial-settings.service.js#KEYS.
// Manter alinhado quando uma nova chave commercial.* for adicionada.
const KEYS = Object.freeze({
  BOOST_PRICE_CENTS: "commercial.boost_default_price_cents",
  BOOST_DAYS: "commercial.boost_default_days",
  DUPLICATE_BEHAVIOR: "commercial.boost_duplicate_behavior",
  MAX_EXT_DAYS: "commercial.boost_max_extension_days",
  ALLOW_CPF: "commercial.allow_boost_cpf",
  ALLOW_CNPJ: "commercial.allow_boost_cnpj",
  PRO_AD_LIMIT: "commercial.pro_ad_limit_guard",
});

const DEFAULTS = Object.freeze({
  boost_default_price_cents: 3990,
  boost_default_days: 7,
  boost_duplicate_behavior: "extend_duration",
  boost_max_extension_days: 90,
  allow_boost_cpf: true,
  allow_boost_cnpj: true,
  pro_ad_limit_guard: 1000,
});

const DUPLICATE_BEHAVIORS = Object.freeze(["extend_duration", "replace", "block_duplicate"]);

/**
 * Única opção de destaque autorizada: boost-7d. Preço/dias vêm de
 * platform_settings (este service) e são editáveis no admin comercial.
 * boost-30d foi removido por não ter configuração administrativa real.
 */
export const BOOST_OPTIONS_FALLBACK = Object.freeze([
  Object.freeze({
    id: "boost-7d",
    days: 7,
    price: 39.9,
    label: "Destaque por 7 dias",
    description: "Prioridade alta nas buscas e badge de destaque por 7 dias.",
  }),
]);

function safeInt(raw, key, fallback, min, max) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  const n = Number(candidate);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (min !== undefined && n < min) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
}

function safeBool(raw, fallback) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  if (typeof candidate === "boolean") return candidate;
  if (candidate === "true") return true;
  if (candidate === "false") return false;
  return fallback;
}

function safeDuplicateBehavior(raw) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  if (typeof candidate === "string" && DUPLICATE_BEHAVIORS.includes(candidate)) {
    return candidate;
  }
  return DEFAULTS.boost_duplicate_behavior;
}

/**
 * Lê as 7 chaves em paralelo e devolve objeto plano.
 *
 * Cada chave caí em DEFAULTS se ausente/erro/range-inválido. NUNCA throw.
 *
 * @returns {Promise<{
 *   boost_default_price_cents: number,
 *   boost_default_days: number,
 *   boost_duplicate_behavior: 'extend_duration'|'replace'|'block_duplicate',
 *   boost_max_extension_days: number,
 *   allow_boost_cpf: boolean,
 *   allow_boost_cnpj: boolean,
 *   pro_ad_limit_guard: number,
 * }>}
 */
export async function getCommercialRules() {
  try {
    const [price, days, dup, maxExt, cpf, cnpj, proLimit] = await Promise.all([
      getSetting(KEYS.BOOST_PRICE_CENTS, DEFAULTS.boost_default_price_cents),
      getSetting(KEYS.BOOST_DAYS, DEFAULTS.boost_default_days),
      getSetting(KEYS.DUPLICATE_BEHAVIOR, DEFAULTS.boost_duplicate_behavior),
      getSetting(KEYS.MAX_EXT_DAYS, DEFAULTS.boost_max_extension_days),
      getSetting(KEYS.ALLOW_CPF, DEFAULTS.allow_boost_cpf),
      getSetting(KEYS.ALLOW_CNPJ, DEFAULTS.allow_boost_cnpj),
      getSetting(KEYS.PRO_AD_LIMIT, DEFAULTS.pro_ad_limit_guard),
    ]);

    return {
      boost_default_price_cents: safeInt(
        price,
        KEYS.BOOST_PRICE_CENTS,
        DEFAULTS.boost_default_price_cents,
        100,
        1000000
      ),
      boost_default_days: safeInt(
        days,
        KEYS.BOOST_DAYS,
        DEFAULTS.boost_default_days,
        1,
        365
      ),
      boost_duplicate_behavior: safeDuplicateBehavior(dup),
      boost_max_extension_days: safeInt(
        maxExt,
        KEYS.MAX_EXT_DAYS,
        DEFAULTS.boost_max_extension_days,
        7,
        365
      ),
      allow_boost_cpf: safeBool(cpf, DEFAULTS.allow_boost_cpf),
      allow_boost_cnpj: safeBool(cnpj, DEFAULTS.allow_boost_cnpj),
      pro_ad_limit_guard: safeInt(
        proLimit,
        KEYS.PRO_AD_LIMIT,
        DEFAULTS.pro_ad_limit_guard,
        100,
        100000
      ),
    };
  } catch (err) {
    logger.warn(
      { err: err?.message },
      "[commercial-rules] falha ao ler platform_settings — usando DEFAULTS"
    );
    return { ...DEFAULTS };
  }
}

/**
 * Devolve a lista canônica de boost options ([boost-7d]) com preço/dias
 * resolvidos via platform_settings — fonte única consumida pelo modal de
 * impulsionamento, pela página /impulsionar e pelo checkout.
 *
 * Só expõe produtos com configuração administrativa real. boost-30d não
 * tem chaves dedicadas e por isso NÃO é listado/vendido.
 *
 * Forma de cada item bate com BOOST_OPTIONS_FALLBACK (id/days/price/label/description).
 *
 * Usado por:
 *   - account.routes.js (GET /api/account/boost-options + dashboard)
 *   - payments.service.js#createBoostCheckout (mapeamento id → price/days)
 *   - ads.publication-options.service.js (price_cents/days do action boost_7d)
 */
export async function getBoostOptions() {
  const rules = await getCommercialRules();
  const boost7dDefault = BOOST_OPTIONS_FALLBACK.find((o) => o.id === "boost-7d");

  return [
    {
      ...boost7dDefault,
      days: rules.boost_default_days,
      price: rules.boost_default_price_cents / 100,
    },
  ];
}

/**
 * Atalho síncrono — retorna apenas os DEFAULTS estáticos sem hit no banco.
 * Para uso em fallback offline-safe (ex.: getDashboardPayload quando ainda
 * está montando emptyBoost antes de qualquer await). NÃO reflete edições
 * do admin.
 */
export function getBoostOptionsFallback() {
  return BOOST_OPTIONS_FALLBACK.map((o) => ({ ...o }));
}

/** Conjunto canônico de comportamentos aceitos. Exposto para validações. */
export { DUPLICATE_BEHAVIORS };
