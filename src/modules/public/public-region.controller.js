import { getRegionByBaseSlugDynamic } from "../regions/regions.service.js";
import { stateNameFromUf } from "../../shared/utils/state-names.js";
import { logger } from "../../shared/logger.js";

/**
 * Endpoint público leve para resolver a Região associada a uma cidade-base
 * pelo seu citySlug canônico (`nome-uf`).
 *
 * GET /api/public/regions/:citySlug
 *
 * Diferença em relação ao `/api/internal/regions/:citySlug`:
 *   - PÚBLICO (sem token), CORS-friendly.
 *   - Payload sanitizado: só dados de exposição pública, sem ids internos
 *     desnecessários nem metadados administrativos.
 *   - Cache mais agressivo (15 min) — uso esperado por crawlers e cache
 *     externos (CDN).
 *
 * Cobertura nacional:
 *   Qualquer cidade brasileira cadastrada em `cities` com latitude e
 *   longitude válidas resolve aqui. NÃO depende de listas curadas.
 *
 * Erros:
 *   - 404 se a cidade não existe ou não tem coordenadas.
 *   - 200 com `members: []` se a cidade existe mas não tem vizinhos no
 *     raio configurado (cidade isolada do interior, comportamento válido).
 *   - Nunca 500 por ausência de dados — o caller (SSR, crawler) recebe
 *     resposta semanticamente correta.
 */
export async function getPublicRegionByCitySlug(req, res, next) {
  const citySlug = String(req.params.citySlug || "").trim().toLowerCase();
  if (!citySlug) {
    return res.status(404).json({ success: false, error: "Region not found" });
  }

  try {
    const region = await getRegionByBaseSlugDynamic(citySlug);
    if (!region || !region.base) {
      return res.status(404).json({ success: false, error: "Region not found" });
    }

    const baseSlug = String(region.base.slug || "").toLowerCase();
    const uf = String(region.base.state || "").toUpperCase();
    const ufLower = uf.toLowerCase();
    const radiusKm = Number.isFinite(Number(region.radius_km))
      ? Number(region.radius_km)
      : 80;

    // Sanitiza membros — somente campos públicos.
    const members = Array.isArray(region.members)
      ? region.members.map((m) => ({
          cityId: Number(m.id ?? m.city_id ?? 0) || null,
          name: String(m.name || ""),
          slug: String(m.slug || "").toLowerCase(),
          state: String(m.state || "").toUpperCase(),
          distanceKm: m.distance_km != null ? Number(m.distance_km) : null,
          layer: m.layer != null ? Number(m.layer) : null,
        }))
      : [];

    // Lista de citySlugs (cidade-base + membros) — útil para o frontend
    // construir filtros de busca regionais em uma única chamada.
    const citySlugs = [baseSlug, ...members.map((m) => m.slug).filter(Boolean)];

    const payload = {
      region: {
        slug: baseSlug,
        name: `Região de ${region.base.name}`,
        canonicalUrl: `/carros-usados/regiao/${baseSlug}`,
        radiusKm,
      },
      baseCity: {
        id: Number(region.base.id ?? 0) || null,
        name: String(region.base.name || ""),
        slug: baseSlug,
        state: uf,
        latitude: region.base.latitude != null ? Number(region.base.latitude) : null,
        longitude: region.base.longitude != null ? Number(region.base.longitude) : null,
      },
      state: {
        code: uf,
        slug: ufLower,
        name: stateNameFromUf(uf) || uf,
      },
      members,
      citySlugs,
      adsCount: Number.isFinite(Number(region.ads_count)) ? Number(region.ads_count) : 0,
      featuredCount: Number.isFinite(Number(region.featured_count))
        ? Number(region.featured_count)
        : 0,
    };

    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    logger.error(
      { err: err?.message || String(err), citySlug },
      "[public:region] falha ao resolver região"
    );
    return next(err);
  }
}
