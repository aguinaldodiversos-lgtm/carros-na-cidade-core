import { AppError } from "../../shared/middlewares/error.middleware.js";
import { executeAdUpdate, prepareAdUpdatePayload } from "./ads.persistence.service.js";
import * as adsRepository from "./ads.repository.js";
import { logAdsPublishFailure, sanitizeAdPayloadForLog } from "./ads.publish-flow.log.js";
import * as dbModule from "../../infrastructure/database/db.js";
import { removeVehicleImages } from "../../infrastructure/storage/r2.service.js";
import { AD_STATUS } from "./ads.canonical.constants.js";
import { recordModerationEvent } from "./risk/ad-risk.repository.js";
import { MODERATION_EVENT } from "./risk/ad-risk.thresholds.js";

/**
 * Campos estruturais — definem QUAL veículo e DE QUEM é o anúncio. Trocar
 * qualquer um equivale a postar outro anúncio (potencial bypass do score).
 * Estratégia escolhida (Tarefa 11): BLOQUEAR a alteração e orientar o
 * usuário a criar novo anúncio. Se quisermos mudar para "permite mas
 * envia para PENDING_REVIEW", basta mudar o handler.
 */
const STRUCTURAL_FIELDS = Object.freeze([
  "brand",
  "model",
  "version",
  "year",
  "city",
  "city_id",
  "state",
  "plate",
  "advertiser_id",
]);

const tableColumnsCache = new Map();

function assertOwner(ownerContext, userId) {
  if (!ownerContext) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  const advertiserUserId = ownerContext.advertiser_user_id;
  if (advertiserUserId == null) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  if (String(advertiserUserId) !== String(userId)) {
    throw new AppError("Sem permissão para alterar este anúncio", 403);
  }
}

function getDbQueryFn() {
  const candidates = [
    typeof dbModule.query === "function" ? dbModule.query.bind(dbModule) : null,
    typeof dbModule.pool?.query === "function" ? dbModule.pool.query.bind(dbModule.pool) : null,
    typeof dbModule.default?.query === "function"
      ? dbModule.default.query.bind(dbModule.default)
      : null,
    typeof dbModule.default?.pool?.query === "function"
      ? dbModule.default.pool.query.bind(dbModule.default.pool)
      : null,
  ].filter(Boolean);

  if (candidates.length === 0) {
    throw new Error(
      "[ads.panel] Não foi possível localizar uma função de query em src/infrastructure/database/db.js"
    );
  }

  return candidates[0];
}

async function dbQuery(text, params = []) {
  const queryFn = getDbQueryFn();
  return queryFn(text, params);
}

