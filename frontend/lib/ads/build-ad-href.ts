export type AdCardLinkInput = {
  id?: string | number;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: string | number;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildAdSlug(ad: AdCardLinkInput) {
  if (ad.slug && String(ad.slug).trim()) {
    return slugify(String(ad.slug));
  }

  const composed = [
    ad.title,
    ad.brand,
    ad.model,
    ad.version,
    ad.year,
    ad.id,
  ]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .join(" ");

  const fallback = composed || `anuncio-${String(ad.id || "sem-id")}`;
  return slugify(fallback);
}

export function buildAdHref(ad: AdCardLinkInput) {
  return `/comprar/${buildAdSlug(ad)}`;
}
