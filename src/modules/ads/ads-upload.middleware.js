import multer from "multer";

/** Alinhado ao default de `VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES` / r2.service (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 24;

/**
 * Multipart em memória para POST /api/ads/upload-images (fotos do wizard → R2).
 *
 * O filtro de MIME usa `image/*` deliberadamente amplo para não rejeitar "image/jpg"
 * antes de o r2.service ter chance de normalizar para "image/jpeg".
 * A validação canônica de MIME ocorre em `assertAllowedMimeType` via `normalizeMimeType`.
 */
export const adsPublishImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Apenas arquivos de imagem são permitidos."));
  },
});
