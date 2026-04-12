import { resolveBackendApiUrl } from "@/lib/env/backend-api";

const LOG_PREFIX = "[upload-backend-r2]";
const UPLOAD_TIMEOUT_MS = 60_000;

const FORWARD_HEADER_ALLOWLIST = new Set([
  "accept-language",
  "x-cnc-client-ip",
  "x-forwarded-for",
  "x-real-ip",
]);

type Primitive = string | number | boolean | null | undefined;

type UploadImagesResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string | boolean;
  code?: string;
  requestId?: string;
  data?: {
    urls?: string[];
    keys?: string[];
    items?: unknown[];
  };
  urls?: string[];
  keys?: string[];
  items?: unknown[];
};

export type UploadedPhotoItem = {
  url: string;
  key?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  source: "backend-r2" | "bff-direct-r2" | "local-fs";
};

export class UploadBackendError extends Error {
  statusCode?: number;
  code?: string;
  requestId?: string;
  backendUrl?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      requestId?: string;
      backendUrl?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "UploadBackendError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.requestId = options?.requestId;
    this.backendUrl = options?.backendUrl;
    this.details = options?.details;
  }
}

function summarizeBodyForLog(text: string, max = 400): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function collectStringArray(...candidates: unknown[]): string[] {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const values = candidate
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (values.length > 0) return values;
  }

  return [];
}

function normalizeItem(raw: unknown): UploadedPhotoItem | null {
  if (!isRecord(raw)) return null;

  const url =
    asNonEmptyString(raw.url) ||
    asNonEmptyString(raw.image_url) ||
    asNonEmptyString(raw.imageUrl);

  if (!url) return null;

  return {
    url,
    key:
      asNonEmptyString(raw.key) ||
      asNonEmptyString(raw.storage_key) ||
      asNonEmptyString(raw.storageKey),
    mimeType:
      asNonEmptyString(raw.mimeType) ||
      asNonEmptyString(raw.mime_type) ||
      asNonEmptyString(raw.contentType),
    width: asPositiveNumber(raw.width),
    height: asPositiveNumber(raw.height),
    sizeBytes:
      asPositiveNumber(raw.sizeBytes) ||
      asPositiveNumber(raw.size_bytes) ||
      asPositiveNumber(raw.contentLength),
    source: "backend-r2",
  };
}

function mergeItemsWithIndexedKeys(
  items: UploadedPhotoItem[],
  keys: string[]
): UploadedPhotoItem[] {
  return items.map((item, index) => ({
    ...item,
    key: item.key || keys[index] || undefined,
  }));
}

/**
 * Extrai itens do JSON do backend com tolerância a pequenas variações de contrato.
 */
export function extractUploadImageItemsFromResponse(json: unknown): UploadedPhotoItem[] {
  if (!isRecord(json)) return [];

  const rootItems = Array.isArray(json.items) ? json.items : [];
  const data = isRecord(json.data) ? json.data : undefined;
  const dataItems = Array.isArray(data?.items) ? data.items : [];
  const rawItems = dataItems.length > 0 ? dataItems : rootItems;

  const normalizedItems = rawItems
    .map((item) => normalizeItem(item))
    .filter((item): item is UploadedPhotoItem => Boolean(item));

  const keys = collectStringArray(data?.keys, json.keys);
  if (normalizedItems.length > 0) {
    return mergeItemsWithIndexedKeys(normalizedItems, keys);
  }

  const urls = collectStringArray(data?.urls, json.urls);
  if (urls.length === 0) return [];

  return urls.map((url, index) => ({
    url,
    key: keys[index] || undefined,
    source: "backend-r2",
  }));
}

function pickForwardHeaders(
  source?: Record<string, string>
): Record<string, string> {
  if (!source) return {};

  const result: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.trim().toLowerCase();
    const value = String(rawValue ?? "").trim();

    if (!value) continue;
    if (!FORWARD_HEADER_ALLOWLIST.has(key)) continue;

    result[rawKey] = value;
  }

  return result;
}

function buildOutboundHeaders(
  accessToken: string,
  options?: { forwardHeaders?: Record<string, string>; requestId?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...pickForwardHeaders(options?.forwardHeaders),
  };

  if (options?.requestId) {
    headers["X-Request-Id"] = options.requestId;
  }

  return headers;
}

