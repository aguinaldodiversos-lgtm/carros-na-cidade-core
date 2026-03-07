export async function markForIndexing({ type, citySlug, slug }) {
  return {
    queued: true,
    type,
    citySlug: citySlug || null,
    slug: slug || null,
    createdAt: new Date().toISOString(),
  };
}
