import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_PHOTOS = 24;
/** Alinhado ao limite do backend/multer e r2.service (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("heic") || m.includes("heif")) return "jpg";
  return "jpg";
}

/**
 * Grava ficheiros do FormData em `public/uploads/ads` e devolve URLs relativas servidas pelo Next.
 */
export async function saveWizardPhotosToPublic(formData: FormData): Promise<string[]> {
  const raw = formData.getAll("photos");
  const files = raw.filter(
    (f): f is File => typeof File !== "undefined" && f instanceof File && f.size > 0
  );

  if (files.length === 0) return [];

  const dir = join(process.cwd(), "public", "uploads", "ads");
  await mkdir(dir, { recursive: true });

  const urls: string[] = [];

  for (const file of files.slice(0, MAX_PHOTOS)) {
    if (file.size > MAX_BYTES) continue;
    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!mime.startsWith("image/")) continue;

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) continue;

    const ext = extForMime(mime);
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), buf);
    urls.push(`/uploads/ads/${name}`);
  }

  return urls;
}
