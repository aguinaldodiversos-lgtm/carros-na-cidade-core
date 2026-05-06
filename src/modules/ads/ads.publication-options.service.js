/**
 * Endpoint de opções de publicação de anúncio (Fase 4).
 *
 * Compõe o que a tela interna pós-revisão precisa pra decidir entre:
 *
 *   publish_free               — anúncio fica ativo no plano free
 *   publish_with_subscription  — anúncio fica ativo cobrindo pelo Start/Pro vivo
 *   boost_7d                   — destaque avulso R$ 39,90 sobre este ad_id
 *   subscribe_start / pro      — assinar Start ou Pro (sem sub viva)
 *   upgrade_to_pro             — Start ativo → migrar pra Pro (futuro)
 *
 * IMPORTANTE — preço NUNCA vem do request. Os valores em centavos
 * estão hardcoded aqui e batem com `subscription_plans.price` no
 * banco/fallback. Service base de checkout (`createPlanSubscription`,
 * `createBoostCheckout`) lê o preço real ao criar a preference no MP.
 *
 * Service NÃO inicia Mercado Pago. Apenas DESCREVE quais ações estão
 * disponíveis. Frontend (PublicationPlanSelector) lê e renderiza
 * BoostCheckoutButton / SubscriptionCheckoutButton conforme.
 */

import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  countActiveAdsByUser,
  getAccountUser,
  getOwnedAd,
  resolveCurrentPlan,
} from "../account/account.service.js";
import { findLiveSubscriptionForUser } from "../payments/subscriptions.guards.js";

/**
 * Preços oficiais em CENTAVOS — bate com a oferta de lançamento e
 * com `subscription_plans.price` (Start 79.90, Pro 149.90) e
 * BOOST_OPTIONS (boost-7d 39.90). Hardcoded aqui apenas para
 * exposição na UI; o cobrador real (createBoostCheckout /
 * createPlanSubscription) sempre lê do banco.
 */
const PRICE_CENTS = Object.freeze({
  boost_7d: 3990,
  subscribe_start: 7990,
  subscribe_pro: 14990,
});

const PLAN_ID = Object.freeze({
  start: "cnpj-store-start",
  pro: "cnpj-store-pro",
});

/**
 * Status do anúncio que admitem ações de publicação/destaque.
 * `deleted` e `blocked` são bloqueados — anúncio precisa ser
 * recuperado/desbloqueado por outro fluxo antes.
 */
const PUBLISHABLE_STATUSES = new Set(["active", "paused"]);