function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timer),
  };
}

function extractErrorMessage(payload: UploadImagesResponse, fallbackText: string): string {
  const candidate =
    asNonEmptyString(payload.message) ||
    (typeof payload.error === "string" ? payload.error.trim() : "") ||
    fallbackText;

  return candidate || "Falha no upload das fotos.";
}

function safeDetails(
  data: Record<string, Primitive | object | unknown[]> | undefined
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  return data;
}

/**
 * Envia as fotos do wizard ao backend para upload canônico
 * (POST /api/ads/upload-images).
 *
 * O backend deve ser o único writer em produção para garantir:
 * - validação consistente
 * - normalização consistente
 * - storage_key / mime_type consistentes
 * - contrato unificado
 */
export async function uploadPublishPhotosToBackendR2(
  formData: FormData,
  accessToken: string,
  options?: { forwardHeaders?: Record<string, string>; requestId?: string }
): Promise<UploadedPhotoItem[]> {
  const photos = formData
    .getAll("photos")
    .filter(
      (file): file is File =>
        typeof File !== "undefined" && file instanceof File && file.size > 0
    );

  if (photos.length === 0) return [];

  const outbound = new FormData();
  for (const file of photos) {
    outbound.append("photos", file);
  }

  const url = resolveBackendApiUrl("/api/ads/upload-images");
  if (!url) {
    throw new UploadBackendError("URL do backend inválida para upload de imagens.", {
      code: "BACKEND_URL_INVALID",
    });
  }

  const headers = buildOutboundHeaders(accessToken, options);
  const { controller, cleanup } = createTimeoutController(UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: outbound,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();

    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Tempo limite ao contactar o backend de upload (${url}).`
        : `Falha de rede ao contactar o backend de upload (${url}): ${
            error instanceof Error ? error.message : String(error)
          }`;

    throw new UploadBackendError(message, {
      statusCode: 504,
      code: "BACKEND_FETCH_FAILED",
      backendUrl: url,
      details: safeDetails({
        requestId: options?.requestId,
      }),
    });
  } finally {
    cleanup();
  }

  const rawText = await response.text();

  let json: UploadImagesResponse = {};
  try {
    json = rawText ? (JSON.parse(rawText) as UploadImagesResponse) : {};
  } catch {
    json = {};
  }

  const backendRequestId =
    asNonEmptyString(json.requestId) || response.headers.get("x-request-id") || undefined;

  if (!response.ok) {
    const fallbackText =
      rawText && rawText.trim().length > 0
        ? summarizeBodyForLog(rawText)
        : `HTTP ${response.status} sem corpo.`;

    const message = extractErrorMessage(json, fallbackText);

    console.error(`${LOG_PREFIX} backend returned non-2xx`, {
      requestId: options?.requestId,
      backendRequestId,
      status: response.status,
      backendUrl: url,
      body: fallbackText,
    });

    throw new UploadBackendError(message, {
      statusCode: response.status,
      code:
        asNonEmptyString(json.code) ||
        (response.status === 401 ? "UNAUTHORIZED" : "BACKEND_UPLOAD_FAILED"),
      requestId: backendRequestId,
      backendUrl: url,
      details: safeDetails({
        body: fallbackText,
      }),
    });
  }

  const items = extractUploadImageItemsFromResponse(json);

  if (items.length === 0) {
    const bodySummary = rawText ? summarizeBodyForLog(rawText) : "JSON vazio";

    console.error(`${LOG_PREFIX} invalid backend response`, {
      requestId: options?.requestId,
      backendRequestId,
      backendUrl: url,
      body: bodySummary,
    });

    throw new UploadBackendError(
      "Resposta de upload inválida: JSON sem itens/URLs utilizáveis.",
      {
        statusCode: 502,
        code: "INVALID_UPLOAD_RESPONSE",
        requestId: backendRequestId,
        backendUrl: url,
        details: safeDetails({
          body: bodySummary,
        }),
      }
    );
  }

  console.info(`${LOG_PREFIX} backend upload ok`, {
    requestId: options?.requestId,
    backendRequestId,
    backendUrl: url,
    itemCount: items.length,
  });

  return items;
}
