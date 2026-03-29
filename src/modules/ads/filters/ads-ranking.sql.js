/**
 * Componentes SQL do ranking híbrido (plano pago + destaque pago + demanda territorial).
 * Mantidos em um único lugar para alinhar com `subscription_plans` (account.service).
 */

/** Peso do plano gravado em `ads.plan` (ids dos planos padrão). */
export const planRankExpr = `
  (
    CASE COALESCE(NULLIF(TRIM(a.plan), ''), 'cpf-free-essential')
      WHEN 'cpf-free-essential' THEN 0
      WHEN 'cnpj-free-store' THEN 8
      WHEN 'cpf-premium-highlight' THEN 45
      WHEN 'cnpj-store-start' THEN 55
      WHEN 'cnpj-store-pro' THEN 80
      WHEN 'cnpj-evento-premium' THEN 100
      ELSE 12
    END
  ) * 0.32
`;

/**
 * Demanda da cidade — requer `LEFT JOIN city_metrics cm ON cm.city_id = a.city_id` na query.
 */
export const cityDemandBoostExpr = `LEAST(48, COALESCE(cm.demand_score, 0) * 0.28)`;
