import { cacheInvalidatePrefix } from "../../shared/cache/cache.middleware.js";

/**
 * Invalidação de caches após mutação de anúncios (listas, facets, autocomplete).
 * O portal Next usa tags `public-home`, `public-home:{slug}`, `city-meta` nos fetches — acoplar
 * `revalidateTag` via webhook se precisar invalidar ISR junto com o Redis.
 */
export async function invalidateAdsCachesAfterMutation() {
  await Promise.allSettled([
    cacheInvalidatePrefix("home"),
    cacheInvalidatePrefix("ads:list"),
    cacheInvalidatePrefix("ads:search"),
    cacheInvalidatePrefix("ads:auto"),
    cacheInvalidatePrefix("ads:auto:semantic"),
    cacheInvalidatePrefix("ads:facets"),
    cacheInvalidatePrefix("public:city"),
    cacheInvalidatePrefix("public:city:brand"),
    cacheInvalidatePrefix("public:city:model"),
    cacheInvalidatePrefix("public:city:opportunities"),
    cacheInvalidatePrefix("public:city:below-fipe"),
  ]);
}
