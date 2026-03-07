export async function buildCityInternalLinks(city, relatedPages = []) {
  return {
    city: city?.slug || null,
    links: relatedPages.map((page) => ({
      title: page.title,
      slug: page.slug,
      city: page.city || null,
    })),
  };
}
