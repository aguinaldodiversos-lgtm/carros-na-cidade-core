import { pool } from "../../../infrastructure/database/db.js";
import { buildAdsFacetScopeWhere, buildAdsFacetWhere } from "./ads-filter.builder.js";
import { commercialLayerExpr, opportunityExpr, sellerKindExpr } from "./ads-ranking.sql.js";

/**
 * JOINs de toda query de facet.
 *
 * `cities c` e `advertisers adv` são exigidos pelo WHERE base (c.slug no
 * território, adv.name/adv.company_name no DIRTY_TEST_AD_GUARD_SQL).
 *
 * `users u` e `subscription_plans sp` NÃO são exigidos pelo WHERE base hoje
 * — estão aqui como defesa. As expressões canônicas os referenciam
 * (`sellerKindExpr` → u.document_type, `commercialLayerExpr` → sp.weight), e
 * duas vezes já custou produção alguém pôr uma dessas no WHERE de uma query
 * sem o JOIN correspondente: `adv` em 2026-05-24, `u`/`sp` no countQuery em
 * 2026-07-26. Se um dia `buildAdsFacetWhere` passar a aceitar seller_kind ou
 * priority_tier, as quatro agregações de veículo continuam funcionando em
 * vez de zerarem com "missing FROM-clause entry".
 *
 * Inertes para as contagens: ambos casam pela PK da tabela juntada
 * (users.id, subscription_plans.id), portanto no máximo 1 linha cada — não
 * multiplicam COUNT(*) nem alteram nenhum GROUP BY.
 */
const FACET_JOINS = `
    LEFT JOIN cities c ON c.id = a.city_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    LEFT JOIN users u ON u.id = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
`;

export async function getAdsFacets(filters = {}) {
  const { whereClause, params } = buildAdsFacetWhere(filters);

  // Facets de CONTROLE (Vendedor, Câmbio, chips de Ofertas) usam escopo só
  // territorial — ver buildAdsFacetScopeWhere. Uma contagem que respeitasse
  // o próprio filtro se auto-zeraria e o chip nunca mais seria clicável.
  const { whereClause: scopeWhere, params: scopeParams } = buildAdsFacetScopeWhere(filters);

  const [brands, models, fuelTypes, bodyTypes, sellerKinds, transmissions, offers] =
    await Promise.all([
      pool.query(
        `
      SELECT a.brand, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${whereClause}
        AND a.brand IS NOT NULL
      GROUP BY a.brand
      ORDER BY total DESC, a.brand ASC
      LIMIT 20
      `,
        params
      ),
      pool.query(
        `
      SELECT a.brand, a.model, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${whereClause}
        AND a.brand IS NOT NULL
        AND a.model IS NOT NULL
      GROUP BY a.brand, a.model
      ORDER BY total DESC, a.brand ASC, a.model ASC
      LIMIT 30
      `,
        params
      ),
      pool.query(
        `
      SELECT a.fuel_type, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${whereClause}
        AND a.fuel_type IS NOT NULL
      GROUP BY a.fuel_type
      ORDER BY total DESC, a.fuel_type ASC
      LIMIT 15
      `,
        params
      ),
      pool.query(
        `
      SELECT a.body_type, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${whereClause}
        AND a.body_type IS NOT NULL
      GROUP BY a.body_type
      ORDER BY total DESC, a.body_type ASC
      LIMIT 15
      `,
        params
      ),
      // Vendedor. GROUP BY simples: omite a categoria sem nenhum anúncio,
      // e é exatamente esse zero que interessa ("Particulares (0)" evita o
      // clique). Quem completa as duas chaves com 0 é o normalizador do
      // frontend — SQL burro de propósito, porque garantir as duas linhas
      // aqui exigiria VALUES + LEFT JOIN e isto não roda em CI (as
      // integration/ dependem de Postgres que nem o dev tem de pé).
      pool.query(
        `
      SELECT ${sellerKindExpr} AS seller_kind, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${scopeWhere}
      GROUP BY 1
      ORDER BY total DESC, seller_kind ASC
      `,
        scopeParams
      ),
      // Câmbio: mesma expressão COALESCE que o filtro usa em
      // buildAdsFacetWhere, senão contagem e filtro discordariam.
      pool.query(
        `
      SELECT COALESCE(a.transmission, a.gearbox, a.cambio) AS transmission, COUNT(*)::int AS total
      FROM ads a
      ${FACET_JOINS}
      ${scopeWhere}
        AND TRIM(COALESCE(a.transmission, a.gearbox, a.cambio, '')) <> ''
      GROUP BY 1
      ORDER BY total DESC, transmission ASC
      LIMIT 15
      `,
        scopeParams
      ),
      // Chips de Ofertas: os três numa varredura só, via COUNT FILTER.
      // `highlight` é o chip "Destaques" (priority_tier=4 = camada de
      // boost) — mesmo limiar que o filtro aplica.
      pool.query(
        `
      SELECT
        COUNT(*) FILTER (WHERE ${opportunityExpr})::int AS opportunity,
        COUNT(*) FILTER (WHERE a.below_fipe = true)::int AS below_fipe,
        COUNT(*) FILTER (WHERE ${commercialLayerExpr} = 4)::int AS highlight
      FROM ads a
      ${FACET_JOINS}
      ${scopeWhere}
      `,
        scopeParams
      ),
    ]);

  return {
    brands: brands.rows,
    models: models.rows,
    fuelTypes: fuelTypes.rows,
    bodyTypes: bodyTypes.rows,
    sellerKinds: sellerKinds.rows,
    transmissions: transmissions.rows,
    offers: offers.rows[0] || { opportunity: 0, below_fipe: 0, highlight: 0 },
  };
}
