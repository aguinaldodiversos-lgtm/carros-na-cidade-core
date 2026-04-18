import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_MAX_FILE_SIZE_BYTES = toPositiveInt(
  process.env.VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
  10 * 1024 * 1024
);

const DEFAULT_MAX_FILES = toPositiveInt(process.env.VEHICLE_IMAGE_MAX_FILES, 12);

const DEFAULT_CACHE_CONTROL =
  process.env.VEHICLE_IMAGE_CACHE_CONTROL ||
  "public, max-age=31536000, stale-while-revalidate=86400";

const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

let cachedClient = null;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEnv(value) {
  return String(value ?? "").trim();
}

function ensureHttpUrl(value) {
  const normalized = normalizeEnv(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getR2Config() {
  const accountId = normalizeEnv(process.env.R2_ACCOUNT_ID);
  const accessKeyId = normalizeEnv(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = normalizeEnv(process.env.R2_SECRET_ACCESS_KEY);
  const bucketName = normalizeEnv(process.env.R2_BUCKET_NAME);
  const endpoint =
    ensureHttpUrl(process.env.R2_ENDPOINT) ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const region = normalizeEnv(process.env.AWS_REGION) || "auto";
  const publicBaseUrl = ensureHttpUrl(process.env.R2_PUBLIC_BASE_URL);

  const missing = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucketName) missing.push("R2_BUCKET_NAME");
  if (!endpoint) missing.push("R2_ENDPOINT");

  if (missing.length > 0) {
    throw new Error(
      `[r2] Variáveis ausentes: ${missing.join(", ")}. Verifique a configuração do Cloudflare R2.`
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
    publicBaseUrl,
  };
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
  const variant = sanitizePathSegment(value || "original", "original");
  return variant;
}

function getExtensionFromMimeType(mimeType, originalName = "") {
  const byMime = ALLOWED_IMAGE_MIME_TYPES.get(String(mimeType || "").toLowerCase());
  if (byMime) return byMime;

  const originalExt = path.extname(originalName).replace(".", "").toLowerCase();
  if (originalExt) return originalExt;

  return "bin";
}

function assertVehicleId(vehicleId) {
  const normalized = sanitizePathSegment(vehicleId, "");
  if (!normalized) {
    throw new Error("[r2] vehicleId inválido para geração de chave.");
  }
  return normalized;
}

function assertStorageKey(key) {
  const normalized = String(key ?? "")
    .trim()
    .replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("[r2] storage key ausente.");
  }

  if (normalized.includes("..")) {
    throw new Error("[r2] storage key inválida.");
  }

  return normalized;
}

function assertAllowedMimeType(mimeType) {
  const normalized = String(mimeType ?? "")
    .toLowerCase()
    .trim();
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
    throw new Error(`[r2] Arquivo excede o limite permitido (${size} bytes > ${maxBytes} bytes).`);
  }

  return size;
}

function isReadableStream(value) {
  return value instanceof Readable;
}

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);

  if (typeof stream.transformToByteArray === "function") {
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (isReadableStream(stream) || typeof stream[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
      else chunks.push(Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("[r2] Não foi possível converter o body em Buffer.");
}

function extractFileBuffer(file) {
  if (!file) {
    throw new Error("[r2] Arquivo ausente.");
  }

  if (Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }

  if (file.buffer instanceof Uint8Array) {
    return Buffer.from(file.buffer);
  }

  if (Buffer.isBuffer(file)) {
    return file;
  }

  throw new Error("[r2] O arquivo precisa estar em memória (buffer).");
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
    vehicle_id: String(vehicleId),
    original_name: String(originalName || ""),
    variant: String(variant || "original"),
    sort_order: String(Number.isFinite(sortOrder) ? sortOrder : 0),
    is_cover: String(Boolean(isCover)),
  };

  if (uploadedByUserId != null && uploadedByUserId !== "") {
    metadata.uploaded_by_user_id = String(uploadedByUserId);
  }

  return metadata;
}

export function validateVehicleImageFile(file, { maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES } = {}) {
  const originalName = String(file?.originalname || file?.name || "arquivo").trim();
  const mimeType = assertAllowedMimeType(file?.mimetype || file?.mimeType);
  const buffer = extractFileBuffer(file);
  const size = assertFileSize(file?.size ?? buffer.length, maxBytes);

  return {
    originalName,
    mimeType,
    buffer,
    size,
  };
}

export function validateVehicleImageFiles(
  files,
  { maxFiles = DEFAULT_MAX_FILES, maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES } = {}
) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("[r2] Nenhuma imagem enviada.");
  }

  if (files.length > maxFiles) {
    throw new Error(
      `[r2] Quantidade de imagens excede o limite permitido (${files.length} > ${maxFiles}).`
    );
  }

  return files.map((file) => validateVehicleImageFile(file, { maxBytes }));
}

