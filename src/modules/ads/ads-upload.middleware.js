import multer from "multer";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 24;

/**
 * Multipart em memória para POST /api/ads/upload-images (fotos do wizard → R2).
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
