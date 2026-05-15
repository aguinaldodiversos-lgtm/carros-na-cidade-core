/**
 * Detector de slug ruim para anúncios (rota /veiculo/[slug]).
 *
 * Função pura. Recebe `{ slug, title, brand, model, id }` e devolve:
 *   { isBad, severity, issues, suggested? }
 *
 * Não detecta DUPLICATAS (precisa de GROUP BY no DB) — o script chamador
 * faz isso separadamente. Aqui detectamos apenas problemas de SHAPE.
 *
 * Severidades:
 *   - critical: slug ausente, vazio, ou bate com path reservado.
 *   - high:     slug com caracteres inválidos, > 200 chars, todo numérico.
 *   - medium:   slug não inclui marca/modelo (perde sinal SEO).
 *   - low:      slug com adjacent dashes, leading/trailing dash, uppercase.
 *
 * Caracteres ESPERADOS no slug do anúncio (alinhado com slugify do projeto):
 *   `[a-z0-9-]+`, sem underscore, sem acentos, lowercase.
 */

// Estritamente o que o slug deve ter: lowercase alfanumérico + hífen.
// Usado para sugestões e validações finais.
const SLUG_VALID_CHARS = /^[a-z0-9-]+$/;
// Permissivo: aceita uppercase e underscore. Slug que falha AQUI tem
// caracteres realmente inválidos (espaço, acento, !). underscore/uppercase
// caem em LOW severity dedicada.
const SLUG_PERMISSIVE_CHARS = /^[a-zA-Z0-9_-]+$/;
const RESERVED_PATHS = [
  "wp-admin", "wp-login", "wp-content", ".env", ".git", "phpmyadmin",
  "admin", "api", "login", "logout", "register", "signup", "robots.txt",
  "sitemap.xml", "favicon.ico",
];

const MAX_SAFE_LENGTH = 200;
const RECOMMENDED_LENGTH = 120;

function safeString(value) {
  if (value == null) return "";
  return String(value);
}

function normalizeAscii(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function slugifyToken(text) {
  return normalizeAscii(safeString(text))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function suggestAdSlug({ brand, model, year, id }) {
  const parts = [slugifyToken(brand), slugifyToken(model)];
  if (year && Number.isFinite(Number(year))) parts.push(String(year));
  if (id != null) parts.push(String(id));
  const slug = parts.filter(Boolean).join("-");
  return slug || null;
}

export function detectBadSlug(ad) {
  const slug = safeString(ad?.slug);
  const issues = [];
  let severity = "ok";

  if (!slug.trim()) {
    issues.push({ code: "slug_empty", label: "Slug vazio ou null" });
    return {
      isBad: true,
      severity: "critical",
      issues,
      suggested: suggestAdSlug(ad ?? {}),
    };
  }

  // Reserved paths
  const lower = slug.toLowerCase();
  for (const reserved of RESERVED_PATHS) {
    if (lower === reserved || lower.startsWith(`${reserved}/`)) {
      issues.push({
        code: "slug_reserved",
        label: `Slug colide com path reservado: '${reserved}'`,
      });
      severity = "critical";
    }
  }

  // Shape problems
  if (slug.length > MAX_SAFE_LENGTH) {
    issues.push({
      code: "slug_too_long",
      label: `Slug muito longo (${slug.length} chars > ${MAX_SAFE_LENGTH})`,
    });
    severity = severity === "critical" ? "critical" : "high";
  }

  // HIGH só dispara para chars REALMENTE inválidos (espaço, acento, !, %).
  // Underscore e uppercase são fixable e caem em LOW abaixo.
  if (!SLUG_PERMISSIVE_CHARS.test(slug)) {
    const invalidChars = Array.from(new Set(slug.replace(/[a-zA-Z0-9_-]/g, "").split("")));
    issues.push({
      code: "slug_invalid_chars",
      label: `Slug contém caracteres inválidos: ${invalidChars.map((c) => JSON.stringify(c)).join(", ")}`,
    });
    severity = severity === "critical" ? "critical" : "high";
  }

  if (/^\d+$/.test(slug)) {
    issues.push({ code: "slug_all_digits", label: "Slug é só dígitos (sem semântica SEO)" });
    severity = severity === "critical" ? "critical" : "high";
  }

  // Adjacent dashes / leading-trailing
  if (/--/.test(slug)) {
    issues.push({ code: "slug_adjacent_dashes", label: "Slug contém dashes adjacentes ('--')" });
    if (severity === "ok") severity = "low";
  }
  if (/^-|-$/.test(slug)) {
    issues.push({ code: "slug_edge_dashes", label: "Slug começa ou termina com '-'" });
    if (severity === "ok") severity = "low";
  }
  if (/[A-Z]/.test(slug)) {
    issues.push({ code: "slug_uppercase", label: "Slug contém letras maiúsculas" });
    if (severity === "ok") severity = "low";
  }
  if (/_/.test(slug)) {
    issues.push({ code: "slug_underscore", label: "Slug contém underscore (use hífen)" });
    if (severity === "ok") severity = "low";
  }

  // Medium: slug sem marca/modelo
  const brand = slugifyToken(ad?.brand);
  const model = slugifyToken(ad?.model);
  if (brand && model) {
    const hasBrand = lower.includes(brand);
    const hasModel = lower.includes(model);
    if (!hasBrand && !hasModel) {
      issues.push({
        code: "slug_no_brand_model",
        label: `Slug não inclui marca ('${brand}') nem modelo ('${model}')`,
      });
      severity = severity === "ok" || severity === "low" ? "medium" : severity;
    }
  }

  if (slug.length > RECOMMENDED_LENGTH && severity === "ok") {
    issues.push({
      code: "slug_long_recommended",
      label: `Slug acima do recomendado (${slug.length} > ${RECOMMENDED_LENGTH})`,
    });
    severity = "low";
  }

  return {
    isBad: severity !== "ok",
    severity,
    issues,
    suggested: severity === "critical" || severity === "high" ? suggestAdSlug(ad ?? {}) : null,
  };
}

export const __INTERNAL__ = {
  RESERVED_PATHS,
  MAX_SAFE_LENGTH,
  RECOMMENDED_LENGTH,
  slugifyToken,
};
