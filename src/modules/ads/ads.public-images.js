import db from "../../infrastructure/database/db.js";
import { buildR2PublicUrl } from "../../infrastructure/storage/r2.service.js";

const LEGACY_UPLOADS_PREFIX = /^\/?uploads\/ads\//i;
const STORAGE_KEY_PREFIX = /^vehicles\//i;

let vehicleImagesProfilePromise = null;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function toForwardSlashes(value) {
  return normalizeString(value).replace(/\\/g, "/");
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeString(value));
}

function isLegacyUploadPath(value) {
  return LEGACY_UPLOADS_PREFIX.test(toForwardSlashes(value));
}

function isRelativeProxyPath(value) {
  return normalizeString(value).startsWith("/api/vehicle-images?");
}

function isFrontendStaticImage(value) {
  return normalizeString(value).startsWith("/images/");
}

function looksLikeStorageKey(value) {
  return STORAGE_KEY_PREFIX.test(toForwardSlashes(value));
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildVehicleImageProxyUrl(key) {
  return `/api/vehicle-images?key=${encodeURIComponent(normalizeString(key))}`;
}

/** Mesmo contrato do portal Next (`/api/vehicle-images?src=`) para caminhos `/uploads/...`. */
function buildVehicleImageProxyUrlFromSrc(uploadPath) {
  const normalized = toForwardSlashes(uploadPath);
  if (!normalized) return null;
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `/api/vehicle-images?src=${encodeURIComponent(withLeadingSlash)}`;
}

/**
 * Detecta proxy gerado a partir de legado `/uploads/ads/...` (para poder omitir quando há fontes melhores).
 */
function isLegacyProxySrcUrl(value) {
  const raw = normalizeString(value);
  if (!raw.startsWith("/api/vehicle-images?")) return false;

  try {
    const params = new URLSearchParams(raw.split("?")[1] || "");
    const src = params.get("src");
    if (!src) return false;
    return isLegacyUploadPath(decodeURIComponent(src));
  } catch {
    return false;
  }
}

export function buildCanonicalImageUrlFromStorageKey(key) {
  const normalizedKey = toForwardSlashes(key).replace(/^\/+/, "");
  if (!normalizedKey) return null;

  try {
    const publicUrl = buildR2PublicUrl(normalizedKey);
    if (publicUrl) return publicUrl;
  } catch {
    // fallback para proxy mesmo sem R2_PUBLIC_BASE_URL ou config completa
  }

  return buildVehicleImageProxyUrl(normalizedKey);
}

export function normalizePublicImageCandidate(value) {
  const normalized = toForwardSlashes(value);
  if (!normalized) return null;

  if (isRelativeProxyPath(normalized)) return normalized;
  if (isAbsoluteHttpUrl(normalized)) return normalized;
  if (isFrontendStaticImage(normalized)) return normalized;
  if (looksLikeStorageKey(normalized)) return buildCanonicalImageUrlFromStorageKey(normalized);

  // Legado em disco local: não servimos mais direto na API em produção típica (Render efêmero),
  // mas devolvemos a URL do proxy canônico do portal para o mesmo contrato do detalhe/listagem.
  if (isLegacyUploadPath(normalized)) {
    return buildVehicleImageProxyUrlFromSrc(normalized);
  }

  return null;
}

function extractImageCandidates(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImageCandidates(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return extractImageCandidates(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }

    return [trimmed];
  }

  if (typeof value === "object") {
    return [
      value.url,
      value.image_url,
      value.imageUrl,
      value.src,
      value.storage_key,
      value.storageKey,
      value.loc,
    ].flatMap((item) => extractImageCandidates(item));
  }

  return [];
}

export function buildNormalizedPublicImages(row, vehicleImageRows = []) {
  const canonicalVehicleImages = vehicleImageRows
    .map((image) => {
      const key = normalizeString(image.storage_key);
      if (key) {
        const fromKey = buildCanonicalImageUrlFromStorageKey(key);
        if (fromKey) return fromKey;
      }

      return normalizePublicImageCandidate(image.image_url);
    })
    .filter(Boolean);

  if (canonicalVehicleImages.length > 0) {
    return uniqueStrings(canonicalVehicleImages);
  }

  const rawCandidates = extractImageCandidates(row?.images);
  if (row?.image_url != null) {
    rawCandidates.unshift(row.image_url);
  }

  const normalizedRawCandidates = rawCandidates
    .map((candidate) => normalizePublicImageCandidate(candidate))
    .filter(Boolean);

  const hasNonLegacy = normalizedRawCandidates.some((url) => !isLegacyProxySrcUrl(url));
  const merged = hasNonLegacy
    ? normalizedRawCandidates.filter((url) => !isLegacyProxySrcUrl(url))
    : normalizedRawCandidates;

  return uniqueStrings(merged);
}

async function getVehicleImagesProfile() {
  if (vehicleImagesProfilePromise) {
    return vehicleImagesProfilePromise;
  }

  vehicleImagesProfilePromise = (async () => {
    const tableResult = await db.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'vehicle_images'
        LIMIT 1
      `
    );

    if (tableResult.rowCount === 0) {
      return {
        exists: false,
      };
    }

    const columnsResult = await db.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicle_images'
      `
    );

    const columns = new Set(columnsResult.rows.map((row) => String(row.column_name || "").trim()));

    const hasIsCover = columns.has("is_cover");
    const hasSortOrder = columns.has("sort_order");
    const hasCreatedAt = columns.has("created_at");
    const orderByParts = ["ad_id ASC"];

    if (hasIsCover) orderByParts.push("is_cover DESC");
    if (hasSortOrder) orderByParts.push("sort_order ASC NULLS LAST");
    if (hasCreatedAt) orderByParts.push("created_at ASC NULLS LAST");

    return {
      exists: true,
      linkColumn: columns.has("ad_id") ? "ad_id" : null,
      hasImageUrl: columns.has("image_url"),
      hasStorageKey: columns.has("storage_key"),
      orderBy: `ORDER BY ${orderByParts.join(", ")}`,
    };
  })().catch((error) => {
    vehicleImagesProfilePromise = null;
    throw error;
  });

  return vehicleImagesProfilePromise;
}

