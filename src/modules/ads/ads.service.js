import * as adsPublicService from "./ads.public.service.js";
import * as adsPanelService from "./ads.panel.service.js";

export async function list(filters = {}, scope = "public_global", options = {}) {
  return adsPublicService.searchAds(filters, scope, options);
}

export async function search(filters = {}, scope = "public_global", options = {}) {
  return adsPublicService.searchAds(filters, scope, options);
}

export async function show(identifier) {
  return adsPublicService.showAd(identifier);
}

export async function create(data, user) {
  return adsPanelService.createAd(data, user);
}

export async function update(id, data, user) {
  return adsPanelService.updateAd(id, data, user);
}

export async function remove(id, user) {
  return adsPanelService.removeAd(id, user);
}