function normalizeScalar(value) {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

async function getTableColumns(tableName) {
  const cacheKey = String(tableName || "")
    .trim()
    .toLowerCase();
  if (!cacheKey) return new Set();

  if (tableColumnsCache.has(cacheKey)) {
    return tableColumnsCache.get(cacheKey);
  }

  const { rows } = await dbQuery(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
    `,
    [cacheKey]
  );

  const columns = new Set(rows.map((row) => row.column_name));
  tableColumnsCache.set(cacheKey, columns);
  return columns;
}

async function tableExists(tableName) {
  const columns = await getTableColumns(tableName);
  return columns.size > 0;
}

function resolveVehicleId(ownerContext, adId) {
  const candidates = [
    ownerContext?.vehicle_id,
    ownerContext?.vehicleId,
    ownerContext?.ad_vehicle_id,
    ownerContext?.linked_vehicle_id,
    ownerContext?.id === adId ? null : ownerContext?.id,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeScalar(candidate);
    if (normalized) return normalized;
  }

  return null;
}

async function resolveVehicleImagesLink(ownerContext, adId) {
  const hasVehicleImagesTable = await tableExists("vehicle_images");
  if (!hasVehicleImagesTable) return null;

  const columns = await getTableColumns("vehicle_images");

  if (columns.has("ad_id")) {
    return {
      column: "ad_id",
      value: adId,
    };
  }

  if (columns.has("vehicle_id")) {
    const vehicleId = resolveVehicleId(ownerContext, adId);
    if (!vehicleId) return null;

    return {
      column: "vehicle_id",
      value: vehicleId,
    };
  }

  return null;
}

async function findImageStorageKeysByLink(link) {
  if (!link) return [];

  const { rows } = await dbQuery(
    `
      select storage_key
      from vehicle_images
      where ${link.column} = $1
        and storage_key is not null
        and btrim(storage_key) <> ''
    `,
    [link.value]
  );

  return Array.from(new Set(rows.map((row) => normalizeScalar(row.storage_key)).filter(Boolean)));
}

async function deleteVehicleImageRowsByLink(link) {
  if (!link) return 0;

  const result = await dbQuery(
    `
      delete from vehicle_images
      where ${link.column} = $1
    `,
    [link.value]
  );

  return Number(result?.rowCount || 0);
}

async function cleanupAdImagesAfterSoftDelete(ownerContext, adId, ctx = {}) {
  const requestId = ctx.requestId ?? null;
  const link = await resolveVehicleImagesLink(ownerContext, adId);

  if (!link) {
    return {
      attempted: false,
      removedFromStorage: 0,
      removedFromDb: 0,
    };
  }

  const storageKeys = await findImageStorageKeysByLink(link);

  if (storageKeys.length > 0) {
    await removeVehicleImages(storageKeys);
  }

  const deletedRows = await deleteVehicleImageRowsByLink(link);

  return {
    attempted: true,
    removedFromStorage: storageKeys.length,
    removedFromDb: deletedRows,
    requestId,
  };
}

export async function updateAd(id, data, user, ctx = {}) {
  const requestId = ctx.requestId ?? null;
  let stage = "loadOwnerContext";
  let advertiserId = null;
  let cityId = null;

  try {
    // Guard: transição de status (active/paused/deleted) tem caminho próprio
    // (account.service.updateOwnedAdStatus + deleteOwnedAd) com elegibility-
    // -guard, RLS e cleanup R2. Permitir aqui criaria um segundo caminho
    // sem essas garantias.
    if (data && Object.prototype.hasOwnProperty.call(data, "status")) {
      throw new AppError(
        "Alteração de status não é permitida por este endpoint. Use PATCH /api/account/ads/:id/status (pause/activate) ou DELETE /api/ads/:id.",
        400
      );
    }

    // Guard inconditional: troca de advertiser_id é sempre proibida (não
    // depende do status atual do ad). Os demais campos estruturais usam
    // a regra do `protectedStatuses` abaixo.
    if (data && Object.prototype.hasOwnProperty.call(data, "advertiser_id")) {
      throw new AppError("Alteração de advertiser_id não é permitida.", 400);
    }

    // Tarefa 11 — bloqueio de campos estruturais (exceto advertiser_id, já
    // tratado acima).
    // Sempre coletamos os campos estruturais que viriam alterados; se o ad
    // ainda existe e a tentativa for em status público (ACTIVE) ou já em
    // moderação (PENDING_REVIEW), recusamos com mensagem clara e gravamos
    // um evento de auditoria para o admin enxergar a tentativa.
    const attemptedStructural = data
      ? STRUCTURAL_FIELDS.filter((field) =>
          Object.prototype.hasOwnProperty.call(data, field)
        )
      : [];

    const ownerContext = await adsRepository.findOwnerContextById(id);
    if (ownerContext) {
      advertiserId = ownerContext.advertiser_id ?? null;
      cityId = ownerContext.city_id ?? null;
    }
    assertOwner(ownerContext, user.id);

    if (attemptedStructural.length > 0) {
      const protectedStatuses = [
        AD_STATUS.ACTIVE,
        AD_STATUS.PENDING_REVIEW,
        AD_STATUS.PAUSED,
        AD_STATUS.SOLD,
      ];
      if (protectedStatuses.includes(String(ownerContext?.status))) {
        // Auditoria: registra a TENTATIVA antes de rejeitar — admin
        // consegue rastrear comportamento suspeito mesmo com 400.
        try {
          await recordModerationEvent({
            adId: id,
            eventType: MODERATION_EVENT.STRUCTURAL_FIELD_CHANGE_DETECTED,
            actorUserId: user.id,
            actorRole: "owner",
            fromStatus: ownerContext?.status ?? null,
            toStatus: ownerContext?.status ?? null,
            reason: "Tentativa de alteração de campo estrutural rejeitada.",
            metadata: { fields: attemptedStructural },
          });
        } catch {
          /* tabela pode não existir em legado — não bloquear o erro principal */
        }

        throw new AppError(
          "Para alterar marca, modelo, ano ou cidade, crie um novo anúncio. Esses campos não podem ser alterados após a publicação.",
          400,
          true,
          {
            code: "STRUCTURAL_FIELDS_LOCKED",
            fields: attemptedStructural,
          }
        );
      }
    }

    stage = "prepareUpdatePayload";
    const payload = prepareAdUpdatePayload({ ...data });

    stage = "executeUpdate";
    const updated = await executeAdUpdate(id, payload, { requestId });

    if (!updated) {
      throw new AppError("Falha ao atualizar anúncio", 500);
    }

    return updated;
  } catch (err) {
    logAdsPublishFailure(err, {
      stage: `ads.updateAd.${stage}`,
      requestId,
      userId: user.id,
      advertiserId,
      cityId,
      adId: id,
      payload: sanitizeAdPayloadForLog({ ...data, ad_id: id }),
    });
    throw err;
  }
}

export async function removeAd(id, user, ctx = {}) {
  const requestId = ctx.requestId ?? null;
  let stage = "loadOwnerContext";
  let advertiserId = null;
  let cityId = null;
  let ownerContext = null;

  try {
    ownerContext = await adsRepository.findOwnerContextById(id);

    if (ownerContext) {
      advertiserId = ownerContext.advertiser_id ?? null;
      cityId = ownerContext.city_id ?? null;
    }

    assertOwner(ownerContext, user.id);

    stage = "softDeleteAd";
    const removed = await adsRepository.softDeleteAd(id);

    if (!removed) {
      throw new AppError("Falha ao remover anúncio", 500);
    }

    stage = "cleanupImages";
    try {
      await cleanupAdImagesAfterSoftDelete(ownerContext, id, { requestId });
    } catch (cleanupError) {
      logAdsPublishFailure(cleanupError, {
        stage: "ads.removeAd.cleanupImages",
        requestId,
        userId: user.id,
        advertiserId,
        cityId,
        adId: id,
        payload: sanitizeAdPayloadForLog({ ad_id: id }),
      });
    }

    return removed;
  } catch (err) {
    logAdsPublishFailure(err, {
      stage: `ads.removeAd.${stage}`,
      requestId,
      userId: user.id,
      advertiserId,
      cityId,
      adId: id,
      payload: sanitizeAdPayloadForLog({ ad_id: id }),
    });
    throw err;
  }
}
