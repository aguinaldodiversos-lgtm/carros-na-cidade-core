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

/**
 * Normalização CANÔNICA de MARCA (não usar em modelo).
 *
 * O catálogo usa nomes da FIPE, que gravam alguns grupos como "ABBR - Marca"
 * (ex.: "GM - Chevrolet", "VW - VolksWagen"). O slug ingênuo (`brandModelSlug`)
 * produziria "gm-chevrolet" / "vw-volkswagen", que NÃO casam com a URL/slug
 * humano esperado ("chevrolet" / "volkswagen") — bug do "0 anúncios" em
 * `/cidade/[slug]/marca/[brand]` (auditoria SEO 2026-07-04).
 *
 * Regra GENÉRICA (não hardcode por marca): remove um prefixo de grupo no
 * formato `TOKEN - ` (token + espaço-hífen-espaço). Só "GM - Chevrolet" e
 * "VW - VolksWagen" têm esse padrão hoje; qualquer marca futura "XYZ - Foo"
 * é normalizada automaticamente. Marcas com hífen interno SEM espaços
 * ("Mercedes-Benz", "Rolls-Royce") NÃO são afetadas.
 *
 * NÃO aplicar a modelos: um modelo como "HB 20" (slug canônico "hb-20") seria
 * corrompido por um strip genérico de prefixo — por isso a função é separada.
 */
const BRAND_GROUP_PREFIX_RE = /^\S+\s+-\s+/;

/**
 * Ajustes de caixa de exibição por slug canônico. A FIPE grafa "VolksWagen";
 * a exibição correta é "Volkswagen". Mapa pequeno e extensível (keyed by slug).
 */
const BRAND_DISPLAY_OVERRIDES = Object.freeze({
  volkswagen: "Volkswagen",
});

/** Remove o prefixo de grupo FIPE ("GM - Chevrolet" → "Chevrolet"). */
export function stripBrandGroupPrefix(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const stripped = raw.replace(BRAND_GROUP_PREFIX_RE, "").trim();
  return stripped || raw;
}

/** Slug canônico de MARCA: "GM - Chevrolet" → "chevrolet"; "chevrolet" → "chevrolet". */
export function canonicalBrandSlug(value) {
  if (value === undefined || value === null) return "";
  return slugify(stripBrandGroupPrefix(value));
}

/** Nome de EXIBIÇÃO canônico da marca: "GM - Chevrolet" → "Chevrolet"; "VW - VolksWagen" → "Volkswagen". */
export function canonicalBrandLabel(value) {
  const stripped = stripBrandGroupPrefix(value);
  if (!stripped) return "";
  const key = canonicalBrandSlug(stripped);
  return BRAND_DISPLAY_OVERRIDES[key] || stripped;
}
