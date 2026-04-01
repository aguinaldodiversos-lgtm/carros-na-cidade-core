/**
 * CONSOLIDADO — a lógica de limite de anúncios foi unificada em:
 *   src/modules/account/account.service.js → resolvePublishEligibility()
 *
 * Esta função não é mais importada diretamente; mantida apenas para evitar
 * erros de import em código legado ainda não removido.
 *
 * Use: ensurePublishEligibility() de ads.publish.eligibility.service.js
 */
export { resolvePublishEligibility as checkAdLimit } from "../account/account.service.js";
