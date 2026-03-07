export function resolveAdsScopeFromRequest(req) {
  const params = req?.params || {};
  const query = req?.query || {};

  if (params.slug && params.brand && params.model) {
    return "public_city_brand_model";
  }

  if (params.slug && params.brand) {
    return "public_city_brand";
  }

  if (params.slug && (query.below_fipe === "true" || query.below_fipe === true)) {
    return "public_city_below_fipe";
  }

  if (params.slug) {
    return "public_city";
  }

  return "public_global";
}
