/**
 * Detector de problemas em imagens de anúncio.
 *
 * Função pura. Recebe `{ id, images }` onde images é o array JSONB da
 * coluna `ads.images` (URLs string), ou já parsed. Devolve:
 *   {
 *     isProblematic: boolean,
 *     severity: "critical" | "high" | "medium" | "low" | "ok",
 *     issues: Array<{ code, label, sampleIndex?, sampleUrl? }>
 *   }
 *
 * Severidades:
 *   - critical: anúncio ativo sem imagem (card vazio na vitrine).
 *   - high:     URL com schema inválido, mojibake, legacy /uploads sem
 *               migração R2.
 *   - medium:   placeholder na capa, duplicatas, todas URLs do Render
 *               (legacy storage), > 30 imagens (array enorme).
 *   - low:      whitespace em URL, formato de imagem desconhecido.
 *
 * NÃO faz HTTP — não verifica se a URL responde 200. Só shape/heurística.
 * O script chamador pode rodar HEAD/200-check em paralelo se quiser.
 */

const MAX_IMAGE_COUNT = 30;

const LEGACY_LOCAL_PATTERN = /^\/?uploads\/(ads|vehicles?)\//i;
const RENDER_DOMAIN_PATTERN = /\b[a-z0-9-]+\.onrender\.com\b/i;
const PLACEHOLDER_HINTS = /\b(placeholder|default[-_]?image|no[-_]?image|missing|fallback|no[-_]?photo)\b/i;
const KNOWN_GOOD_HOSTS = /\b(carros-?na-?cidade\.com|cdn\.cnc\.br|r2\.cloudflarestorage\.com|images\.cncar\.com\.br)\b/i;
const PROBABLE_IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp)(\?.*)?$/i;

const MOJIBAKE_RE = /Ã[¡-ÿ]|Æ/;

function safeUrl(value) {
  if (value == null) return "";
  return String(value).trim();
}

function isHttpAbsolute(url) {
  return /^https?:\/\//i.test(url);
}

function isRootRelative(url) {
  return url.startsWith("/");
}

function classifyUrl(url) {
  const codes = [];
  const labels = [];

  if (!url) {
    codes.push("url_empty");
    labels.push("URL vazia");
    return { codes, labels };
  }

  if (MOJIBAKE_RE.test(url)) {
    codes.push("url_mojibake");
    labels.push("URL com encoding corrompido");
  }

  if (LEGACY_LOCAL_PATTERN.test(url)) {
    codes.push("url_legacy_uploads");
    labels.push("URL aponta para /uploads/... legacy (não-R2)");
  }

  if (RENDER_DOMAIN_PATTERN.test(url)) {
    codes.push("url_render_storage");
    labels.push("URL hospedada em .onrender.com (legacy storage)");
  }

  if (PLACEHOLDER_HINTS.test(url)) {
    codes.push("url_placeholder");
    labels.push("URL parece placeholder/default");
  }

  if (!isHttpAbsolute(url) && !isRootRelative(url) && !url.startsWith("/api/")) {
    codes.push("url_malformed_scheme");
    labels.push(`URL com schema inválido: '${url.slice(0, 60)}'`);
  }

  if (isHttpAbsolute(url) && !PROBABLE_IMAGE_EXT.test(url) && !/\/api\/vehicle-images/i.test(url)) {
    // Pode ser legítima (presigned URL), mas merece sinalização leve.
    codes.push("url_no_image_ext");
    labels.push("URL sem extensão de imagem conhecida (verificar manualmente)");
  }

  if (/^\s|\s$/.test(safeUrl(url) === url ? "" : url)) {
    // safeUrl trim — se o original tinha whitespace, já passou pela validação anterior
  }

  return { codes, labels };
}

function severityRank(severity) {
  return { ok: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 0;
}

function mergeSeverity(current, incoming) {
  return severityRank(incoming) > severityRank(current) ? incoming : current;
}

export function detectImageIssues(ad) {
  const issues = [];
  let severity = "ok";

  let images = ad?.images;
  if (typeof images === "string") {
    // Banco às vezes retorna JSONB já como string em drivers velhos.
    try {
      images = JSON.parse(images);
    } catch {
      issues.push({ code: "images_unparseable", label: "Coluna images não é JSON parseável" });
      return { isProblematic: true, severity: "critical", issues };
    }
  }

  if (!Array.isArray(images) || images.length === 0) {
    issues.push({ code: "no_images", label: "Anúncio sem imagens" });
    return { isProblematic: true, severity: "critical", issues };
  }

  if (images.length > MAX_IMAGE_COUNT) {
    issues.push({
      code: "too_many_images",
      label: `Array com ${images.length} imagens (acima do recomendado: ${MAX_IMAGE_COUNT})`,
    });
    severity = mergeSeverity(severity, "medium");
  }

  // Duplicatas — strip `?query` por padrão para pegar "mesma URL com
  // cache buster". EXCEÇÃO: `/api/vehicle-images?...` usa a query como
  // identidade (id+v), então mantemos a query inteira para dedup.
  const seen = new Map();
  const duplicateIndices = [];
  images.forEach((raw, idx) => {
    const url = safeUrl(raw);
    if (!url) return;
    const isQueryIdentity = /\/api\/vehicle-images(?:\?|$)/i.test(url);
    const norm = (isQueryIdentity ? url : url.split("?")[0]).toLowerCase();
    if (seen.has(norm)) {
      duplicateIndices.push(idx);
    } else {
      seen.set(norm, idx);
    }
  });
  if (duplicateIndices.length > 0) {
    issues.push({
      code: "duplicate_images",
      label: `${duplicateIndices.length} imagem(ns) duplicada(s) — índices ${duplicateIndices.join(", ")}`,
    });
    severity = mergeSeverity(severity, "medium");
  }

  // Por-URL
  let coverIssued = false;
  images.forEach((raw, idx) => {
    const url = safeUrl(raw);
    const { codes, labels } = classifyUrl(url);

    codes.forEach((code, i) => {
      const isCover = idx === 0;
      const label = labels[i];

      let codeSeverity = "low";
      if (code === "url_legacy_uploads" || code === "url_malformed_scheme" || code === "url_mojibake") {
        codeSeverity = "high";
      } else if (code === "url_render_storage") {
        codeSeverity = "medium";
      } else if (code === "url_placeholder") {
        codeSeverity = isCover ? "high" : "medium";
        if (isCover) coverIssued = true;
      } else if (code === "url_no_image_ext") {
        codeSeverity = "low";
      }

      issues.push({
        code,
        label: `[${idx === 0 ? "capa" : `#${idx + 1}`}] ${label}`,
        sampleIndex: idx,
        sampleUrl: url.slice(0, 200),
      });
      severity = mergeSeverity(severity, codeSeverity);
    });
  });

  if (coverIssued) {
    issues.push({
      code: "cover_is_placeholder",
      label: "Capa do anúncio é placeholder — impacto direto na vitrine regional/cidade",
    });
    severity = mergeSeverity(severity, "high");
  }

  return {
    isProblematic: severity !== "ok",
    severity,
    issues,
  };
}

export const __INTERNAL__ = {
  MAX_IMAGE_COUNT,
  LEGACY_LOCAL_PATTERN,
  RENDER_DOMAIN_PATTERN,
  PLACEHOLDER_HINTS,
  KNOWN_GOOD_HOSTS,
  classifyUrl,
  severityRank,
};
