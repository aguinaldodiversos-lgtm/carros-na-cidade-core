import { resolveBackendApiUrl } from "@/lib/env/backend-api";

type UploadImagesResponse = {
  success?: boolean;
  message?: string;
  data?: { urls?: string[] };
};

/**
 * Envia as fotos do wizard ao backend para upload no R2 (POST /api/ads/upload-images).
 * Retorna URLs prontas para `images[]` em POST /api/ads (público R2 ou `/api/vehicle-images?key=`).
 */
export async function uploadPublishPhotosToBackendR2(
  formData: FormData,
  accessToken: string
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

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: outbound,
    cache: "no-store",
  });

  let json: UploadImagesResponse = {};
  try {
    json = (await res.json()) as UploadImagesResponse;
  } catch {
    json = {};
  }

  if (!res.ok) {
    const errPayload = json as { message?: string; error?: string | boolean };
    const msg =
      (typeof errPayload.message === "string" && errPayload.message.trim()) ||
      (typeof errPayload.error === "string" && errPayload.error.trim()) ||
      (res.status === 401 ? "Sessão expirada. Faça login novamente." : "Falha no upload das fotos.");
    throw new Error(msg);
  }

  const urls = json.data?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("Resposta de upload inválida.");
  }

  return urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
}
