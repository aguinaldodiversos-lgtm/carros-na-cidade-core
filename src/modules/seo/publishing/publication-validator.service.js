const TITLE_MIN = 18;
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 180;
const CONTENT_MIN = 700;

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value) {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

function buildExcerpt(content) {
  const clean = normalizeText(content);
  if (!clean) return null;
  return clean.slice(0, 157) + (clean.length > 157 ? "..." : "");
}

function pathLooksValid(path) {
  return /^\/[a-z0-9\-_/]+$/i.test(String(path || ""));
}

export function validatePublicationPayload(payload) {
  const issues = [];
  const warnings = [];

  const path = normalizeText(payload.path);
  const title = normalizeText(payload.title);
  const content = normalizeText(payload.content);
  const excerpt = normalizeText(payload.excerpt || buildExcerpt(content));

  if (!path || !pathLooksValid(path)) {
    issues.push("invalid_path");
  }

  if (!title || title.length < TITLE_MIN) {
    issues.push("title_too_short");
  }

  if (title.length > TITLE_MAX) {
    warnings.push("title_too_long");
  }

  if (!content || countWords(content) < CONTENT_MIN / 5) {
    issues.push("content_too_short");
  }

  if (excerpt && excerpt.length > DESCRIPTION_MAX) {
    warnings.push("excerpt_too_long");
  }

  if (!/<h1>|# /i.test(content)) {
    warnings.push("missing_h1_signal");
  }

  if (!/faq|perguntas frequentes/i.test(content)) {
    warnings.push("missing_faq_signal");
  }

  const score = 100 - issues.length * 25 - warnings.length * 5;

  return {
    ok: issues.length === 0,
    score: Math.max(0, score),
    issues,
    warnings,
    normalized: {
      ...payload,
      path,
      title,
      content,
      excerpt: excerpt || null,
      is_indexable: issues.length === 0,
      health_status: issues.length === 0 ? "healthy" : "needs_review",
    },
  };
}
