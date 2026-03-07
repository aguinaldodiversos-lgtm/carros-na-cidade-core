// src/modules/ads/ads.controller.js

import * as adsService from "./ads.service.js";
import { getFacets } from "./facets.service.js";
import {
  parseAdsFacetFilters,
  parseAdsFilters,
} from "./filters/ads-filter.parser.js";
import {
  validateAdIdentifier,
  validateAdId,
  validateCreateAdPayload,
} from "./ads.validators.js";

export async function facets(req, res, next) {
  try {
    const filters = await parseAdsFacetFilters(req.query);
    const facets = await getFacets(filters);

    res.json({
      success: true,
      facets,
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const filters = await parseAdsFilters(req.query, "public_global");
    const result = await adsService.list(filters, "public_global", {
      safeMode: true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function search(req, res, next) {
  try {
    const filters = await parseAdsFilters(req.query, "public_global");
    const result = await adsService.search(filters, "public_global", {
      safeMode: true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function show(req, res, next) {
  try {
    const identifier = validateAdIdentifier(req.params.identifier);
    const ad = await adsService.show(identifier);

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const payload = validateCreateAdPayload(req.body);
    const ad = await adsService.create(payload, req.user);

    res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const id = validateAdId(req.params.id);
    const ad = await adsService.update(id, req.body, req.user);

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const id = validateAdId(req.params.id);
    await adsService.remove(id, req.user);

    res.json({
      success: true,
      message: "Anúncio removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
}
