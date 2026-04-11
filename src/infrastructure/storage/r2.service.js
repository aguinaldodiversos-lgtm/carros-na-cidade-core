import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_REGION = "auto";
const DEFAULT_MAX_FILE_SIZE_BYTES = parsePositiveInt(
  process.env.VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
  10 * 1024 * 1024
);
const DEFAULT_MAX_FILES = parsePositiveInt(process.env.VEHICLE_IMAGE_MAX_FILES, 12);
const DEFAULT_CACHE_CONTROL =
  normalizeString(process.env.VEHICLE_IMAGE_CACHE_CONTROL) ||
  "public, max-age=31536000, stale-while-revalidate=86400";

const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

let cachedConfig = null;
let cachedClient = null;

function normalizeString(value) {
  return String(value ?? "").trim();
}

/**
 * Browsers and some OS MIME-sniffers send "image/jpg" or "image/x-jpg" instead of the
 * canonical "image/jpeg". Normalise before any validation so neither the multer filter
 * nor r2.service rejects a semantically valid JPEG file.
 *
 * This is the authoritative normalisation point for the backend path; the BFF also
 * normalises independently for the direct-R2 path.
 */
export function normalizeMimeType(mimeType) {
  const t = String(mimeType ?? "").trim().toLowerCase();
  if (t === "image/jpg" || t === "image/x-jpg" || t === "image/pjpeg") return "image/jpeg";
  return t;
}

/** Metadados x-amz-meta-* devem ser ASCII; nomes com acentos quebram o PutObject. */
function sanitizeS3MetadataValue(value, maxLen = 512) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, maxLen);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripTrailingSlashes(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function isHttpProtocol(protocol) {
  return protocol === "http:" || protocol === "https:";
}

function normalizeHttpUrl(value) {
  const raw = normalizeString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!isHttpProtocol(url.protocol)) return "";

    url.search = "";
    url.hash = "";

    const serialized = url.toString();
    return stripTrailingSlashes(serialized);
  } catch {
    return "";
  }
}

