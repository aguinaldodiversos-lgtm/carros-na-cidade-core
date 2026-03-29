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
  validateUpdateAdPayload,
} from "./ads.validators.js";
import { invalidateAdsCachesAfterMutation } from "./ads.mutation-cache.js";
import {
  logAdsPublishFailure,
  sanitizeAdPayloadForLog,
} from "./ads.publish-flow.log.js";

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
    const ad = await adsService.create(req.body, req.user, {
      requestId: req.requestId || null,
    });

    try {
      await invalidateAdsCachesAfterMutation();
    } catch (cacheErr) {
      logAdsPublishFailure(cacheErr, {
        stage: "ads.controller.invalidateCache",
        requestId: req.requestId || null,
        userId: req.user?.id ?? null,
        advertiserId: ad?.advertiser_id ?? null,
        cityId: ad?.city_id ?? req.body?.city_id ?? null,
        adId: ad?.id ?? null,
        payload: sanitizeAdPayloadForLog(req.body),
      });
      throw cacheErr;
    }

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
    const payload = validateUpdateAdPayload(req.body);
    const ad = await adsService.update(id, payload, req.user, {
      requestId: req.requestId || null,
    });

    await invalidateAdsCachesAfterMutation();

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

    await invalidateAdsCachesAfterMutation();

    res.json({
      success: true,
      message: "Anúncio removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
}
