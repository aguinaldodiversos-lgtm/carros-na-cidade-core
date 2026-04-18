/**
 * Helpers para auditoria e migração de imagens legadas `/uploads/ads/...` → R2.
 * Sem efeitos colaterais de rede/DB — testável em isolamento.
 */

import fs from "node:fs";
import path from "node:path";

export const LEGACY_UPLOADS_ADS = /^\/?uploads\/ads\//i;

export function toForwardSlashes(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/");
}

export function normalizeLegacyUploadPath(raw) {
  const s = toForwardSlashes(raw);
  if (!s) return "";
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  if (!LEGACY_UPLOADS_ADS.test(withSlash)) return "";
  return path.posix.normalize(withSlash.split("\\").join("/"));
}

export function isLegacyUploadPathString(value) {
  return LEGACY_UPLOADS_ADS.test(toForwardSlashes(value));
}

export function isCanonicalAdImageUrl(value) {
  const n = toForwardSlashes(value);
  if (!n) return false;
  if (/^https?:\/\//i.test(n)) return true;
  if (n.startsWith("/api/vehicle-images?")) return true;
  if (n.startsWith("/images/")) return true;
  if (/^vehicles\//i.test(n)) return true;
  return false;
}

export function parseImagesJson(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (!rawValue) return [];

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseImagesJson(parsed);
    } catch {
      return [trimmed];
    }
  }

  return [];
}

/** Extensões aceitas pelo pipeline R2 (alinhado a r2.service). */
const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

export function guessMimeFromFilename(filename) {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return EXT_TO_MIME[ext] || "";
}

/**
 * Candidatos de diretório raiz onde `uploads/ads/...` pode existir.
 */
export function buildDefaultUploadsRoots(cwd = process.cwd()) {
  const fromEnv = process.env.UPLOADS_ROOT?.trim();
  const roots = [];
  if (fromEnv) roots.push(path.resolve(fromEnv));
  roots.push(path.join(cwd, "uploads"));
  roots.push(path.join(cwd, "..", "uploads"));
  roots.push(path.join(cwd, "public", "uploads"));
  return Array.from(new Set(roots));
}

/**
 * Resolve caminho absoluto do ficheiro legado no disco local.
 * @returns {string|null}
 */
export function resolveLegacyFileOnDisk(legacyPath, extraRoots = []) {
  const normalized = normalizeLegacyUploadPath(legacyPath);
  if (!normalized) return null;

  const relativeFromUploads = normalized.replace(/^\/uploads\//i, "");

  const roots = [...extraRoots, ...buildDefaultUploadsRoots()];

  for (const root of roots) {
    const abs = path.join(root, relativeFromUploads);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function fileLikeFromBuffer(buffer, mimetype, originalName) {
  return {
    buffer,
    mimetype,
    originalname: originalName,
    originalName,
    size: buffer.length,
  };
}

/**
 * Categorização para relatório de auditoria.
 * @param {object} opts
 * @param {boolean} opts.hasStorageKeyInVehicleImages
 * @param {boolean} opts.hasLegacyInAdsJson
 * @param {boolean} opts.hasLegacyInVehicleImageUrl
 * @param {boolean} [opts.hasBinaryAvailable] - quando informado, permite distinguir migratable de orphan
 * @returns {"already_migrated"|"migratable"|"orphan"|"inconsistent"|"migratable_or_orphan"|"ok"}
 */
export function classifyAdImageState({
  hasStorageKeyInVehicleImages,
  hasLegacyInAdsJson,
  hasLegacyInVehicleImageUrl,
  hasBinaryAvailable,
}) {
  if (hasStorageKeyInVehicleImages && !hasLegacyInAdsJson && !hasLegacyInVehicleImageUrl) {
    return "already_migrated";
  }
  if (hasLegacyInAdsJson || hasLegacyInVehicleImageUrl) {
    if (hasStorageKeyInVehicleImages && !hasLegacyInAdsJson) {
      return "inconsistent";
    }
    if (hasBinaryAvailable === true) return "migratable";
    if (hasBinaryAvailable === false) return "orphan";
    return "migratable_or_orphan";
  }
  return "ok";
}

const ORPHAN_SUGGESTED_ACTIONS = {
  file_not_found: "reupload_manual_or_remove_reference",
  unsupported_extension: "convert_and_reupload_or_remove",
  inconsistent_metadata: "inspect_and_fix_metadata",
  source_unreachable: "retry_later_or_reupload_manual",
  vehicle_images_row_file_not_found: "reupload_manual_or_cleanup_row",
};

export function suggestOrphanAction(reason) {
  return ORPHAN_SUGGESTED_ACTIONS[reason] || "manual_inspection";
}
