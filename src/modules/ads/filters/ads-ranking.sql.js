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
 *
 * PAPEL (pós-039): `priority_level` NÃO define mais a CAMADA comercial — isso
 * agora é `subscription_plans.weight` (ver `commercialLayerExpr`). Aqui,
 * `priority_level` é apenas DESEMPATE FINO dentro da mesma camada (compõe o
 * `hybrid_score`). Resumo: weight = camada; priority_level = desempate intra-camada.
 */
export const planRankExpr = `(COALESCE(sp.priority_level, 12) * 0.32)`;

/**
 * Demanda da cidade — requer `LEFT JOIN city_metrics cm ON cm.city_id = a.city_id` na query.
 */
export const cityDemandBoostExpr = `LEAST(48, COALESCE(cm.demand_score, 0) * 0.28)`;

/**
 * Peso reservado do DESTAQUE pago (boost). É o TOPO da camada comercial e é
 * FIXO — âncora estável de produção. NUNCA muda para acomodar planos novos:
 * planos vivem estritamente abaixo dele (0 < weight < 4).
 */
export const BOOST_LAYER_WEIGHT = 4;

/**
 * Camada comercial para ordenação determinística da listagem pública —
 * DATA-DRIVEN via `subscription_plans.weight` (NUMERIC, pós-039).
 *
 * Fórmula:
 *   GREATEST( destaque_ativo ? BOOST_LAYER_WEIGHT : 0 , COALESCE(sp.weight, 1) )
 *
 * Pesos canônicos:
 *   Grátis = 1, Start = 2, Pro = 3  (subscription_plans.weight)
 *   Boost/Destaque ativo = 4        (BOOST_LAYER_WEIGHT, reservado, topo pago)
 *
 * Planos ocupam a faixa 0 < weight < 4. Para encaixar um plano ENTRE dois
 * existentes, use decimal (ex.: 3.5 fica ESTRITAMENTE entre Pro=3 e boost=4)
 * SEM alterar nenhum outro peso. `COALESCE(sp.weight, 1)` é o PISO: plano nulo/
 * legado cai em 1 (nunca 0 — o sistema assume piso 1).
 *
 * Como o peso vira camada: mudar `subscription_plans.weight` (pelo admin) move
 * o plano na ordenação automaticamente — sem tocar código nem limiares. O
 * campo `priority_level` NÃO define mais camada (só desempate intra-camada no
 * hybrid_score — ver `planRankExpr`).
 *
 * Decisão de produto: no máx. 3 planos ativos; um 4º plano só se justificado
 * por ferramenta nova, encaixado por peso decimal.
 *
 * Comportamento preservado: com os pesos atuais (1/2/3 + boost 4), a ordenação
 * é IDÊNTICA à anterior (Destaque > Pro > Start > Grátis).
 *
 * O ranking de relevância usa esta camada como chave PRIMÁRIA do ORDER BY
 * (DESC), com `hybrid_score` como tiebreaker. Em busca textual (q), `text_rank`
 * vira chave primária e a camada desce para tiebreaker.
 *
 * Requer `LEFT JOIN subscription_plans sp ON sp.id = u.plan_id` na query
 * (mesmo JOIN que `planRankExpr` consome).
 */
export const commercialLayerExpr = `
  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN ${BOOST_LAYER_WEIGHT} ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
`;

/**
 * Espelho em JS de `commercialLayerExpr` (mesma fórmula). Mantido em sincronia
 * pelo teste estrutural. Útil para provar ordenação decimal sem tocar o banco
 * e para eventual cálculo client-side. weight nulo/NaN → piso 1.
 */
export function commercialLayerFor({ highlightActive = false, weight = null } = {}) {
  const n = Number(weight);
  const planWeight = weight == null || Number.isNaN(n) ? 1 : n;
  const boost = highlightActive ? BOOST_LAYER_WEIGHT : 0;
  return Math.max(boost, planWeight);
}

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

/**
 * Selo "Oportunidade" — preço significativamente abaixo da FIPE (>= 10%).
 *
 * Regra canônica (definida pelo produto):
 *   opportunity = true SE TODAS as condições forem verdadeiras:
 *     1. a.below_fipe = true                          (flag de risco gravada na criação/edição)
 *     2. a.fipe_reference_value IS NOT NULL           (FIPE foi resolvida pelo backend)
 *     3. a.fipe_reference_value > 0                   (defesa contra 0/NULL malformado)
 *     4. a.price IS NOT NULL
 *     5. a.price > 0
 *     6. a.price <= a.fipe_reference_value * 0.90     (margem de 10% ou mais)
 *
 * Diferença vs `below_fipe`:
 *   - below_fipe: preço apenas menor que FIPE (qualquer margem, inclusive 1%).
 *   - opportunity: preço com margem RELEVANTE (>= 10%), gera selo forte e
 *     filtro mais restritivo. NÃO são sinônimos.
 *
 * Por que calcular em runtime e não materializar coluna:
 *   - FIPE muda mensalmente. Coluna persistida ficaria stale sem worker.
 *   - Calcular no SELECT mantém sempre consistente com fipe_reference_value.
 *   - 0 bytes no banco; +1 boolean no payload de listagem.
 *
 * Mudar o limiar (0.90 → outro) é decisão de produto: ajustar AQUI e revisar
 * tests/ads/ads-opportunity-expr.test.js.
 */
export const OPPORTUNITY_DISCOUNT_RATIO = 0.9;

export const opportunityExpr = `
  (
    a.below_fipe = true
    AND a.fipe_reference_value IS NOT NULL
    AND a.fipe_reference_value > 0
    AND a.price IS NOT NULL
    AND a.price > 0
    AND a.price <= a.fipe_reference_value * ${OPPORTUNITY_DISCOUNT_RATIO}
  )
`;

/**
 * Tipo de vendedor canônico — espelha `deriveSellerKind` em
 * `src/modules/ads/ads.public-trust.js`. Mantemos a regra em DOIS lugares
 * intencionalmente:
 *
 *   - JS (trust pass): enriquece o payload da listagem com `seller_kind`
 *     já calculado.
 *   - SQL (este expr): permite FILTRAR por seller_kind no WHERE, sem
 *     materializar a coluna.
 *
 * IMPORTANTE: se a regra mudar (ex.: nova categoria 'verified-dealer'),
 * atualizar nos dois lugares. Testes de paridade ficam em
 * `tests/ads/ads-filter-builder-canonical.test.js`.
 *
 * Regra:
 *   - 'dealer'  se adv.id válido OU users.document_type === 'CNPJ'
 *   - 'private' caso contrário
 *
 * Conceito vs. plano:
 *   - `seller_kind` é TIPO DE VENDEDOR (loja vs. particular). NÃO confundir
 *     com `priority_tier` (plano pago: Destaque/Pro/Start/Grátis). Uma
 *     loja CNPJ pode estar no tier 1 (Grátis); um particular CPF pode
 *     ter destaque pago (tier 4). Os filtros são ortogonais.
 *
 * Requer os JOINs já presentes no builder:
 *   LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
 *   LEFT JOIN users u ON u.id = adv.user_id
 */
export const sellerKindExpr = `
  (CASE
    WHEN adv.id IS NOT NULL AND adv.id > 0 THEN 'dealer'
    WHEN UPPER(COALESCE(u.document_type, '')) = 'CNPJ' THEN 'dealer'
    ELSE 'private'
  END)
`;