function isHighlightActive(highlightUntilIso) {
  if (!highlightUntilIso) return false;
  const ts = new Date(highlightUntilIso).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

/**
 * Compõe o payload de opções de publicação para um anúncio.
 *
 * @param {object} opts
 * @param {string|number} opts.userId  — DEVE ser dono do ad (404 senão)
 * @param {string|number} opts.adId
 *
 * @returns {Promise<object>} payload descrito em ads.routes (Fase 4)
 */
export async function getPublicationOptions({ userId, adId }) {
  // 1. Ownership: lança 404 se ad não pertence ao user.
  //    `getOwnedAd` JOIN advertisers e valida `adv.user_id = userId`.
  const ad = await getOwnedAd(userId, adId);

  // 2. Status publicável.
  if (!PUBLISHABLE_STATUSES.has(String(ad.status))) {
    throw new AppError(
      `Anuncio em status '${ad.status}' nao admite acoes de publicacao.`,
      410
    );
  }

  const user = await getAccountUser(userId);

  // 3. Plano atual + assinatura viva + anúncios ativos.
  const [currentPlan, liveSub, activeAdsCount] = await Promise.all([
    resolveCurrentPlan(user),
    findLiveSubscriptionForUser(userId),
    countActiveAdsByUser(userId),
  ]);

  const isOnLiveSubscription =
    liveSub && (liveSub.status === "active" || liveSub.status === "pending" || liveSub.status === "paused");
  const isOnActiveStart =
    isOnLiveSubscription && liveSub.status === "active" && liveSub.plan_id === PLAN_ID.start;
  const isOnActivePro =
    isOnLiveSubscription && liveSub.status === "active" && liveSub.plan_id === PLAN_ID.pro;

  // 4. Limite efetivo de anúncios.
  const planLimit = Number(currentPlan?.ad_limit ?? 0);
  const adLimit = {
    used: activeAdsCount,
    total: planLimit,
    available: Math.max(0, planLimit - activeAdsCount),
  };

  // 5. Eligibilidade (publish_free): respeita o mesmo cálculo do
  //    dashboard / pipeline de criação. Trava por tipo de conta:
  //      - CNPJ não-verificado: bloqueado (cnpj_verified=false)
  //      - CPF sem doc verificado e zero ads: bloqueado
  //      - Limite atingido: bloqueado
  let canPublishFree = true;
  let publishReason = "Limite disponivel no plano atual";

  if (user.type === "pending") {
    canPublishFree = false;
    publishReason = "Complete seu perfil com CPF ou CNPJ.";
  } else if (user.type === "CNPJ" && !user.cnpj_verified) {
    canPublishFree = false;
    publishReason = "CNPJ precisa estar verificado.";
  } else if (
    user.type === "CPF" &&
    !user.document_verified &&
    activeAdsCount === 0 &&
    !currentPlan
  ) {
    canPublishFree = false;
    publishReason = "Verifique seu CPF para publicar o primeiro anuncio.";
  } else if (planLimit > 0 && activeAdsCount >= planLimit) {
    canPublishFree = false;
    publishReason = "Limite de anuncios do plano atual atingido.";
  }

  // 6. Lista de ações.
  const actions = [];
  const highlightActive = isHighlightActive(ad.highlight_until);

  // Publicar grátis (no plano atual, seja free ou paid).
  // Sempre presente; `enabled` reflete eligibility + limite.
  // Usuário com sub ativa (Start/Pro) também usa este action — o
  // próprio plano já é o "subscription" e cobre.
  if (!isOnLiveSubscription) {
    actions.push({
      id: "publish_free",
      enabled: canPublishFree,
      reason: canPublishFree ? null : publishReason,
    });
  } else {
    // Sub ativa: ação canônica é "publicar usando assinatura".
    // Continua respeitando limite (Start: 20, Pro: trava operacional).
    actions.push({
      id: "publish_with_subscription",
      enabled: canPublishFree,
      plan_id: liveSub.plan_id,
      subscription_status: liveSub.status,
      reason: canPublishFree ? null : publishReason,
    });
  }

  // Boost 7 dias: disponível para CPF e CNPJ se anúncio em status
  // publicável. Preço FIXO no backend; frontend só mostra.
  actions.push({
    id: "boost_7d",
    enabled: true,
    ad_id: ad.id,
    price_cents: PRICE_CENTS.boost_7d,
    days: 7,
    already_active: highlightActive,
    highlight_until: ad.highlight_until || null,
    note: highlightActive
      ? "Comprar novamente prorroga o prazo (não troca)."
      : null,
  });

  // Assinatura Start/Pro: somente se user é CNPJ verificado E NÃO
  // tem sub viva (active/pending/paused). Não oferece duplicata
  // — alinhado a assertNoLiveSubscriptionFor no backend.
  const canOfferSubscription = user.type === "CNPJ" && user.cnpj_verified && !isOnLiveSubscription;
  if (canOfferSubscription) {
    actions.push({
      id: "subscribe_start",
      enabled: true,
      plan_id: PLAN_ID.start,
      price_cents: PRICE_CENTS.subscribe_start,
    });
    actions.push({
      id: "subscribe_pro",
      enabled: true,
      plan_id: PLAN_ID.pro,
      price_cents: PRICE_CENTS.subscribe_pro,
    });
  }

  // Upgrade Start → Pro: visível como entrada placeholder enquanto
  // não há fluxo direto de upgrade (Fase futura). Disabled aponta
  // que ainda exige cancelar Start e assinar Pro manual.
  if (isOnActiveStart) {
    actions.push({
      id: "upgrade_to_pro",
      enabled: false,
      plan_id: PLAN_ID.pro,
      reason: "Upgrade direto ainda nao disponivel — cancele o Start e assine o Pro.",
    });
  }

  // Pro ativo: nenhum CTA de subscribe é mostrado (silenciosamente
  // omitido — alinhado a "não oferecer duplicata"). isOnActivePro
  // não dispara nenhuma action específica além da publish_with_subscription.
  void isOnActivePro;

  return {
    ad: {
      id: ad.id,
      title: ad.title,
      status: ad.status,
      highlight_until: ad.highlight_until || null,
      highlight_active: highlightActive,
    },
    user: {
      id: user.id,
      type: user.type,
      cnpj_verified: Boolean(user.cnpj_verified),
      document_verified: Boolean(user.document_verified),
    },
    current_plan: currentPlan
      ? {
          id: currentPlan.id,
          name: currentPlan.name,
          ad_limit: currentPlan.ad_limit,
        }
      : null,
    active_subscription: isOnLiveSubscription
      ? {
          plan_id: liveSub.plan_id,
          status: liveSub.status,
        }
      : null,
    ad_limit: adLimit,
    eligibility: {
      can_publish_free: canPublishFree,
      reason: canPublishFree ? null : publishReason,
    },
    actions,
  };
}
