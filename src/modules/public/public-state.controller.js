import { listFeaturedRegionsByUf } from "../regions/state-regions.service.js";

/**
 * Controller: GET /api/public/states/:uf/regions
 *
 * Retorna regiões destacadas de um estado, ordenadas por adsCount desc,
 * featuredCount desc, nome asc. Payload leve por design — sem fotos,
 * descrição grande, ou dados de admin.
 *
 * Códigos de resposta:
 *   - 200 + envelope success quando UF válida (mesmo que `regions=[]` para
 *     UF sem cidades — frontend decide o que mostrar).
 *   - 400 quando UF está malformada (não é 2 letras A-Z).
 *
 * Não retornamos 404 para UF válida sem regiões — isso seria
 * indistinguível de UF inexistente do ponto de vista do consumer. O caso
 * "lista vazia" tem semântica diferente e o frontend trata sem alarde.
 */

const SAFE_UF_PATTERN = /^[A-Z]{2}$/;
const DEFAULT_MAX_REGIONS = 8;
const HARD_CAP_REGIONS = 12;

function parseMaxRegions(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MAX_REGIONS;
  if (n <= 0) return DEFAULT_MAX_REGIONS;
  return Math.min(HARD_CAP_REGIONS, Math.max(1, Math.floor(n)));
}

export async function getFeaturedRegionsByState(req, res, next) {
  try {
    const ufRaw = String(req.params.uf ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);

    if (!SAFE_UF_PATTERN.test(ufRaw)) {
      return res.status(400).json({
        success: false,
        message: "UF inválida.",
      });
    }

    const maxRegions = parseMaxRegions(req.query?.limit);
    const regions = await listFeaturedRegionsByUf(ufRaw, { maxRegions });

    if (regions == null) {
      return res.status(400).json({
        success: false,
        message: "UF inválida.",
      });
    }

    return res.json({
      success: true,
      data: {
        state: {
          code: ufRaw,
          slug: ufRaw.toLowerCase(),
        },
        regions,
      },
    });
  } catch (err) {
    next(err);
  }
}
