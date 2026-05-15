/**
 * Detector de anúncio de teste / artificial.
 *
 * Função pura sem dependência de DB ou rede. Recebe um row de `ads`
 * (com colunas básicas — title, slug, brand, model, version,
 * description, created_at) e devolve uma classificação:
 *
 *   {
 *     isSuspect: boolean,
 *     confidence: "high" | "medium" | "low",
 *     reasons: string[],   // tokens curtos: "title:DeployModel", "slug:test-..."
 *     reasonLabels: string[]  // labels legíveis: "Título contém 'DeployModel'"
 *   }
 *
 * Princípio: SEM falsos positivos altos. Quando algo é apenas suspeito
 * (ex.: título muito curto, mas a marca/modelo são reais), classificamos
 * como `low` para revisão manual em vez de auto-flag agressivo.
 *
 * Convenção de reasons: `<campo>:<padrão>`.
 */

/**
 * Padrões em ordem de severidade decrescente:
 *
 *   - HIGH:   sinais inequívocos de automation/teste (DeployModel, fila
 *             worker, lorem ipsum estendido).
 *   - MEDIUM: palavras "teste/demo/exemplo" claras em campos-chave.
 *   - LOW:    heurísticas frágeis (título muito curto, slug genérico).
 */

// Sem `\b` no fim de 'deploymodel' — `\b` exige fronteira entre word-char e
// non-word-char, e em 'DeployModel1775172829' a fronteira não existe entre
// 'l' e '1'. Como 'deploymodel' é uma string deliberada interna, match em
// qualquer posição é seguro (não há falso positivo plausível).
const HIGH_TITLE_PATTERNS = [
  { re: /deploymodel/i, label: "Título contém 'DeployModel' (automation)" },
  { re: /\bfila\s*worker\b/i, label: "Título menciona 'fila worker'" },
  { re: /\balerta\b.*\b(test|teste|automatic|smoke)\b/i, label: "Título de alerta automatizado" },
  { re: /\blorem\s+ipsum\b/i, label: "Título com lorem ipsum" },
  { re: /\bsmoke[\s_-]?test\b/i, label: "Título de smoke test" },
  { re: /\be2e[\s_-]?test\b/i, label: "Título de teste e2e" },
];

const MEDIUM_TITLE_PATTERNS = [
  { re: /^teste\b/i, label: "Título começa com 'teste'" },
  { re: /^test\b/i, label: "Título começa com 'test'" },
  { re: /\b(test|teste|mock|fake|demo|exemplo|seed|dummy)\b/i, label: "Título contém palavra de teste" },
];

const HIGH_SLUG_PATTERNS = [
  { re: /^(test|teste|mock|fake|demo|seed|dummy|deploy)[-_]/i, label: "Slug começa com prefixo de teste" },
  { re: /deploymodel/i, label: "Slug contém 'deploymodel'" },
  { re: /\d{10,}/, label: "Slug contém timestamp/ID artificial" },
];

const HIGH_MODEL_PATTERNS = [
  { re: /^deploymodel/i, label: "Modelo é 'DeployModel'" },
  { re: /^(test|teste|mock|fake|demo|exemplo)$/i, label: "Modelo é palavra de teste pura" },
];

const HIGH_DESCRIPTION_PATTERNS = [
  { re: /\blorem\s+ipsum\s+dolor\b/i, label: "Descrição lorem ipsum" },
  { re: /\binserir\s+descri[çc][ãa]o\s+aqui\b/i, label: "Descrição é placeholder editorial" },
  { re: /\bplaceholder\b.*\bdescription\b/i, label: "Descrição com placeholder explícito" },
];

const TITLE_MIN_REAL_LEN = 8;

function safeString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function matchPatterns(text, patterns, field) {
  const reasons = [];
  const reasonLabels = [];
  for (const { re, label } of patterns) {
    if (re.test(text)) {
      reasons.push(`${field}:${re.source}`);
      reasonLabels.push(label);
    }
  }
  return { reasons, reasonLabels };
}

export function detectTestAd(ad) {
  const reasons = [];
  const reasonLabels = [];
  let severity = 0; // 0=clean, 1=low, 2=medium, 3=high

  const title = safeString(ad?.title);
  const slug = safeString(ad?.slug);
  const brand = safeString(ad?.brand);
  const model = safeString(ad?.model);
  const version = safeString(ad?.version);
  const description = safeString(ad?.description);

  // HIGH severity hits
  for (const list of [HIGH_TITLE_PATTERNS]) {
    const m = matchPatterns(title, list, "title");
    if (m.reasons.length > 0) {
      reasons.push(...m.reasons);
      reasonLabels.push(...m.reasonLabels);
      severity = Math.max(severity, 3);
    }
  }

  {
    const m = matchPatterns(slug, HIGH_SLUG_PATTERNS, "slug");
    if (m.reasons.length > 0) {
      reasons.push(...m.reasons);
      reasonLabels.push(...m.reasonLabels);
      severity = Math.max(severity, 3);
    }
  }

  for (const field of [
    { value: model, list: HIGH_MODEL_PATTERNS, name: "model" },
    { value: version, list: HIGH_MODEL_PATTERNS, name: "version" },
  ]) {
    const m = matchPatterns(field.value, field.list, field.name);
    if (m.reasons.length > 0) {
      reasons.push(...m.reasons);
      reasonLabels.push(...m.reasonLabels);
      severity = Math.max(severity, 3);
    }
  }

  {
    const m = matchPatterns(description, HIGH_DESCRIPTION_PATTERNS, "description");
    if (m.reasons.length > 0) {
      reasons.push(...m.reasons);
      reasonLabels.push(...m.reasonLabels);
      severity = Math.max(severity, 3);
    }
  }

  // MEDIUM severity (só conta se ainda não chegou em high)
  if (severity < 3) {
    const m = matchPatterns(title, MEDIUM_TITLE_PATTERNS, "title");
    if (m.reasons.length > 0) {
      reasons.push(...m.reasons);
      reasonLabels.push(...m.reasonLabels);
      severity = Math.max(severity, 2);
    }
  }

  // LOW severity heurísticas (gatilhos fracos — revisão manual)
  if (severity === 0) {
    if (title && title.length < TITLE_MIN_REAL_LEN) {
      reasons.push("title:too-short");
      reasonLabels.push(`Título muito curto (${title.length} chars)`);
      severity = Math.max(severity, 1);
    }
    if (title && brand && title.toLowerCase() === brand.toLowerCase()) {
      reasons.push("title:equals-brand");
      reasonLabels.push("Título é exatamente igual à marca (sem modelo)");
      severity = Math.max(severity, 1);
    }
    if (description && /^\.{3,}$|^[a-z]{1,3}$/.test(description.trim())) {
      reasons.push("description:trivial");
      reasonLabels.push("Descrição trivial (pontos ou texto curtíssimo)");
      severity = Math.max(severity, 1);
    }
  }

  const confidence = severity === 3 ? "high" : severity === 2 ? "medium" : severity === 1 ? "low" : "none";
  return {
    isSuspect: severity > 0,
    confidence,
    reasons,
    reasonLabels,
  };
}

export const __INTERNAL_PATTERNS__ = {
  HIGH_TITLE_PATTERNS,
  MEDIUM_TITLE_PATTERNS,
  HIGH_SLUG_PATTERNS,
  HIGH_MODEL_PATTERNS,
  HIGH_DESCRIPTION_PATTERNS,
  TITLE_MIN_REAL_LEN,
};
