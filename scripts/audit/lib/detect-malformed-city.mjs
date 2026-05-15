/**
 * Detector de cidade malformada — operando sobre um row que pode vir
 * tanto da tabela `cities` quanto do JOIN ads + cities.
 *
 * Função pura, sem dependência de DB. Recebe:
 *   {
 *     name?: string,        // nome da cidade
 *     slug?: string,        // ex.: "atibaia-sp"
 *     state?: string,       // UF — esperado "SP" maiúsculo
 *     city_id?: number,
 *     ad_state?: string,    // state da denormalização da ads (opcional)
 *     ad_city?: string,     // cidade da denormalização da ads (opcional)
 *   }
 *
 * Retorna `{ isMalformed, severity, issues, suggestedSlug? }`.
 *
 * Princípio: detecta tanto problemas estruturais (slug em formato errado,
 * UF inválida) quanto inconsistências entre o slug e a UF declarada, ou
 * entre a denormalização da ads e a tabela cities.
 *
 * Casos cobertos:
 *   - mojibake UTF-8 (SÆo, Ã£, Ã©)
 *   - state ausente ou com menos/mais de 2 letras
 *   - state fora da lista de UFs brasileiras
 *   - slug ausente
 *   - slug em formato errado (não match `[a-z0-9-]+-[a-z]{2}`)
 *   - sufixo do slug não bate com state declarado
 *   - city_id ausente quando esperado
 *   - inconsistência ads.city / ads.state vs cities.name / cities.state
 */

const BRAZIL_UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_WITH_UF_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([a-z]{2})$/;

const MOJIBAKE_PATTERNS = [
  /Æ/, // "SÆo" (latin-1 lido como UTF-8)
  /Ã[¡-ÿ]/, // Ã£ Ã© Ãª etc.
  /â\x80\x99|â\x80\x9c|â\x80\x9d/, // smart quotes que vazaram
];

const ACCENTED_REMOVED_REGEX = /[̀-ͯ]/g;

function safeString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeAscii(text) {
  return text.normalize("NFD").replace(ACCENTED_REMOVED_REGEX, "");
}

function slugifyName(name) {
  return normalizeAscii(safeString(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function suggestCanonicalSlug(name, state) {
  const namePart = slugifyName(name);
  const uf = safeString(state).toUpperCase();
  if (!namePart || !BRAZIL_UFS.has(uf)) return null;
  return `${namePart}-${uf.toLowerCase()}`;
}

function hasMojibake(text) {
  return MOJIBAKE_PATTERNS.some((re) => re.test(text));
}

/**
 * Severidade:
 *   - critical: dado inservível (slug ausente, state inválido).
 *   - high:     dado corrompido (mojibake, sufixo de slug incompatível).
 *   - medium:   dado inconsistente entre ads e cities.
 *   - low:      anomalia menor (espaço extra, capitalização).
 */
export function detectMalformedCity(row) {
  const issues = [];
  let severity = "ok";

  const name = safeString(row?.name);
  const slug = safeString(row?.slug);
  const state = safeString(row?.state);
  const cityId = row?.city_id == null ? null : Number(row.city_id);

  // Critical: slug ou state ausentes
  if (!slug) {
    issues.push({ code: "slug_missing", label: "Slug ausente" });
    severity = "critical";
  }
  if (!state) {
    issues.push({ code: "state_missing", label: "UF ausente" });
    severity = "critical";
  } else if (!/^[A-Za-z]{2}$/.test(state)) {
    issues.push({ code: "state_invalid_shape", label: `UF com formato inválido: '${state}'` });
    severity = "critical";
  } else if (!BRAZIL_UFS.has(state.toUpperCase())) {
    issues.push({ code: "state_not_brazil", label: `UF '${state}' não é UF brasileira válida` });
    severity = "critical";
  }

  // High: mojibake
  if (hasMojibake(name)) {
    issues.push({ code: "name_mojibake", label: `Nome com encoding corrompido: '${name}'` });
    severity = severity === "critical" ? "critical" : "high";
  }
  if (hasMojibake(slug)) {
    issues.push({ code: "slug_mojibake", label: `Slug com encoding corrompido: '${slug}'` });
    severity = severity === "critical" ? "critical" : "high";
  }

  // High: shape do slug
  if (slug && !SLUG_PATTERN.test(slug)) {
    issues.push({ code: "slug_invalid_chars", label: `Slug contém caracteres inválidos: '${slug}'` });
    severity = severity === "critical" ? "critical" : "high";
  }

  // High: sufixo do slug não bate com state declarado
  if (slug && state && BRAZIL_UFS.has(state.toUpperCase())) {
    const match = slug.match(SLUG_WITH_UF_PATTERN);
    if (match) {
      const suffix = match[2].toUpperCase();
      if (suffix !== state.toUpperCase()) {
        issues.push({
          code: "slug_state_mismatch",
          label: `Sufixo do slug ('${suffix}') diverge de state ('${state.toUpperCase()}')`,
        });
        severity = severity === "critical" ? "critical" : "high";
      }
    } else {
      issues.push({
        code: "slug_no_uf_suffix",
        label: `Slug '${slug}' não termina em '-uf' (esperado para cidades brasileiras)`,
      });
      severity = severity === "critical" ? "critical" : "high";
    }
  }

  // Medium: inconsistência ads vs cities
  const adState = safeString(row?.ad_state).toUpperCase();
  if (state && adState && BRAZIL_UFS.has(adState) && adState !== state.toUpperCase()) {
    issues.push({
      code: "ad_state_mismatch",
      label: `ads.state ('${adState}') diverge de cities.state ('${state.toUpperCase()}')`,
    });
    severity = severity === "ok" || severity === "low" ? "medium" : severity;
  }

  const adCity = safeString(row?.ad_city);
  if (name && adCity && adCity.toLowerCase() !== name.toLowerCase()) {
    issues.push({
      code: "ad_city_name_mismatch",
      label: `ads.city ('${adCity}') diverge de cities.name ('${name}')`,
    });
    severity = severity === "ok" || severity === "low" ? "medium" : severity;
  }

  // Medium: city_id null quando esperado
  if (cityId == null && row?.expect_city_id) {
    issues.push({ code: "city_id_missing", label: "ads.city_id ausente quando deveria estar setado" });
    severity = severity === "ok" || severity === "low" ? "medium" : severity;
  }

  // Low: anomalias estéticas
  if (name && /^\s|\s$/.test(safeString(row?.name))) {
    // safeString já fez trim — se houver diferença, é porque tinha espaço
  }
  if (name && /\s{2,}/.test(name)) {
    issues.push({ code: "name_double_space", label: "Nome com espaços duplicados" });
    if (severity === "ok") severity = "low";
  }

  const suggestedSlug = name && state ? suggestCanonicalSlug(name, state) : null;

  return {
    isMalformed: severity !== "ok",
    severity,
    issues,
    suggestedSlug,
    autoFixable: severity === "low" || severity === "medium",
  };
}

export const __INTERNAL__ = {
  BRAZIL_UFS,
  SLUG_PATTERN,
  SLUG_WITH_UF_PATTERN,
  hasMojibake,
  slugifyName,
};
