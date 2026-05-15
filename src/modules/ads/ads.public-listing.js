// src/modules/ads/ads.public-listing.js
//
// Contrato slim para LISTAGEM publica de anuncios (/api/ads, /api/ads/search).
//
// Motivacao (PR de hardening pos-incidente bandwidth 2026-05):
// - A query antiga retornava `SELECT a.* + joins` em listagem, o que incluia
//   `description` (varchar grande), `search_vector` (tsvector pesado),
//   `whatsapp_number` (PII so usada no detalhe), arrays completos de imagens
//   e metadados de scoring (text_rank, hybrid_score, views/clicks/leads/ctr).
// - O detalhe (/api/ads/:id) continua com payload completo via `normalizePublicAdRow`.
//
// Estado-alvo (cards do frontend usam): id, slug, title, brand, model, version,
//   year, price, city, city_slug, state, mileage, fuel, transmission, body_type,
//   image_url, plan, priority, dealership_name, seller_type/seller_kind,
//   below_fipe, reviewed_after_below_fipe, highlight_until, account_type,
//   dealership_id, created_at.
//
// Por que serializer em JS e nao `SELECT` parcial:
// - O ranking SQL (ads-ranking.sql.js) ja calcula text_rank/hybrid_score sobre
//   o conjunto inteiro. Cortar no SQL exigiria refazer o ORDER BY. O custo de
//   trafego DB->backend e dentro da mesma regiao (interno), o custo grande e
//   backend->internet (outbound bandwidth — o que estamos reduzindo).
// - Manter um lugar so para definir o contrato slim facilita auditar quando
//   um campo precisa entrar/sair.

/**
 * Campos OBRIGATORIOS na listagem publica. Tudo que NAO esta nesta whitelist
 * e descartado do row antes de responder.
 *
 * IMPORTANTE: ao adicionar campo aqui, validar que aparece em algum card no
 * frontend (frontend/components/{ads,buy,home}/*). Ao remover, validar que
 * nenhum card depende dele.
 */
const LISTING_ALLOWED_FIELDS = Object.freeze([
  // Identidade / link
  "id",
  "slug",
  "title",
  // Veiculo
  "brand",
  "model",
  "version",
  "year",
  "year_model",
  "model_year",
  "mileage",
  "fuel",
  "fuel_type",
  "transmission",
  "body_type",
  // Preco / FIPE
  "price",
  "below_fipe",
  "reviewed_after_below_fipe",
  // Localizacao
  "city",
  "city_id",
  "city_slug",
  "state",
  // Imagem: image_url e a capa principal; "images" e mantido mas truncado
  // a IMAGES_LISTING_LIMIT itens pelo serializer.
  "image_url",
  "image",
  "cover_image_url",
  "cover_image",
  "storage_key",
  "images",
  // Comercial / vendedor (so o suficiente para card)
  "plan",
  "priority",
  "highlight_until",
  "dealership_id",
  "dealership_name",
  "dealer_name",
  "seller_name",
  "seller_kind",
  "seller_type",
  "account_type",
  // Status / publicacao
  "status",
  "created_at",
  // Identificador do anunciante (necessario em algumas telas territoriais)
  "advertiser_id",
]);

/**
 * Numero maximo de URLs no array `images` na listagem.
 *
 * Por que 3: o card mostra 1 imagem visivel + ate 2 thumbnails em hover.
 * Detalhe (`/api/ads/:id`) continua com array completo. Reduzir aqui corta
 * dezenas de KB por response quando o anuncio tem 12+ fotos.
 */
const IMAGES_LISTING_LIMIT = 3;

/**
 * Campos explicitamente CORTADOS para listagem mesmo que cheguem no row.
 * Lista de seguranca em caso de nova coluna em `ads.*` ser propagada por engano.
 *
 * - description: texto longo, exibido so na pagina de detalhe.
 * - whatsapp_number: PII que so a pagina de detalhe deve mostrar.
 * - images: array completo de URLs (cada uma com query string longa).
 * - search_vector, text_rank, hybrid_score: ranking interno, sem valor publico.
 * - views/clicks/leads/ctr: metricas internas, mostradas em admin.
 * - reviewed_at, updated_at: ruido na listagem; created_at e mais usado.
 * - gearbox/cambio: aliases de transmission.
 * - risk_* / reviewed_by / rejection_*: ja removidos por applyPublicTrustFields,
 *   listados aqui como defesa em profundidade.
 */
const LISTING_BLOCKED_FIELDS = Object.freeze([
  "description",
  "whatsapp_number",
  "search_vector",
  "text_rank",
  "hybrid_score",
  "views",
  "clicks",
  "leads",
  "ctr",
  "reviewed_at",
  "updated_at",
  "gearbox",
  "cambio",
  "risk_reasons",
  "risk_score",
  "risk_level",
  "reviewed_by",
  "rejection_reason",
  "correction_requested_reason",
  "structural_change_count",
]);

/**
 * Reduz um ad ja normalizado por `normalizePublicAdRow(s)` para o contrato slim
 * de listagem.
 *
 * Regras aplicadas:
 * 1) Mantem so campos em LISTING_ALLOWED_FIELDS.
 * 2) Trunca `images` para no maximo IMAGES_LISTING_LIMIT URLs.
 */
export function serializeAdForListing(ad) {
  if (!ad || typeof ad !== "object") return ad;

  const out = {};
  for (const field of LISTING_ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(ad, field)) {
      out[field] = ad[field];
    }
  }

  if (Array.isArray(out.images) && out.images.length > IMAGES_LISTING_LIMIT) {
    out.images = out.images.slice(0, IMAGES_LISTING_LIMIT);
  }

  return out;
}

export function serializeAdsForListing(ads) {
  if (!Array.isArray(ads)) return [];
  return ads.map((ad) => serializeAdForListing(ad));
}

// Export interno para testes auditarem o contrato.
export const PUBLIC_LISTING_CONTRACT = Object.freeze({
  ALLOWED_FIELDS: LISTING_ALLOWED_FIELDS,
  BLOCKED_FIELDS: LISTING_BLOCKED_FIELDS,
  IMAGES_LISTING_LIMIT,
});
