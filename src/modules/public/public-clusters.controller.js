// src/modules/public/public-clusters.controller.js

import { getCityPublicPage } from "../../read-models/cities/city-public.service.js";
import { getCityBrandPage } from "../../read-models/cities/city-brand.service.js";
import { getCityModelPage } from "../../read-models/cities/city-model.service.js";
import {
  getCityOpportunityPage,
  getCityBelowFipePage,
} from "../../read-models/cities/city-opportunity.service.js";
import { getCitySeoOverview } from "../../read-models/cities/city-seo-overview.service.js";

/**
 * CitySeoOverview (Fase 3) — payload único dos módulos de autoridade local
 * (mercado, marcas, modelos comerciais, lojas, cidades próximas).
 *
 * Cidade inexistente devolve 404 explícito. O consumidor SSR trata 404 como
 * "sem overview" e renderiza a página sem os módulos — nunca com números de
 * outra cidade.
 */
export async function getCitySeoOverviewPage(req, res, next) {
  try {
    const data = await getCitySeoOverview(req.params.slug);

    if (!data) {
      return res.status(404).json({ success: false, message: "Cidade não encontrada" });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

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
    const data = await getCityBrandPage(req.params.slug, req.params.brand, req.query);

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
