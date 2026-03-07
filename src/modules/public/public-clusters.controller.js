// src/modules/public/public-clusters.controller.js

import { getCityPublicPage } from "../../read-models/cities/city-public.service.js";
import { getCityBrandPage } from "../../read-models/cities/city-brand.service.js";
import { getCityModelPage } from "../../read-models/cities/city-model.service.js";
import {
  getCityOpportunityPage,
  getCityBelowFipePage,
} from "../../read-models/cities/city-opportunity.service.js";

export async function getCityPage(req, res, next) {
  try {
    const data = await getCityPublicPage(req.params.slug, req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCityBrandClusterPage(req, res, next) {
  try {
    const data = await getCityBrandPage(
      req.params.slug,
      req.params.brand,
      req.query
    );

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCityModelClusterPage(req, res, next) {
  try {
    const data = await getCityModelPage(
      req.params.slug,
      req.params.brand,
      req.params.model,
      req.query
    );

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCityOpportunityClusterPage(req, res, next) {
  try {
    const data = await getCityOpportunityPage(req.params.slug, req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCityBelowFipeClusterPage(req, res, next) {
  try {
    const data = await getCityBelowFipePage(req.params.slug, req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
