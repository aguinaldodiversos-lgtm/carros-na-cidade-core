export function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug can\u00f4nico para marca/modelo de ve\u00edculo nas rotas territoriais
 * `/cidade/[slug]/marca/[brand]/modelo/[model]`.
 *
 * \u00c9 a \u00daNICA fonte de verdade para derivar o slug de marca/modelo no
 * backend \u2014 usada por (a) gera\u00e7\u00e3o de links internos, (b) canonicalPath
 * das p\u00e1ginas de cluster e (c) entradas dos sitemaps brands/models.
 * O frontend mant\u00e9m um espelho byte-a-byte em
 * `frontend/lib/seo/brand-model-slug.ts` (com teste de sincronia por
 * fixtures compartilhadas). Mant\u00ea-los id\u00eanticos \u00e9 o que garante que um
 * link gerado aqui resolva para a mesma combina\u00e7\u00e3o ao ser acessado.
 *
 * Exemplos:
 *   Fiat \u2192 fiat | Chevrolet \u2192 chevrolet | Volkswagen \u2192 volkswagen
 *   Citro\u00ebn \u2192 citroen | Land Rover \u2192 land-rover
 *   HB20 \u2192 hb20 | "HB 20" \u2192 hb-20 | "Mogi Gua\u00e7u" \u2192 mogi-guacu
 *
 * Reaproveita `slugify` (mesmo NFD strip de acentos) \u2014 n\u00e3o reimplementar.
 */
export function brandModelSlug(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return slugify(raw);
}
