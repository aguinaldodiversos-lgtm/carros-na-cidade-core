import crypto from "node:crypto";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sanitizeS3MetadataValue } from "@/lib/painel/s3-metadata-sanitize";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 24;
const CACHE_CONTROL = "public, max-age=31536000, stale-while-revalidate=86400";

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

/** Normaliza MIME para corresponder às chaves de ALLOWED_MIME (ex.: image/jpg → image/jpeg). */
function normalizeMimeForR2Filter(raw: string): string {
  const t = (raw || "").trim().toLowerCase();
  if (t === "image/jpg" || t === "image/x-jpg") return "image/jpeg";
  if (t === "image/pjpeg") return "image/jpeg";
  return t;
}

type R2Cfg = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
};

let _cfg: R2Cfg | null | undefined;
let _client: S3Client | null = null;

function loadConfig(): R2Cfg | null {
  if (_cfg !== undefined) return _cfg;

  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucketName = env("R2_BUCKET_NAME");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.warn("[r2-bff] R2 não configurado. Variáveis ausentes:", {
      R2_ACCOUNT_ID: accountId ? "OK" : "AUSENTE",
      R2_ACCESS_KEY_ID: accessKeyId ? "OK" : "AUSENTE",
      R2_SECRET_ACCESS_KEY: secretAccessKey ? "OK" : "AUSENTE",
      R2_BUCKET_NAME: bucketName ? "OK" : "AUSENTE",
    });
    _cfg = null;
    return null;
  }

  let endpoint = env("R2_ENDPOINT");
  if (!endpoint) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  let publicBaseUrl = env("R2_PUBLIC_BASE_URL");
  if (publicBaseUrl) {
    publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
  }

  _cfg = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region: env("AWS_REGION") || "auto",
    publicBaseUrl,
  };
  return _cfg;
}

function getClient(): S3Client | null {
  const cfg = loadConfig();
  if (!cfg) return null;
  if (_client) return _client;

  _client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    // R2 does not support virtual-hosted-style bucket URLs; path-style is mandatory.
    // Without this flag the SDK rewrites the host to <bucket>.account.r2.cloudflarestorage.com
    // and the computed signature no longer matches, returning SignatureDoesNotMatch / 403.
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

function sanitize(value: string, fallback = "item"): string {
  const n = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase();
  return n || fallback;
}

function publicUrl(cfg: R2Cfg, key: string): string {
  if (!cfg.publicBaseUrl) return "";
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${cfg.publicBaseUrl}/${encoded}`;
}

/** Returns true when all required R2 environment variables are present. */
export function isR2ConfiguredInBff(): boolean {
  return loadConfig() !== null;
}

/**
 * Uploads Web API `File` objects directly to Cloudflare R2 from the BFF
 * (server-side Next.js route handler). Bypasses the Express backend entirely.
 *
 * Each file is placed under `vehicles/<draftId>/original/<year>/<month>/<uuid>-<stem>.<ext>`.
 * Returns an array of public URLs (or proxy fallback URLs).
 */
export async function uploadDraftPhotosDirectR2(files: File[], userId: string): Promise<string[]> {
  const cfg = loadConfig();
  const client = getClient();
  if (!cfg || !client) {
    throw new Error("R2 not configured in BFF environment.");
  }

  const valid = files
    .filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES)
    .filter((f) => ALLOWED_MIME[normalizeMimeForR2Filter(f.type)])
    .slice(0, MAX_FILES);

  if (valid.length === 0) return [];

  const draftId = `publish-${sanitize(userId)}-${crypto.randomUUID()}`;
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  const urls: string[] = [];

  for (let i = 0; i < valid.length; i++) {
    const file = valid[i];
    const mime = normalizeMimeForR2Filter(file.type);
    const ext = ALLOWED_MIME[mime] || "jpg";
    const stem = sanitize(path.parse(file.name || "foto").name || "foto", "foto");
    const uuid = crypto.randomUUID();
    const key = `vehicles/${draftId}/original/${year}/${month}/${uuid}-${stem}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mime,
        ContentLength: buffer.length,
        CacheControl: CACHE_CONTROL,
        Metadata: {
          vehicle_id: draftId,
          original_name: sanitizeS3MetadataValue(file.name || "foto"),
          variant: "original",
          sort_order: String(i),
          is_cover: String(i === 0),
          uploaded_by_user_id: sanitizeS3MetadataValue(userId),
        },
      })
    );

    const pub = publicUrl(cfg, key);
    urls.push(pub || `/api/vehicle-images?key=${encodeURIComponent(key)}`);
  }

  return urls;
}

/**
 * Reads an image directly from R2 using the BFF-side S3 client.
 * Used as fallback by the vehicle-images proxy when the backend is unreachable.
 */
export async function readImageFromR2Direct(
  storageKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cfg = loadConfig();
  const client = getClient();
  if (!cfg || !client) return null;

  const normalized = storageKey.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return null;

  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: cfg.bucketName, Key: normalized })
    );

    const body = result.Body;
    if (!body) return null;

    let buffer: Buffer;
    if (typeof (body as any).transformToByteArray === "function") {
      buffer = Buffer.from(await (body as any).transformToByteArray());
    } else if (typeof (body as any)[Symbol.asyncIterator] === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    } else {
      return null;
    }

    return {
      buffer,
      contentType: result.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
