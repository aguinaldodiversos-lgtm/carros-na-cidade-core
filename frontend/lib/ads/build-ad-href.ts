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

/**
 * Coage um campo de anúncio a texto ESCALAR. Blindagem contra a "armadilha de
 * aranha" (incidente 2026-07): se `model`/`id`/`title`/etc. vierem como ARRAY,
 * `String(["a","b"])` vira `"a,b"` e o slugify concatena tudo num slug-monstro
 * (`/veiculo/modelo-a-modelo-b-...-100-101`). Array/objeto → "" (NUNCA
 * concatena); escalares preservam o comportamento anterior (string trima,
 * número finito vira dígitos). Nenhum caller passa array hoje, mas a porta
 * ficava destrancada.
 */
export function coerceScalarField(value: unknown): string {
  if (Array.isArray(value)) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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
    .map(coerceScalarField)
    .filter(Boolean)
    .join(" ");

  return slugify(composed || `veiculo-${coerceScalarField(ad.id) || "sem-id"}`);
}

export function buildAdHref(ad: AdCardLinkInput) {
  const slug = buildAdSlug(ad);
  const id = coerceScalarField(ad.id);

  const hasRealSlug = hasStableSlug(ad.slug);

  if (!hasRealSlug && id) {
    return `/veiculo/${slug}?ref=${encodeURIComponent(id)}`;
  }

  return `/veiculo/${slug}`;
}
