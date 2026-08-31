// Constantes do domínio de procuras (Fase 2 — Compradores ativos).
// Espelho no frontend: frontend/lib/purchase-intents/api.ts — manter em sincronia.
//
// Este módulo NÃO redefine taxonomia de veículo. Câmbio e carroceria vêm de
// `src/modules/ads/ads.canonical.constants.js`, que é a fonte única já usada
// pelos anúncios. Uma segunda lista aqui divergiria da primeira no dia em que
// alguém adicionasse um valor num lado só — e a Fase 3 vai justamente comparar
// procura com anúncio, então os dois precisam falar o mesmo vocabulário.

import {
  CANONICAL_BODY_TYPE_SLUGS,
  CANONICAL_TRANSMISSION_SLUGS,
} from "../ads/ads.canonical.constants.js";

/**
 * Os dois modos de procura.
 *
 * `specific_model` — "Já sei qual carro quero": marca + modelo + câmbio.
 * `open_category`  — "Quero receber opções": carroceria + câmbio.
 *
 * TEXT com CHECK no banco, não ENUM do Postgres: um ENUM exige ALTER TYPE para
 * crescer e trava a ordem dos valores; o CHECK dá a mesma garantia e é trocável
 * numa migration comum.
 */
export const PURCHASE_INTENT_TYPE = Object.freeze({
  SPECIFIC_MODEL: "specific_model",
  OPEN_CATEGORY: "open_category",
});

export const PURCHASE_INTENT_TYPES = Object.freeze(Object.values(PURCHASE_INTENT_TYPE));

/**
 * Status do MVP. Só dois.
 *
 * Não existe `draft`, `negotiating`, `purchased` nem `expired`: expiração é
 * derivada de `expires_at`, não persistida — persistir exigiria alguém para
 * escrever a transição, ou seja, o cron que esta fase decidiu não ter.
 */
export const PURCHASE_INTENT_STATUS = Object.freeze({
  ACTIVE: "active",
  CLOSED: "closed",
});

export const PURCHASE_INTENT_STATUSES = Object.freeze(Object.values(PURCHASE_INTENT_STATUS));

/**
 * Prazo de compra declarado. Lista curta e fechada de propósito: campo livre
 * aqui viraria texto para moderar e não serviria para nenhum filtro.
 */
export const PURCHASE_TIMEFRAME = Object.freeze({
  ASAP: "as_soon_as_possible",
  WITHIN_7_DAYS: "within_7_days",
  WITHIN_30_DAYS: "within_30_days",
});

export const PURCHASE_TIMEFRAMES = Object.freeze(Object.values(PURCHASE_TIMEFRAME));

/** Rótulos pt-BR. Espelhados no frontend; usados também no corpo da notificação. */
export const PURCHASE_TIMEFRAME_LABEL = Object.freeze({
  [PURCHASE_TIMEFRAME.ASAP]: "O quanto antes",
  [PURCHASE_TIMEFRAME.WITHIN_7_DAYS]: "Em até 7 dias",
  [PURCHASE_TIMEFRAME.WITHIN_30_DAYS]: "Em até 30 dias",
});

/** Vocabulário canônico de veículo, reexportado para não duplicar a lista. */
export const PURCHASE_INTENT_TRANSMISSIONS = CANONICAL_TRANSMISSION_SLUGS;
export const PURCHASE_INTENT_BODY_TYPES = CANONICAL_BODY_TYPE_SLUGS;

/**
 * Rótulos de exibição. Os slugs armazenados NÃO têm acento
 * ('automatico', 'sedan', 'coupe'); o acento existe só na camada de texto.
 */
export const TRANSMISSION_LABEL = Object.freeze({
  automatico: "Automático",
  manual: "Manual",
  cvt: "CVT",
});

export const BODY_TYPE_LABEL = Object.freeze({
  hatch: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  picape: "Picape",
  coupe: "Coupé",
  minivan: "Minivan",
  wagon: "Perua",
});

/** Janela de vida da procura. `expires_at = created_at + 30 dias`. */
export const PURCHASE_INTENT_ACTIVE_DAYS = 30;

/** Paginação. Mesmo formato de `NOTIFICATION_PAGE`. */
export const PURCHASE_INTENT_PAGE = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
});

/**
 * Limites de entrada.
 *
 * `MAX_PRICE_MIN` não é burocracia: sem piso, quem digita "95" querendo
 * "95.000" publica uma procura de noventa e cinco reais e nunca entende por que
 * nenhuma loja responde. Mil reais é baixo o bastante para não recusar carro
 * barato nenhum e alto o bastante para pegar o erro de unidade.
 */
export const PURCHASE_INTENT_LIMITS = Object.freeze({
  BRAND_MAX: 80,
  MODEL_MAX: 120,
  MAX_PRICE_MIN: 1000,
  MAX_PRICE_MAX: 9999999.99,
});

// ════════════════════════════════════════════════════════════════════════════
// FEED DO LOJISTA — ORDENAÇÃO (Fase 4.11C)
// ════════════════════════════════════════════════════════════════════════════
//
// Até aqui a listagem do lojista tinha UMA ordem fixa (`created_at DESC`) e
// nenhum filtro. A tela nova oferece as duas coisas, e as duas precisam ser
// resolvidas no SERVIDOR: ordenar ou filtrar apenas os cards já carregados
// produziria uma ordem que mente sobre o conjunto — "maior orçamento" mostraria
// o maior da PRIMEIRA página, não da cidade.

export const DEALER_OPPORTUNITY_SORT = Object.freeze({
  RECENT: "recent",
  OLDEST: "oldest",
  BUDGET_DESC: "budget_desc",
  BUDGET_ASC: "budget_asc",
});

export const DEALER_OPPORTUNITY_SORTS = Object.freeze(Object.values(DEALER_OPPORTUNITY_SORT));

/**
 * Espelho de `SALE_OPPORTUNITY_SORT_SPEC` (Produto 2) — mesmo formato de
 * propósito, porque o problema é o mesmo e a solução já foi revisada uma vez.
 *
 * Objeto CONGELADO: é o único ponto em que texto entra no `ORDER BY`. Um valor
 * fora deste mapa nunca chega a ser interpolado — o repository lança antes.
 *
 * `keyType` existe por causa do cursor: a chave de tempo precisa de
 * `::timestamptz` dentro da comparação de tupla (o driver manda a string ISO
 * como `text` e o Postgres não tem de onde inferir o tipo), e a de dinheiro
 * precisa de `::numeric` pelo mesmo motivo. Sem o cast a paginação quebra na
 * SEGUNDA página — a primeira não tem cursor, então o defeito passa
 * despercebido por qualquer teste que só abra a tela.
 */
export const DEALER_OPPORTUNITY_SORT_SPEC = Object.freeze({
  [DEALER_OPPORTUNITY_SORT.RECENT]: Object.freeze({
    column: "pi.created_at",
    direction: "DESC",
    keyType: "timestamptz",
    key: "created_at",
  }),
  [DEALER_OPPORTUNITY_SORT.OLDEST]: Object.freeze({
    column: "pi.created_at",
    direction: "ASC",
    keyType: "timestamptz",
    key: "created_at",
  }),
  [DEALER_OPPORTUNITY_SORT.BUDGET_DESC]: Object.freeze({
    column: "pi.max_price",
    direction: "DESC",
    keyType: "numeric",
    key: "max_price",
  }),
  [DEALER_OPPORTUNITY_SORT.BUDGET_ASC]: Object.freeze({
    column: "pi.max_price",
    direction: "ASC",
    keyType: "numeric",
    key: "max_price",
  }),
});