function getRequiredEnv(name) {
  const value = normalizeString(process.env[name]);
  if (!value) {
    throw new Error(`[r2] Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function buildDefaultEndpoint(accountId) {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2Config() {
  if (cachedConfig) return cachedConfig;

  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");

  const endpoint =
    normalizeHttpUrl(process.env.R2_ENDPOINT) || buildDefaultEndpoint(accountId);

  const region = normalizeString(process.env.AWS_REGION) || DEFAULT_REGION;
  const publicBaseUrl = normalizeHttpUrl(process.env.R2_PUBLIC_BASE_URL);

  cachedConfig = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
    publicBaseUrl,
  };

  return cachedConfig;
}

export function getR2Client() {
  if (cachedClient) return cachedClient;

  const config = getR2Config();

  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

function sanitizePathSegment(value, fallback = "item") {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function sanitizeFilenameStem(filename) {
  const stem = path.parse(String(filename ?? "")).name || "arquivo";
  return sanitizePathSegment(stem, "arquivo");
}

function normalizeVariant(value) {
  return sanitizePathSegment(value || "original", "original");
}

function normalizeVehicleId(vehicleId) {
  const normalized = sanitizePathSegment(vehicleId, "");
  if (!normalized) {
    throw new Error("[r2] vehicleId inválido.");
  }
  return normalized;
}

function normalizeStorageKey(key) {
  const normalized = String(key ?? "").trim().replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("[r2] storage key ausente.");
  }
  if (normalized.includes("..")) {
    throw new Error("[r2] storage key inválida.");
  }
  return normalized;
}

function getExtensionFromMimeType(mimeType, originalName = "") {
  const byMime = ALLOWED_IMAGE_MIME_TYPES.get(String(mimeType || "").toLowerCase());
  if (byMime) return byMime;

  const ext = path.extname(originalName).replace(".", "").toLowerCase();
  if (ext) return ext;

  return "bin";
}

function assertAllowedMimeType(mimeType) {
  const normalized = normalizeMimeType(String(mimeType ?? "").trim().toLowerCase());

  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalized)) {
    throw new Error(
      `[r2] Tipo de arquivo não permitido: ${mimeType || "desconhecido"}. Permitidos: ${[
        ...ALLOWED_IMAGE_MIME_TYPES.keys(),
      ].join(", ")}`
    );
  }

  return normalized;
}

function assertFileSize(sizeInBytes, maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES) {
  const size = Number(sizeInBytes);

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("[r2] Arquivo inválido ou vazio.");
  }

  if (size > maxBytes) {
    throw new Error(
      `[r2] Arquivo excede o limite permitido (${size} bytes > ${maxBytes} bytes).`
    );
  }

  return size;
}

async function fileLikeToBuffer(file) {
  if (!file) {
    throw new Error("[r2] Arquivo ausente.");
  }

  if (Buffer.isBuffer(file)) {
    return file;
  }

  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }

  if (file.buffer instanceof Uint8Array) {
    return Buffer.from(file.buffer);
  }

  if (file instanceof Uint8Array) {
    return Buffer.from(file);
  }

  if (file instanceof ArrayBuffer) {
    return Buffer.from(file);
  }

  if (typeof file.arrayBuffer === "function") {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("[r2] O arquivo precisa estar em memória (buffer).");
}

function getFileOriginalName(file) {
  return normalizeString(file?.originalname || file?.name || "arquivo");
}

function getFileMimeType(file) {
  return normalizeString(file?.mimetype || file?.mimeType);
}

function getFileSize(file, buffer) {
  return Number(file?.size ?? buffer?.length ?? 0);
}

export async function validateVehicleImageFile(
  file,
  { maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES } = {}
) {
  const buffer = await fileLikeToBuffer(file);
  const originalName = getFileOriginalName(file);
  const mimeType = assertAllowedMimeType(getFileMimeType(file));
  const size = assertFileSize(getFileSize(file, buffer), maxBytes);

  return {
    originalName,
    mimeType,
    size,
    buffer,
  };
}

export async function validateVehicleImageFiles(
  files,
  {
    maxFiles = DEFAULT_MAX_FILES,
    maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
  } = {}
) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("[r2] Nenhuma imagem enviada.");
  }

  if (files.length > maxFiles) {
    throw new Error(
      `[r2] Quantidade de imagens excede o limite permitido (${files.length} > ${maxFiles}).`
    );
  }

  return Promise.all(files.map((file) => validateVehicleImageFile(file, { maxBytes })));
}

export function generateVehicleImageKey({
  vehicleId,
  originalName,
  mimeType,
  variant = "original",
  now = new Date(),
}) {
  const safeVehicleId = normalizeVehicleId(vehicleId);
  const safeVariant = normalizeVariant(variant);
  const safeStem = sanitizeFilenameStem(originalName);
  const ext = getExtensionFromMimeType(mimeType, originalName);

  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uuid = crypto.randomUUID();

  return `vehicles/${safeVehicleId}/${safeVariant}/${year}/${month}/${uuid}-${safeStem}.${ext}`;
}

export function buildR2PublicUrl(key) {
  const { publicBaseUrl } = getR2Config();
  if (!publicBaseUrl) return "";

  const normalizedKey = normalizeStorageKey(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `${publicBaseUrl}/${normalizedKey}`;
}

function buildObjectMetadata({
  vehicleId,
  originalName,
  variant,
  sortOrder,
  isCover,
  uploadedByUserId,
}) {
  const metadata = {
    vehicle_id: sanitizeS3MetadataValue(String(vehicleId)),
    original_name: sanitizeS3MetadataValue(originalName || ""),
    variant: sanitizeS3MetadataValue(String(variant || "original"), 64),
    sort_order: String(Number.isFinite(sortOrder) ? sortOrder : 0),
    is_cover: String(Boolean(isCover)),
  };

  if (uploadedByUserId != null && uploadedByUserId !== "") {
    metadata.uploaded_by_user_id = sanitizeS3MetadataValue(String(uploadedByUserId));
  }

  return metadata;
}

export async function uploadVehicleImage({
  vehicleId,
  file,
  variant = "original",
  sortOrder = 0,
  isCover = false,
  uploadedByUserId = null,
  cacheControl = DEFAULT_CACHE_CONTROL,
}) {
  const client = getR2Client();
  const { bucketName } = getR2Config();

  const validated = await validateVehicleImageFile(file);

  const key = generateVehicleImageKey({
    vehicleId,
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    variant,
  });

  const metadata = buildObjectMetadata({
    vehicleId,
    originalName: validated.originalName,
    variant,
    sortOrder,
    isCover,
    uploadedByUserId,
  });

  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: validated.buffer,
      ContentType: validated.mimeType,
      ContentLength: validated.size,
      CacheControl: cacheControl,
      Metadata: metadata,
    })
  );

  return {
    provider: "cloudflare_r2",
    bucket: bucketName,
    key,
    variant: normalizeVariant(variant),
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    sizeBytes: validated.size,
    sortOrder: Number.isFinite(sortOrder) ? Number(sortOrder) : 0,
    isCover: Boolean(isCover),
    etag: result?.ETag ? String(result.ETag).replace(/"/g, "") : null,
    publicUrl: buildR2PublicUrl(key),
  };
}

export async function uploadVehicleImages({
  vehicleId,
  files,
  variant = "original",
  uploadedByUserId = null,
  coverIndex = 0,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
}) {
  await validateVehicleImageFiles(files, { maxFiles, maxBytes });

  const uploads = [];

  for (let index = 0; index < files.length; index += 1) {
    const upload = await uploadVehicleImage({
      vehicleId,
      file: files[index],
      variant,
      sortOrder: index,
      isCover: index === coverIndex,
      uploadedByUserId,
    });

    uploads.push(upload);
  }

  return uploads;
}

async function streamBodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);

  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body instanceof Readable || typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];

    for await (const chunk of body) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }

    return Buffer.concat(chunks);
  }

  throw new Error("[r2] Não foi possível converter o body retornado pelo R2 em Buffer.");
}

export async function readVehicleImage(key) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const safeKey = normalizeStorageKey(key);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    })
  );

  const buffer = await streamBodyToBuffer(response.Body);

  return {
    key: safeKey,
    buffer,
    contentType: response.ContentType || "application/octet-stream",
    contentLength:
      typeof response.ContentLength === "number" ? response.ContentLength : buffer.length,
    cacheControl: response.CacheControl || DEFAULT_CACHE_CONTROL,
    etag: response.ETag ? String(response.ETag).replace(/"/g, "") : null,
    lastModified: response.LastModified || null,
    metadata: response.Metadata || {},
  };
}

export async function headVehicleImage(key) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const safeKey = normalizeStorageKey(key);

  const response = await client.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    })
  );

  return {
    key: safeKey,
    contentType: response.ContentType || "application/octet-stream",
    contentLength:
      typeof response.ContentLength === "number" ? response.ContentLength : null,
    cacheControl: response.CacheControl || DEFAULT_CACHE_CONTROL,
    etag: response.ETag ? String(response.ETag).replace(/"/g, "") : null,
    lastModified: response.LastModified || null,
    metadata: response.Metadata || {},
  };
}

export async function removeVehicleImage(key) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const safeKey = normalizeStorageKey(key);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    })
  );

  return {
    removed: true,
    key: safeKey,
  };
}

export async function removeVehicleImages(keys = []) {
  const client = getR2Client();
  const { bucketName } = getR2Config();

  const normalizedKeys = Array.from(
    new Set(
      keys
        .map((key) => normalizeString(key))
        .filter(Boolean)
        .map((key) => normalizeStorageKey(key))
    )
  );

  if (normalizedKeys.length === 0) {
    return {
      removed: 0,
      keys: [],
    };
  }

  if (normalizedKeys.length === 1) {
    await removeVehicleImage(normalizedKeys[0]);
    return {
      removed: 1,
      keys: normalizedKeys,
    };
  }

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: normalizedKeys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    })
  );

  return {
    removed: normalizedKeys.length,
    keys: normalizedKeys,
  };
}

export function toVehicleImageRecord(upload, extra = {}) {
  return {
    storage_provider: "cloudflare_r2",
    storage_key: upload.key,
    image_url: upload.publicUrl || null,
    mime_type: upload.mimeType,
    size_bytes: upload.sizeBytes,
    sort_order: upload.sortOrder,
    is_cover: upload.isCover,
    original_name: upload.originalName,
    ...extra,
  };
}