export async function listVehicleImagesByAdIds(adIds) {
  const normalizedIds = Array.from(
    new Set(
      adIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const profile = await getVehicleImagesProfile();
  if (!profile.exists || !profile.linkColumn || (!profile.hasImageUrl && !profile.hasStorageKey)) {
    return new Map();
  }

  const imageUrlColumn = profile.hasImageUrl ? "image_url" : "NULL::text AS image_url";
  const storageKeyColumn = profile.hasStorageKey ? "storage_key" : "NULL::text AS storage_key";

  const { rows } = await db.query(
    `
      SELECT
        ${profile.linkColumn} AS ad_id,
        ${imageUrlColumn},
        ${storageKeyColumn}
      FROM public.vehicle_images
      WHERE ${profile.linkColumn} = ANY($1::bigint[])
      ${profile.orderBy}
    `,
    [normalizedIds]
  );

  const map = new Map();

  for (const row of rows) {
    const adId = Number(row.ad_id);
    if (!Number.isInteger(adId) || adId <= 0) continue;

    const current = map.get(adId) || [];
    current.push({
      image_url: normalizeString(row.image_url),
      storage_key: normalizeString(row.storage_key),
    });
    map.set(adId, current);
  }

  return map;
}

export async function normalizePublicAdRow(row) {
  if (!row || typeof row !== "object") return row;

  const imagesByAdId = await listVehicleImagesByAdIds([row.id]);
  const normalizedImages = buildNormalizedPublicImages(row, imagesByAdId.get(Number(row.id)) || []);

  return {
    ...row,
    images: normalizedImages,
    image_url: normalizedImages[0] || null,
  };
}

export async function normalizePublicAdRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const imagesByAdId = await listVehicleImagesByAdIds(rows.map((row) => row?.id));

  return rows.map((row) => {
    const normalizedImages = buildNormalizedPublicImages(
      row,
      imagesByAdId.get(Number(row?.id)) || []
    );

    return {
      ...row,
      images: normalizedImages,
      image_url: normalizedImages[0] || null,
    };
  });
}
