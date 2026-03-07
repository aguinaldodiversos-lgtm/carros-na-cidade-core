// src/modules/ads/autocomplete/ads-autocomplete.controller.js

import {
  getFlatAutocompleteSuggestions,
  getSemanticAutocomplete,
} from "./ads-autocomplete.service.js";

export async function autocomplete(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const currentCitySlug = req.query.current_city_slug
      ? String(req.query.current_city_slug).trim()
      : null;
    const limit = Number(req.query.limit || 8);

    const suggestions = await getFlatAutocompleteSuggestions(q, {
      currentCitySlug,
      limit,
    });

    res.json({
      success: true,
      suggestions,
    });
  } catch (err) {
    next(err);
  }
}

export async function semanticAutocomplete(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const currentCitySlug = req.query.current_city_slug
      ? String(req.query.current_city_slug).trim()
      : null;
    const limit = Number(req.query.limit || 8);

    const data = await getSemanticAutocomplete(q, {
      currentCitySlug,
      limit,
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
