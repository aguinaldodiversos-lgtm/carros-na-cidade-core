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
