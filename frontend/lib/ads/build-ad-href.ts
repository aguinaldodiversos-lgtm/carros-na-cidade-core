export type AdCardLinkInput = {
  id?: string | number | null;
  slug?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | number | null;
};

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^veiculo\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

function hasStableSlug(value: unknown) {
  const text = safeText(value);
  return Boolean(text && text !== "undefined" && text !== "null");
}

export function buildAdSlug(ad: AdCardLinkInput) {
  if (hasStableSlug(ad.slug)) {
    return slugify(String(ad.slug));
  }

  const composed = [ad.title, ad.brand, ad.model, ad.version, ad.year, ad.id]
    .filter((item) => item !== undefined && item !== null && String(item).trim())
    .map((item) => String(item).trim())
    .join(" ");

  return slugify(composed || `veiculo-${String(ad.id || "sem-id")}`);
}

export function buildAdHref(ad: AdCardLinkInput) {
  const slug = buildAdSlug(ad);
  const id =
    ad.id !== undefined && ad.id !== null && String(ad.id).trim() ? String(ad.id).trim() : "";

  const hasRealSlug = hasStableSlug(ad.slug);

  if (!hasRealSlug && id) {
    return `/veiculo/${slug}?ref=${encodeURIComponent(id)}`;
  }

  return `/veiculo/${slug}`;
}
