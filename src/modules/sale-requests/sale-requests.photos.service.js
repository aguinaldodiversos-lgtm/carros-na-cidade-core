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
import {
  ImageInputError,
  ObjectStorageError,
  describeStorageFailure,
} from "../../infrastructure/storage/storage-errors.js";
import { buildCanonicalImageUrlFromStorageKey } from "../ads/ads.public-images.js";
import { requireUserId } from "./sale-requests.service.js";
import {
  SALE_REQUEST_CODE,
  SALE_REQUEST_PHOTOS,
  SALE_REQUEST_PHOTO_INPUT_MESSAGE,
  SALE_REQUEST_PHOTO_STORAGE_MESSAGE,
} from "./sale-requests.constants.js";

/**
 * Traduz a falha TIPADA do pipeline no contrato HTTP do produto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TRÊS CAMINHOS, TRÊS RESPOSTAS — e nenhum deles adivinha por string
 * ────────────────────────────────────────────────────────────────────────────
 *   ImageInputError    → 400. O ARQUIVO é o problema; o usuário resolve
 *                        mandando outro.
 *   ObjectStorageError → 503. O STORAGE é o problema; o usuário resolve
 *                        tentando a MESMA foto de novo, daqui a pouco.
 *   qualquer outro     → repassa. Erro não classificado é bug nosso, e culpar a
 *                        foto do usuário por um bug nosso é o que causou este
 *                        conserto. O errorHandler global transforma em 500 com
 *                        mensagem genérica, sem stack e sem detalhe interno.
 *
 * A distinção NÃO usa `message.includes("bucket")` nem lista de códigos da AWS.
 * Ela vem da ETAPA que falhou dentro de `uploadSaleRequestImage` — ver
 * `storage-errors.js` para o porquê de classificar por estrutura e não por texto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE VAI PARA O LOG E O QUE VAI PARA A RESPOSTA
 * ────────────────────────────────────────────────────────────────────────────
 * Log: `reason`, `stage` e o par nome/mensagem do erro de origem — o suficiente
 * para saber que foi `NoSuchBucket` ou `R2_BUCKET_NAME` ausente. Nunca o objeto
 * de erro inteiro, que no SDK da AWS carrega `$metadata` e configuração
 * resolvida de credenciais.
 *
 * Resposta: mensagem fixa. Sem bucket, sem endpoint, sem account id, sem nome de
 * variável de ambiente, sem texto do SDK.
 */
function translateUploadFailure(error, { ownerUserId, index }) {
  if (error instanceof ObjectStorageError) {
    logger.error(
      {
        ...buildDomainFields({
          action: "sale_request.photo.upload",
          result: "error",
          userId: ownerUserId,
          reason: "storage_unavailable",
        }),
        index,
        stage: error.stage,
        storage: describeStorageFailure(error.cause),
      },
      "[sale-requests] storage indisponível — a foto do usuário não tem defeito"
    );

    return new AppError(SALE_REQUEST_PHOTO_STORAGE_MESSAGE, 503, true, {
      code: SALE_REQUEST_CODE.PHOTO_STORAGE_UNAVAILABLE,
      field: "photos",
    });
  }

  if (error instanceof ImageInputError) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "sale_request.photo.upload",
          result: "error",
          userId: ownerUserId,
          reason: "invalid_photo",
        }),
        index,
        err: error.message,
      },
      "[sale-requests] arquivo recusado pelo pipeline de imagem"
    );

    // `expose` marca as mensagens escritas PARA o usuário final — como a que
    // explica onde desligar o "alta eficiência" no iPhone. Descartá-las em favor
    // do texto genérico tornaria o erro menos acionável do que já é hoje.
    return new AppError(
      error.expose && error.message ? error.message : SALE_REQUEST_PHOTO_INPUT_MESSAGE,
      400,
      true,
      { code: SALE_REQUEST_CODE.INVALID_PHOTO, field: "photos", index }
    );
  }

  logger.error(
    {
      ...buildDomainFields({
        action: "sale_request.photo.upload",
        result: "error",
        userId: ownerUserId,
        reason: "unclassified",
      }),
      index,
      err: error?.message || String(error),
    },
    "[sale-requests] falha não classificada no envio de foto"
  );

  return error;
}

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
      throw translateUploadFailure(error, { ownerUserId, index });
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
