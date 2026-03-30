function normalizeSlugPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function buildStageClusters({ city, brands = [], modelsByBrand = {} }) {
  const base = `/cidade/${city.slug}`;

  const common = [
    {
      cluster_type: "city_home",
      path: base,
      money_page: city.stage === "dominance" || city.stage === "expansion",
      priority: 100,
    },
    {
      cluster_type: "city_opportunities",
      path: `${base}/oportunidades`,
      money_page: true,
      priority: 95,
    },
    {
      cluster_type: "city_below_fipe",
      path: `${base}/abaixo-da-fipe`,
      money_page: true,
      priority: 94,
    },
  ];

  const brandClusters = [];
  const modelClusters = [];

  for (const brandRow of brands) {
    const brandSlug = normalizeSlugPart(brandRow.brand);

    brandClusters.push({
      cluster_type: "city_brand",
      brand: brandRow.brand,
      path: `${base}/marca/${brandSlug}`,
      money_page: city.stage !== "discovery",
      priority: city.stage === "dominance" ? 90 : city.stage === "expansion" ? 80 : 65,
    });

    const models = modelsByBrand[brandRow.brand] || [];

    for (const modelRow of models) {
      const modelSlug = normalizeSlugPart(modelRow.model);

      modelClusters.push({
        cluster_type: "city_brand_model",
        brand: brandRow.brand,
        model: modelRow.model,
        path: `${base}/marca/${brandSlug}/modelo/${modelSlug}`,
        money_page: city.stage === "dominance" || city.stage === "expansion",
        priority: city.stage === "dominance" ? 85 : city.stage === "expansion" ? 72 : 58,
      });
    }
  }

  return [...common, ...brandClusters, ...modelClusters].sort((a, b) => b.priority - a.priority);
}
