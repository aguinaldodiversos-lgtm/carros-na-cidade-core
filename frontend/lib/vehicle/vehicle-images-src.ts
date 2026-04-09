import path from "node:path";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Query params às vezes chegam duplamente codificados (%252Fuploads...) ou sem "/" inicial.
 * Sem isso, a rota `/api/vehicle-images` devolve 400 "Imagem inválida." com path válido.
 */
export function normalizeUploadSrcParam(raw: string): string {
  let s = raw.trim().replace(/\\/g, "/");
  if (!s) return "";

  let prev = "";
  for (let i = 0; i < 6 && s !== prev; i++) {
    prev = s;
    const next = safeDecodeURIComponent(s);
    if (next === s) break;
    s = next;
  }

  s = s.trim();

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.pathname;
    } catch {
      return "";
    }
  }

  if (s.startsWith("//")) {
    s = `/${s.replace(/^\/+/, "")}`;
  }

  if (!s.startsWith("/") && s.startsWith("uploads/")) {
    s = `/${s}`;
  }

  return s;
}

export function getSafeUploadPath(raw: string): string | null {
  const decoded = normalizeUploadSrcParam(raw);
  if (!decoded) return null;
  if (decoded.includes("\0")) return null;

  if (!decoded.startsWith("/uploads/")) return null;

  const normalized = path.posix.normalize(decoded);

  if (!normalized.startsWith("/uploads/")) return null;
  if (normalized.includes("..")) return null;

  return normalized;
}
