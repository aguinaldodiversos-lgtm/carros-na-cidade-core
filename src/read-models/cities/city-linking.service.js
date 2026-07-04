import { brandModelSlug, canonicalBrandSlug } from "../../shared/utils/slugify.js";

// Slug canônico de MARCA (strip do prefixo de grupo FIPE "GM - Chevrolet" →
// "chevrolet") e de MODELO (slug ingênuo — NÃO pode sofrer strip). Os links
// gerados aqui têm que casar byte-a-byte com o resolvedor das páginas.
function toBrandSlug(value) {
  return canonicalBrandSlug(value);
}
function toModelSlug(value) {
  return brandModelSlug(value);
}

export function buildCityTerritorialLinks({
  citySlug,
  brand = null,
  model = null,
  relatedBrands = [],
  relatedModels = [],
}) {
  const base = `/cidade/${citySlug}`;

  const links = {
    city: base,
    opportunities: `${base}/oportunidades`,
    belowFipe: `${base}/abaixo-da-fipe`,
    brands: [],
    models: [],
  };

  if (brand) {
    links.brand = `${base}/marca/${toBrandSlug(brand)}`;
  }

  if (brand && model) {
    links.model = `${base}/marca/${toBrandSlug(brand)}/modelo/${toModelSlug(model)}`;
  }

  links.brands = relatedBrands.slice(0, 12).map((item) => ({
    brand: item.brand,
    total: Number(item.total || 0),
    path: `${base}/marca/${toBrandSlug(item.brand)}`,
  }));

  links.models = relatedModels.slice(0, 12).map((item) => ({
    model: item.model,
    total: Number(item.total || 0),
    path: brand ? `${base}/marca/${toBrandSlug(brand)}/modelo/${toModelSlug(item.model)}` : null,
  }));

  return links;
}
