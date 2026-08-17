// Multipart em memória para POST /api/account/sale-requests/photos.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE UM MULTER PRÓPRIO, E NÃO `adsPublishImageUpload`
// ────────────────────────────────────────────────────────────────────────────
// O do anúncio aceita `VEHICLE_IMAGE_MAX_FILES` arquivos (default 24), que é o
// teto FÍSICO do storage. O teto deste produto é 12, que é regra de PRODUTO.
//
// A diferença não é cosmética: o limite do multer é aplicado enquanto os bytes
// ainda estão chegando. Reusando o do anúncio, uma requisição com 24 arquivos de
// 10 MB seria inteiramente bufferizada na memória do processo ANTES de o service
// dizer "no máximo 12" — 240 MB de RAM gastos para produzir um 400.
//
// O `fileFilter` usa `ACCEPTED_INPUT_MIMES` de `image-normalizer.js` como fonte
// única, exatamente como o do anúncio: qualquer formato aceito aqui é
// normalizado para WebP pelo pipeline antes de chegar ao R2.
//
// LIMITE ESTRUTURAL (o mesmo do anúncio): o `fileFilter` roda ANTES de o
// conteúdo do arquivo ser lido — só existe `file.mimetype`, não o buffer. A
// checagem aqui é pelo tipo DECLARADO; a verificação por conteúdo (magic bytes)
// acontece depois, no normalizador. Um HEIC rotulado como `image/jpeg` passa por
// aqui de propósito e é barrado lá, com mensagem específica.

import multer from "multer";

import {
  ACCEPTED_FORMATS_LABEL,
  ACCEPTED_INPUT_MIMES,
} from "../../infrastructure/storage/image-normalizer.js";
import { VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES } from "../ads/ads.upload.constants.js";
import { SALE_REQUEST_PHOTOS } from "./sale-requests.constants.js";

/** Aliases de JPEG que navegadores e sniffers de OS ainda emitem. */
function normalizeMime(mime) {
  const value = String(mime || "")
    .trim()
    .toLowerCase();
  if (value === "image/jpg" || value === "image/x-jpg" || value === "image/pjpeg") {
    return "image/jpeg";
  }
  return value;
}

export const saleRequestPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
    files: SALE_REQUEST_PHOTOS.MAX,
  },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_INPUT_MIMES.has(normalizeMime(file.mimetype))) {
      cb(null, true);
      return;
    }

    const error = new Error(
      `Formato de imagem não suportado: "${file.mimetype || "desconhecido"}". ` +
        `Envie em ${ACCEPTED_FORMATS_LABEL}.`
    );
    // Mensagem escrita para o usuário final: pode ser exibida (contrato de
    // `expose` no errorHandler). Sem isso viraria "Requisição inválida.".
    error.statusCode = 415;
    error.expose = true;
    cb(error);
  },
});
