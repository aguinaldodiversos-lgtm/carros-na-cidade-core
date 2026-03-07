function toSlugPart(value) {
  return String(value || "").trim().toLowerCase();
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
    links.brand = `${base}/marca/${toSlugPart(brand)}`;
  }

  if (brand && model) {
    links.model = `${base}/marca/${toSlugPart(brand)}/modelo/${toSlugPart(model)}`;
  }

  links.brands = relatedBrands.slice(0, 12).map((item) => ({
    brand: item.brand,
    total: Number(item.total || 0),
    path: `${base}/marca/${toSlugPart(item.brand)}`,
  }));

  links.models = relatedModels.slice(0, 12).map((item) => ({
    model: item.model,
    total: Number(item.total || 0),
    path: brand
      ? `${base}/marca/${toSlugPart(brand)}/modelo/${toSlugPart(item.model)}`
      : null,
  }));

  return links;
}
