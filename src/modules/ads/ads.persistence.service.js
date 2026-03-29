import { normalizeAdVehicleFieldsForPersistence } from "./ads.storage-normalize.js";
import * as adsRepository from "./ads.repository.js";

const STAGE = Object.freeze({
  CREATE: "ads.persist.create",
  UPDATE: "ads.persist.update",
});

/**
 * Prepara payload completo para INSERT (normaliza body_type, fuel_type, transmission).
 */
export function prepareAdInsertPayload(input) {
  return normalizeAdVehicleFieldsForPersistence(input, { partial: false });
}

/**
 * Prepara payload parcial para UPDATE.
 */
export function prepareAdUpdatePayload(input) {
  return normalizeAdVehicleFieldsForPersistence(input, { partial: true });
}

/**
 * INSERT — falhas são logadas em `ads.create.pipeline.service` (createAdNormalized).
 */
export async function executeAdInsert(row, { requestId: _requestId } = {}) {
  return adsRepository.createAd(row);
}

/**
 * UPDATE — falhas são logadas em `ads.panel.service` (updateAd).
 */
export async function executeAdUpdate(id, row, { requestId: _requestId } = {}) {
  return adsRepository.updateAd(id, row);
}

export { STAGE };
