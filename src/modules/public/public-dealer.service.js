// src/modules/public/public-dealer.service.js
//
// Página pública da loja (P3-C/Lojas 2026-05-25).
//
// Estratégia conservadora:
//   - Lê apenas dados públicos do advertiser (sem telefone, email, plano).
//   - Filtra por `status = 'active'` (loja bloqueada → 404).
//   - Lista apenas anúncios com `status = 'active'` + DIRTY_TEST_AD_GUARD_SQL
//     (mesmo filtro da listagem pública /api/ads/search).
//   - Aplica `normalizePublicAdRows` (URL de imagem proxy/R2) e
//     `serializeAdsForListing` (whitelist de campos slim) — exatamente
//     o que os cards do catálogo já esperam, sem reinventar contrato.
//   - Retorna `null` quando loja não existe ou está inativa → controller
//     vira 404 real.

import { pool } from "../../infrastructure/database/db.js";
import { DIRTY_TEST_AD_GUARD_SQL } from "../ads/filters/ads-filter.builder.js";
import { normalizePublicAdRows } from "../ads/ads.public-images.js";
import { serializeAdsForListing } from "../ads/ads.public-listing.js";

const MAX_SLUG_LENGTH = 200;
const ADS_PER_DEALER = 60;

function pickDisplayName(dealer) {
  const company = typeof dealer.company_name === "string" ? dealer.company_name.trim() : "";
  if (company) return company;
  const name = typeof dealer.name === "string" ? dealer.name.trim() : "";
  if (name) return name;
  return "Loja parceira";
}

/**
 * Resolve a loja por slug (`advertisers.slug`, gerado em
 * `ensureAdvertiserForUser`). Devolve `null` quando a loja não existe
 * ou seu status não é `'active'` — o controller transforma em 404.
 */
export async function getPublicDealerBySlug(slug) {
  if (typeof slug !== "string") return null;
  const safeSlug = slug.trim().toLowerCase().slice(0, MAX_SLUG_LENGTH);
  if (!safeSlug) return null;

  const dealerRes = await pool.query(
    `
    SELECT
      adv.id,
      adv.slug,
      adv.name,
      adv.company_name,
      adv.status,
      adv.verified,
      c.slug  AS city_slug,
      c.name  AS city_name,
      c.state AS city_state
    FROM advertisers adv
    LEFT JOIN cities c ON c.id = adv.city_id
    WHERE adv.slug = $1
      AND COALESCE(adv.status, 'active') = 'active'
    LIMIT 1
    `,
    [safeSlug]
  );

  const dealer = dealerRes.rows[0];
  if (!dealer) return null;

  // Mesmo SELECT do `findPublicById` do detalhe — garante que o
  // normalizePublicAdRows recebe o shape esperado, e serializeAdsForListing
  // tem todos os campos para o card.
  const adsRes = await pool.query(
    `
    SELECT
      a.*,
      c.slug AS city_slug,
      adv.id           AS dealership_id,
      adv.slug         AS advertiser_slug,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      u.document_type  AS account_type
    FROM ads a
    LEFT JOIN cities c        ON c.id = a.city_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    LEFT JOIN users u         ON u.id = adv.user_id
    WHERE a.advertiser_id = $1
      AND a.status = 'active'
      AND ${DIRTY_TEST_AD_GUARD_SQL}
    ORDER BY
      (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC,
      a.created_at DESC NULLS LAST,
      a.id DESC
    LIMIT $2
    `,
    [dealer.id, ADS_PER_DEALER]
  );

  const normalized = await normalizePublicAdRows(adsRes.rows);
  const ads = serializeAdsForListing(normalized);

  // Defesa extra: dropa qualquer ad sem slug — caller renderiza apenas
  // cards com /veiculo/<slug> válido.
  const safeAds = ads.filter(
    (ad) => typeof ad.slug === "string" && ad.slug.trim().length > 0
  );

  return {
    dealer: {
      id: dealer.id,
      slug: dealer.slug,
      name: pickDisplayName(dealer),
      verified: Boolean(dealer.verified),
      city: dealer.city_name || null,
      state: dealer.city_state || null,
      city_slug: dealer.city_slug || null,
      total_active_ads: safeAds.length,
    },
    ads: safeAds,
  };
}