export function buildVehicleImagePrefix({ vehicleId, variant = "original" }) {
  const safeVehicleId = assertVehicleId(vehicleId);
  const safeVariant = normalizeVariant(variant);
  return `vehicles/${safeVehicleId}/${safeVariant}/`;
}

export function generateVehicleImageKey({
  vehicleId,
  originalName,
  mimeType,
  variant = "original",
  now = new Date(),
}) {
  const safeVehicleId = assertVehicleId(vehicleId);
  const safeVariant = normalizeVariant(variant);
  const safeStem = sanitizeFilenameStem(originalName);
  const ext = getExtensionFromMimeType(mimeType, originalName);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const randomId = crypto.randomUUID();

  return `vehicles/${safeVehicleId}/${safeVariant}/${year}/${month}/${randomId}-${safeStem}.${ext}`;
}

export function buildR2PublicUrl(key) {
  const { publicBaseUrl } = getR2Config();
  if (!publicBaseUrl) return "";

  const normalizedKey = assertStorageKey(key).split("/").map(encodeURIComponent).join("/");

  return `${publicBaseUrl}/${normalizedKey}`;
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

  const validated = validateVehicleImageFile(file);
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

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: validated.buffer,
    ContentType: validated.mimeType,
    ContentLength: validated.size,
    CacheControl: cacheControl,
    Metadata: metadata,
  });

  const result = await client.send(command);

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
  const validatedFiles = validateVehicleImageFiles(files, { maxFiles, maxBytes });
  const uploads = [];

  for (let index = 0; index < validatedFiles.length; index += 1) {
    const originalFile = files[index];
    const upload = await uploadVehicleImage({
      vehicleId,
      file: originalFile,
      variant,
      sortOrder: index,
      isCover: index === coverIndex,
      uploadedByUserId,
    });

    uploads.push(upload);
  }

  return uploads;
}

export async function readVehicleImage(key) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const safeKey = assertStorageKey(key);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    })
  );

  const buffer = await streamToBuffer(response.Body);

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
  const safeKey = assertStorageKey(key);

  const response = await client.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: safeKey,
    })
  );

  return {
    key: safeKey,
    contentType: response.ContentType || "application/octet-stream",
    contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null,
    cacheControl: response.CacheControl || DEFAULT_CACHE_CONTROL,
    etag: response.ETag ? String(response.ETag).replace(/"/g, "") : null,
    lastModified: response.LastModified || null,
    metadata: response.Metadata || {},
  };
}

export async function removeVehicleImage(key) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const safeKey = assertStorageKey(key);

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
        .map((key) => String(key || "").trim())
        .filter(Boolean)
        .map((key) => assertStorageKey(key))
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

export async function listVehicleImagesByPrefix({ vehicleId, variant = "original" }) {
  const client = getR2Client();
  const { bucketName } = getR2Config();
  const prefix = buildVehicleImagePrefix({ vehicleId, variant });

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    })
  );

  const items = Array.isArray(response.Contents) ? response.Contents : [];

  return items.map((item) => ({
    key: item.Key,
    sizeBytes: typeof item.Size === "number" ? item.Size : null,
    etag: item.ETag ? String(item.ETag).replace(/"/g, "") : null,
    lastModified: item.LastModified || null,
  }));
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
