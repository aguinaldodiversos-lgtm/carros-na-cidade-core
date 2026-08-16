// Upload das fotos da solicitação de venda (Produto 2, Fase 4.1).
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE O UPLOAD É UMA ROTA SEPARADA DA CRIAÇÃO
// ────────────────────────────────────────────────────────────────────────────
// A pessoa escolhe as fotos antes de terminar de preencher o formulário, e a
// solicitação só existe depois do submit. É o mesmo problema que o wizard de
// anúncio já resolve: a foto sobe para o R2 antes de a entidade existir, e o
// vínculo é feito depois.
//
// A alternativa (um único POST multipart com formulário + fotos) obrigaria a
// segurar dezenas de megabytes em memória durante toda a validação e a
// transação — e um erro de validação de campo faria a pessoa reenviar as fotos.
//
// ────────────────────────────────────────────────────────────────────────────
// O QUE ESTA ROTA NÃO FAZ
// ────────────────────────────────────────────────────────────────────────────
// Não escreve nada no banco. O upload produz OBJETO no storage e devolve
// `storage_key`; a linha em `sale_request_images` só nasce dentro da transação
// de criação, depois de a posse da chave ser reconferida.
//
// Consequência aceita e conhecida: fotos enviadas e nunca submetidas viram
// objeto órfão no R2. É o mesmo custo que o acervo de anúncios já paga hoje, e a
// alternativa (linha no banco antes do submit) criaria solicitação-fantasma —
// bem pior. A limpeza é trabalho de script, fora do request.

import crypto from "node:crypto";

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { uploadSaleRequestImage } from "../../infrastructure/storage/r2.service.js";
import { buildCanonicalImageUrlFromStorageKey } from "../ads/ads.public-images.js";
import { requireUserId } from "./sale-requests.service.js";
import { SALE_REQUEST_CODE, SALE_REQUEST_PHOTOS } from "./sale-requests.constants.js";

/**
 * Sobe um lote de fotos e devolve as chaves.
 *
 * O teto por REQUISIÇÃO é o mesmo teto por solicitação (12). Não é frouxo de
 * propósito: quem envia em duas levas acumula chaves no cliente e o total é
 * conferido de novo na criação, onde a regra realmente vale.
 *
 * O piso NÃO é aplicado aqui — enviar 2 fotos agora e mais 2 depois é um fluxo
 * legítimo de formulário. Quem exige o mínimo de 4 é a criação.
 *
 * `uploadSessionId` é gerado no SERVIDOR. Se viesse do cliente, seria um
 * segmento de path controlado por quem chama — e ainda que `sanitizePathSegment`
 * o neutralize, aceitar caminho do cliente é um hábito que uma refatoração
 * futura transforma em traversal.
 */
export async function uploadSaleRequestPhotos(user, files, deps = {}) {
  const ownerUserId = requireUserId(user?.id);

  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) {
    throw new AppError("Nenhuma foto recebida.", 400, true, {
      code: SALE_REQUEST_CODE.INVALID_PHOTO,
      field: "photos",
    });
  }

  if (list.length > SALE_REQUEST_PHOTOS.MAX) {
    throw new AppError(
      `Envie no máximo ${SALE_REQUEST_PHOTOS.MAX} fotos por vez.`,
      400,
      true,
      { code: SALE_REQUEST_CODE.PHOTO_COUNT, field: "photos", max: SALE_REQUEST_PHOTOS.MAX }
    );
  }

  const upload = typeof deps.uploadSaleRequestImage === "function"
    ? deps.uploadSaleRequestImage
    : uploadSaleRequestImage;

  const uploadSessionId = crypto.randomUUID();
  const images = [];

  for (let index = 0; index < list.length; index += 1) {
    try {
      const result = await upload({
        ownerUserId,
        uploadSessionId,
        file: list[index],
        sortOrder: index,
      });

      images.push({
        storage_key: result.key,
        // A URL volta só para a PRÉ-VISUALIZAÇÃO no formulário. O que é
        // persistido depois é a `storage_key` — a URL nunca entra no banco.
        url: result.publicUrl || buildCanonicalImageUrlFromStorageKey(result.key),
      });
    } catch (error) {
      // O pipeline recusa formato/tamanho com mensagem própria e legível
      // (`[r2] Tipo de arquivo não permitido: ...`). Repassar como 400 dá ao
      // usuário a razão real; transformar em 500 esconderia "seu arquivo é HEIC"
      // atrás de "erro interno".
      logger.warn(
        {
          ...buildDomainFields({
            action: "sale_request.photo.upload",
            result: "error",
            userId: ownerUserId,
            reason: "upload_failed",
          }),
          index,
          err: error?.message || String(error),
        },
        "[sale-requests] falha ao enviar foto"
      );

      throw new AppError(
        "Não foi possível enviar uma das fotos. Use JPG, PNG ou WebP de até 10 MB.",
        400,
        true,
        { code: SALE_REQUEST_CODE.INVALID_PHOTO, field: "photos", index }
      );
    }
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.photo.upload",
        result: "success",
        userId: ownerUserId,
      }),
      uploaded: images.length,
    },
    "[sale-requests] fotos enviadas"
  );

  return { images };
}
