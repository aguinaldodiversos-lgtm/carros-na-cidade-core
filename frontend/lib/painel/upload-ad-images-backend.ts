import { resolveBackendApiUrl } from "@/lib/env/backend-api";

type UploadImagesResponse = {
  success?: boolean;
  message?: string;
  data?: { urls?: string[]; keys?: string[] };
  urls?: string[];
};

/**
 * Extrai URLs do JSON do backend com tolerância a pequenas variações de contrato.
 */
export function extractUploadImageUrlsFromResponse(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;

  const data = o.data;
  if (data && typeof data === "object") {
    const urls = (data as Record<string, unknown>).urls;
    if (Array.isArray(urls)) {
      return urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    }
  }

  if (Array.isArray(o.urls)) {
    return o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  }

  return [];
}

function summarizeBodyForLog(text: string, max = 400): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * Envia as fotos do wizard ao backend para upload no R2 (POST /api/ads/upload-images).
 * Retorna URLs prontas para `images[]` em POST /api/ads (público R2 ou `/api/vehicle-images?key=`).
 */
export async function uploadPublishPhotosToBackendR2(
  formData: FormData,
  accessToken: string,
  options?: { forwardHeaders?: Record<string, string> }
): Promise<string[]> {
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => typeof File !== "undefined" && f instanceof File && f.size > 0);

  if (photos.length === 0) return [];

  const outbound = new FormData();
  for (const p of photos) {
    outbound.append("photos", p);
  }

  const url = resolveBackendApiUrl("/api/ads/upload-images");
  if (!url) {
    throw new Error("URL do backend inválida para upload de imagens.");
  }

  const forward = options?.forwardHeaders ?? {};
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...forward,
    Authorization: `Bearer ${accessToken}`,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: outbound,
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha de rede ao contactar o backend de upload (${url}): ${msg}`);
  }

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    json = { _parseError: true, raw: summarizeBodyForLog(text) };
  }

  if (!res.ok) {
    const errPayload = json as UploadImagesResponse & { error?: string | boolean };
    const msg =
      (typeof errPayload.message === "string" && errPayload.message.trim()) ||
      (typeof errPayload.error === "string" && errPayload.error.trim()) ||
      (res.status === 401 ? "Sessão expirada. Faça login novamente." : "");
    const fallback =
      msg ||
      (text ? summarizeBodyForLog(text) : `HTTP ${res.status} sem corpo.`) ||
      "Falha no upload das fotos.";
    const withStatus =
      res.status === 401 ? fallback : `${fallback} (HTTP ${res.status})`;
    throw new Error(withStatus);
  }

  const urls = extractUploadImageUrlsFromResponse(json);
  if (urls.length === 0) {
    throw new Error(
      "Resposta de upload inválida: JSON sem URLs (esperado data.urls ou urls)."
    );
  }

  return urls;
}
