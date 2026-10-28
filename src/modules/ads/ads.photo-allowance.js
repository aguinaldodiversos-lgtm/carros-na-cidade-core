import { AppError } from "../../shared/middlewares/error.middleware.js";

/**
 * Regra comercial unificada para criação e edição de anúncios.
 * O backend sempre verifica o limite efetivo do usuário, não aceita
 * que o navegador informe um limite próprio.
 */
export function assertPhotoAllowance(images, maxPhotos) {
  if (!Array.isArray(images)) return;
  const limit = Number(maxPhotos);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError("Limite de fotografias não configurado para este plano.", 503);
  }
  if (images.length > limit) {
    throw new AppError(`Seu plano permite até ${limit} fotos por anúncio.`, 400);
  }
}
