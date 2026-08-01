import multer from "multer";
import {
  ACCEPTED_FORMATS_LABEL,
  ACCEPTED_INPUT_MIMES,
} from "../../infrastructure/storage/image-normalizer.js";
import {
  VEHICLE_IMAGE_MAX_FILES,
  VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
} from "./ads.upload.constants.js";

/**
 * Limites importados de `ads.upload.constants` — fonte única para multer,
 * validator Zod, ads.routes (`.array(..., MAX_FILES)`) e r2.service.
 */
const MAX_BYTES = VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES;
const MAX_FILES = VEHICLE_IMAGE_MAX_FILES;

/**
 * Normaliza aliases MIME de JPEG antes da verificação do whitelist.
 * Cópia da lógica de normalizeMimeType (r2.service) para evitar uma
 * dependência de módulo circular; a fonte canônica permanece naquele arquivo.
 *
 * Exemplos: "image/jpg" → "image/jpeg", "IMAGE/PJPEG" → "image/jpeg".
 */
function normalizeMime(mime) {
  const t = String(mime || "")
    .trim()
    .toLowerCase();
  if (t === "image/jpg" || t === "image/x-jpg" || t === "image/pjpeg") return "image/jpeg";
  return t;
}

/**
 * Multipart em memória para POST /api/ads/upload-images (fotos do wizard → R2).
 *
 * O fileFilter usa ACCEPTED_INPUT_MIMES de image-normalizer.js como única
 * fonte de verdade: qualquer formato aceito aqui será normalizado para WebP
 * pelo pipeline de storage antes de chegar ao R2.
 *
 * Formatos aceitos: JPEG (incluindo aliases image/jpg, image/x-jpg,
 * image/pjpeg), PNG e WebP. HEIC/HEIF saíram em 2026-07-29 — o sharp não
 * decodifica (ver image-normalizer.js).
 *
 * LIMITE ESTRUTURAL: o `fileFilter` roda ANTES de o conteúdo do arquivo ser
 * lido — só existe `file.mimetype`, não o buffer. Por isso a checagem aqui é
 * necessariamente pelo tipo DECLARADO, e a verificação por conteúdo (magic
 * bytes) só pode acontecer depois, no normalizador. Um HEIC rotulado como
 * `image/jpeg` passa por aqui de propósito e é barrado lá, com mensagem
 * específica.
 */
export const adsPublishImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const mime = normalizeMime(file.mimetype);
    if (ACCEPTED_INPUT_MIMES.has(mime)) {
      cb(null, true);
      return;
    }
    const error = new Error(
      `Formato de imagem não suportado: "${file.mimetype || "desconhecido"}". ` +
        `Envie em ${ACCEPTED_FORMATS_LABEL}.`
    );
    // Mensagem escrita para o usuário final: pode ser exibida (ver o contrato
    // de `expose` no errorHandler). Sem isso viraria "Requisição inválida."
    error.statusCode = 415;
    error.expose = true;
    cb(error);
  },
});
