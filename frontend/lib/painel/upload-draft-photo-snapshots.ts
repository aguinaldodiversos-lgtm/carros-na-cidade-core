/**
 * Snapshots multipart File objects into buffers once.
 *
 * In Node/Undici, reading `file.arrayBuffer()` consumes the underlying stream.
 * The wizard upload route tries R2 → backend → local disk; reusing the same
 * `File` references from the original FormData leaves later layers with empty
 * bodies. Snapshotting fixes that class of failures.
 */

export type PhotoSnapshot = {
  name: string;
  type: string;
  buffer: Buffer;
};

export function inferMimeFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

export async function snapshotPhotoFiles(photos: File[]): Promise<PhotoSnapshot[]> {
  return Promise.all(
    photos.map(async (f) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      const type =
        (f.type && f.type.trim()) || inferMimeFromFileName(f.name || "") || "image/jpeg";
      return {
        name: f.name || "foto.jpg",
        type: type.toLowerCase(),
        buffer,
      };
    })
  );
}

export function filesFromSnapshots(snapshots: PhotoSnapshot[]): File[] {
  return snapshots.map(
    (s) =>
      new File([s.buffer], s.name, {
        type: s.type,
      })
  );
}

export function formDataFromSnapshots(snapshots: PhotoSnapshot[]): FormData {
  const fd = new FormData();
  for (const s of snapshots) {
    fd.append("photos", new File([s.buffer], s.name, { type: s.type }));
  }
  return fd;
}
