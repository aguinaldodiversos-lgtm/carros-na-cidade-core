import crypto from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { getR2Client, getR2Config } from "../../infrastructure/storage/r2.service.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { getStoreProfile } from "./store-profile.service.js";

export const MAX_STORE_MEDIA_BYTES = 6 * 1024 * 1024;
export const STORE_MEDIA_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Usa a configuração do R2 existente no BACKEND (a mesma das imagens de
 * veículos), sem duplicar credenciais sensíveis no frontend.
 *
 * Só permite conta CNPJ que já possua cadastro de lojista. Este endpoint
 * NÃO atualiza advertisers nem toca em ads; a URL só é publicada no PUT
 * /api/account/store após validação do prefixo de usuário.
 */
export async function uploadStoreMedia({ userId, accountType, kind, file }) {
  if (accountType !== "CNPJ") {
    throw new AppError("Envio disponível apenas para lojistas.", 403);
  }
  if (kind !== "cover" && kind !== "logo") {
    throw new AppError("Selecione fachada ou logotipo.", 400);
  }
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length === 0 ||
    file.buffer.length > MAX_STORE_MEDIA_BYTES ||
    !STORE_MEDIA_MIMES.has(file.mimetype)
  ) {
    throw new AppError("Envie JPG, PNG ou WebP de até 6 MB.", 400);
  }

  // Rejeita conta não associada à loja; não cria registros em advertisers.
  await getStoreProfile(userId);

  let converted;
  try {
    const source = sharp(file.buffer, { limitInputPixels: 64_000_000 });
    const metadata = await source.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8000 ||
      metadata.height > 8000
    ) {
      throw new AppError("Dimensões de imagem inválidas.", 400);
    }
    converted = await sharp(file.buffer, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize(
        kind === "cover"
          ? { width: 1600, height: 900, fit: "inside", withoutEnlargement: true }
          : { width: 512, height: 512, fit: "inside", withoutEnlargement: true }
      )
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Não foi possível processar a imagem. Envie JPG, PNG ou WebP.", 415);
  }

  const userHash = crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 20);
  const key = `dealers/${userHash}/${kind}/${crypto.randomUUID()}.webp`;
  const { bucketName } = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: converted,
      ContentType: "image/webp",
      ContentLength: converted.length,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  // URL relativa com chave opaca: validada pelo editor da loja antes de salvar.
  return { url: "/api/vehicle-images?key=" + encodeURIComponent(key) };
}
