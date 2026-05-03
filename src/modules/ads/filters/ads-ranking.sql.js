/**
 * Componentes SQL do ranking híbrido (plano pago + destaque pago + demanda territorial).
 * Mantidos em um único lugar para alinhar com `subscription_plans` (account.service).
 */

/**
 * Peso do plano do dono do anúncio.
 *
 * Antes: lia `ads.plan` (snapshot na criação) — distorcia o ranking porque
 * usuários que pagavam um upgrade depois ficavam com o peso antigo gravado
 * em todos os anúncios já publicados.
 *
 * Agora: deriva em runtime via JOIN ads → advertisers → users → subscription_plans
 * usando `users.plan_id` (canônico, criado pela migration 020 e atualizado
 * em tempo real pelo webhook do Mercado Pago em payments.service.js).
 *
 * Requer que a query externa inclua:
 *   LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
 *   LEFT JOIN users u ON u.id = adv.user_id
 *   LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
 *
 * Quando `sp.priority_level` é null (plano não cadastrado, banco legado, ou
 * usuário sem plan_id), aplicamos um default neutro de 12.
 */
export const planRankExpr = `(COALESCE(sp.priority_level, 12) * 0.32)`;

/**
 * Demanda da cidade — requer `LEFT JOIN city_metrics cm ON cm.city_id = a.city_id` na query.
 */
export const cityDemandBoostExpr = `LEAST(48, COALESCE(cm.demand_score, 0) * 0.28)`;
