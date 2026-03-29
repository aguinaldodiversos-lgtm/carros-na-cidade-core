/**
 * Fachada pública do domínio anúncios — preferir importar daqui em outros módulos (`create` → pipeline oficial).
 */
import * as adsPublicService from "./ads.public.service.js";
import * as adsPanelService from "./ads.panel.service.js";
import { createAdNormalized } from "./ads.create.pipeline.service.js";

export { createAdNormalized };

export async function list(filters = {}, scope = "public_global", options = {}) {
  return adsPublicService.searchAds(filters, scope, options);
}

export async function search(filters = {}, scope = "public_global", options = {}) {
  return adsPublicService.searchAds(filters, scope, options);
}

export async function show(identifier) {
  return adsPublicService.showAd(identifier);
}

export async function create(data, user, ctx = {}) {
  return createAdNormalized(data, user, ctx);
}

export async function update(id, data, user, ctx = {}) {
  return adsPanelService.updateAd(id, data, user, ctx);
}

export async function remove(id, user) {
  return adsPanelService.removeAd(id, user);
}
