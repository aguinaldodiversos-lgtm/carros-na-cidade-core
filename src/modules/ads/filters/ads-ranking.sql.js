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

/**
 * Camada comercial discreta (1–4) para ordenação determinística da listagem
 * pública. Política comercial alvo:
 *
 *   4 = Destaque ativo (highlight_until > NOW()) — pode ser de qualquer plano,
 *       inclusive Grátis com boost avulso (R$ 39,90/7d ou R$ 129,90/30d).
 *   3 = Lojista Pro                  — sp.priority_level >= 80
 *       Inclui: cnpj-store-pro (80), cnpj-evento-premium (100).
 *   2 = Lojista Start                — sp.priority_level >= 50
 *       Inclui: cnpj-store-start (60), cpf-premium-highlight (50).
 *   1 = Tudo o mais                  — Grátis CPF (0), Grátis CNPJ (5),
 *       plan_id NULL, qualquer plano legado não migrado.
 *
 * O ranking de relevância (relevance) usa esta camada como chave PRIMÁRIA do
 * ORDER BY (DESC) e empurra `hybrid_score` para tiebreaker — garantindo
 * Destaque > Pro > Start > Grátis em todas as bordas territoriais.
 *
 * Em busca textual (q), `text_rank` vira chave primária e `commercial_layer`
 * desce para tiebreaker — preserva intenção do visitante (regra "filtros e
 * texto não são atropelados por plano").
 *
 * Os limiares 50 e 80 mapeiam diretamente os priority_level seedados na
 * migration 020. Mudar o priority_level do plano em subscription_plans move
 * o plano de camada automaticamente — sem hardcode de plan_id aqui.
 *
 * Requer `LEFT JOIN subscription_plans sp ON sp.id = u.plan_id` na query
 * (mesmo JOIN que `planRankExpr` consome).
 */
export const commercialLayerExpr = `
  (CASE
    WHEN a.highlight_until > NOW() THEN 4
    WHEN COALESCE(sp.priority_level, 0) >= 80 THEN 3
    WHEN COALESCE(sp.priority_level, 0) >= 50 THEN 2
    ELSE 1
  END)
`;
