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

/**
 * Pontos de boost para anúncios da cidade-base num filtro multi-cidade.
 *
 * Calibração:
 *   - Maior que os tiebreakers típicos do hybrid_score dentro de uma camada
 *     (planRank 0–32, cityDemandBoost 0–48, recency 0–28). Garante que a
 *     cidade-base vence empate entre Pro-base vs Pro-vizinha em caso médio.
 *   - Menor que priority*10 (admin override que pode chegar a 990) e que
 *     leads*2 (que pode chegar a centenas em anúncios virais). Isso é
 *     intencional: anúncio vizinho com qualidade real comprovada (muitos
 *     leads) ainda pode superar cidade-base — esperado, não inversão.
 *   - MUITO menor que o salto entre camadas comerciais (commercial_layer
 *     DESC é a chave PRIMÁRIA do ORDER BY; nenhum boost aqui pode flipar
 *     Destaque > Pro > Start > Grátis).
 *
 * Em prod, ajustar este valor isoladamente é seguro; o ranking continua
 * sob controle do commercial_layer DESC.
 */
export const BASE_CITY_BOOST_POINTS = 60;

/**
 * Boost intra-camada para anúncios cuja cidade é a "cidade-base" do filtro
 * multi-cidade (city_slugs[0] por convenção).
 *
 * USO RESTRITO:
 *   - Só faz sentido quando city_slugs.length > 1 (múltiplas cidades). Com
 *     1 cidade, não há "vizinha" — o boost não tem alvo.
 *   - Deve ser somado ao hybrid_score (NÃO ao commercial_layer, sob risco
 *     de inverter a hierarquia comercial alvo).
 *
 * SEGURANÇA:
 *   - O caller passa o slug da cidade-base como parâmetro SQL preparado.
 *     Nunca aceitar `base_city_id` ou `base_city_slug` do query string
 *     público — a base é sempre derivada de city_slugs[0] internamente
 *     pelo builder. Ver `ads-filter.builder.js` + comentário em
 *     `normalizeTerritoryFilters` (parser).
 *
 * Quando o caller não está em modo multi-cidade, o builder injeta `0` no
 * lugar deste fragmento (no-op no hybrid_score).
 */
export function baseCityBoostExpr(baseSlugParamIdx) {
  if (!Number.isInteger(baseSlugParamIdx) || baseSlugParamIdx < 1) {
    throw new Error("baseCityBoostExpr: baseSlugParamIdx deve ser inteiro >= 1.");
  }
  return `(CASE WHEN c.slug = $${baseSlugParamIdx} THEN ${BASE_CITY_BOOST_POINTS} ELSE 0 END)`;
}
