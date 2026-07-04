/**
 * Slug canônico de marca/modelo para as rotas territoriais
 * `/cidade/[slug]/marca/[brand]/modelo/[model]`.
 *
 * ESPELHO byte-a-byte do backend `src/shared/utils/slugify.js#brandModelSlug`
 * (que reusa `slugify`). Um teste de sincronia
 * (`brand-model-slug.test.ts`) garante que as duas implementações produzam
 * a mesma saída para uma lista de fixtures — é isso que assegura que um
 * link/sitemap gerado de um lado resolva para a mesma página do outro.
 *
 * Exemplos:
 *   Fiat → fiat | Chevrolet → chevrolet | Volkswagen → volkswagen
 *   Citroën → citroen | Land Rover → land-rover
 *   HB20 → hb20 | "HB 20" → hb-20 | "Mogi Guaçu" → mogi-guacu
 */
export function brandModelSlug(value: string | null | undefined): string {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * ESPELHO de `src/shared/utils/slugify.js`. Normalização CANÔNICA de MARCA
 * (NÃO usar em modelo): remove o prefixo de grupo FIPE "ABBR - Marca"
 * ("GM - Chevrolet" → "chevrolet", "VW - VolksWagen" → "volkswagen"). Marcas
 * com hífen interno sem espaços ("Mercedes-Benz") não são afetadas. Modelos
 * como "HB 20" (slug "hb-20") NUNCA passam por aqui.
 */
const BRAND_GROUP_PREFIX_RE = /^\S+\s+-\s+/;
const BRAND_DISPLAY_OVERRIDES: Record<string, string> = { volkswagen: "Volkswagen" };

export function stripBrandGroupPrefix(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const stripped = raw.replace(BRAND_GROUP_PREFIX_RE, "").trim();
  return stripped || raw;
}

export function canonicalBrandSlug(value: string | null | undefined): string {
  if (value === undefined || value === null) return "";
  return brandModelSlug(stripBrandGroupPrefix(value));
}

export function canonicalBrandLabel(value: string | null | undefined): string {
  const stripped = stripBrandGroupPrefix(value);
  if (!stripped) return "";
  const key = canonicalBrandSlug(stripped);
  return BRAND_DISPLAY_OVERRIDES[key] || stripped;
}
