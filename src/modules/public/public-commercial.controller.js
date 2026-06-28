import { getCommercialRules } from "../commercial/commercial-rules.service.js";

/**
 * GET /api/public/commercial/boost — configuração PÚBLICA do produto avulso
 * de destaque (boost-7d). Somente leitura, SEM autenticação.
 *
 * Fonte única: `platform_settings` via `getCommercialRules()` — exatamente o
 * mesmo service que alimenta o modal de impulsionamento, a página
 * /impulsionar e `createBoostCheckout`. Por isso o card público de /planos
 * nunca diverge do preço/duração efetivamente cobrados.
 *
 * Expõe SOMENTE campos seguros (preço, duração, status ativo derivado). NÃO
 * retorna tokens, flags internas, comportamento de duplicata, trava do plano
 * Pro nem qualquer configuração administrativa sensível.
 *
 * Contrato:
 *   { boost: { id, name, description, price_cents, duration_days, active } }
 */
export async function getPublicBoostConfig(_req, res, next) {
  try {
    const rules = await getCommercialRules();
    const durationDays = Number(rules.boost_default_days);
    const priceCents = Number(rules.boost_default_price_cents);

    res.json({
      boost: {
        id: "boost-7d",
        name: `Destaque ${durationDays} dias`,
        description: `Prioridade alta nas buscas e badge de destaque por ${durationDays} dias.`,
        price_cents: priceCents,
        duration_days: durationDays,
        // Ativo enquanto ao menos um tipo de documento pode comprar o destaque.
        active: Boolean(rules.allow_boost_cpf || rules.allow_boost_cnpj),
      },
    });
  } catch (err) {
    next(err);
  }
}
