import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { requireAdmin } from "../../shared/middlewares/role.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

import * as dashboardService from "./dashboard/admin-dashboard.service.js";
import * as adsService from "./ads/admin-ads.service.js";
import * as advertisersService from "./advertisers/admin-advertisers.service.js";
import * as paymentsService from "./payments/admin-payments.service.js";
import * as metricsService from "./metrics/admin-metrics.service.js";
import * as moderationService from "./moderation/admin-moderation.service.js";
import {
  getRegionalSettings,
  updateRegionalSettings,
} from "./regional-settings/admin-regional-settings.service.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseIntParam(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

router.use(authMiddleware);
router.use(requireAdmin());

// =========================================================================
// DASHBOARD
// =========================================================================

router.get(
  "/dashboard/overview",
  asyncHandler(async (_req, res) => {
    const overview = await dashboardService.getOverview();
    res.json({ ok: true, data: overview });
  })
);

router.get(
  "/dashboard/kpis",
  asyncHandler(async (req, res) => {
    const periodDays = parseIntParam(req.query.period_days, 30);
    const kpis = await dashboardService.getKpis({ periodDays });
    res.json({ ok: true, data: kpis });
  })
);

// =========================================================================
// ADS
// =========================================================================

router.get(
  "/ads",
  asyncHandler(async (req, res) => {
    const filters = {
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
      status: req.query.status || undefined,
      city_id: req.query.city_id || undefined,
      advertiser_id: req.query.advertiser_id || undefined,
    };
    const result = await adsService.listAds(filters);
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/ads/:id",
  asyncHandler(async (req, res) => {
    const ad = await adsService.getAdById(req.params.id);
    res.json({ ok: true, data: ad });
  })
);

router.patch(
  "/ads/:id/status",
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body || {};
    if (!status) throw new AppError("Campo status é obrigatório", 400);
    const updated = await adsService.changeAdStatus(req.user.id, req.params.id, status, reason);
    res.json({ ok: true, data: updated });
  })
);

router.patch(
  "/ads/:id/highlight",
  asyncHandler(async (req, res) => {
    const { highlight_until, days } = req.body || {};

    if (days) {
      const result = await adsService.grantManualBoost(
        req.user.id,
        req.params.id,
        days,
        req.body.reason
      );
      return res.json({ ok: true, data: result });
    }

    if (!highlight_until) {
      throw new AppError("Informe highlight_until ou days", 400);
    }

    const updated = await adsService.setAdHighlight(req.user.id, req.params.id, highlight_until);
    res.json({ ok: true, data: updated });
  })
);

router.patch(
  "/ads/:id/priority",
  asyncHandler(async (req, res) => {
    const { priority } = req.body || {};
    if (priority === undefined || priority === null) {
      throw new AppError("Campo priority é obrigatório", 400);
    }
    const updated = await adsService.setAdPriority(req.user.id, req.params.id, priority);
    res.json({ ok: true, data: updated });
  })
);

router.get(
  "/ads/:id/metrics",
  asyncHandler(async (req, res) => {
    const metrics = await adsService.getAdMetrics(req.params.id);
    res.json({ ok: true, data: metrics });
  })
);

router.get(
  "/ads/:id/events",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 50);
    const events = await adsService.getAdEvents(req.params.id, { limit });
    res.json({ ok: true, data: events });
  })
);

// =========================================================================
// ADVERTISERS
// =========================================================================

router.get(
  "/advertisers",
  asyncHandler(async (req, res) => {
    const filters = {
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
      status: req.query.status || undefined,
    };
    const result = await advertisersService.listAdvertisers(filters);
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/advertisers/:id",
  asyncHandler(async (req, res) => {
    const advertiser = await advertisersService.getAdvertiserById(req.params.id);
    res.json({ ok: true, data: advertiser });
  })
);

router.patch(
  "/advertisers/:id/status",
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body || {};
    if (!status) throw new AppError("Campo status é obrigatório", 400);
    const updated = await advertisersService.changeAdvertiserStatus(
      req.user.id,
      req.params.id,
      status,
      reason
    );
    res.json({ ok: true, data: updated });
  })
);

router.get(
  "/advertisers/:id/ads",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 50);
    const offset = parseIntParam(req.query.offset, 0);
    const ads = await advertisersService.getAdvertiserAds(req.params.id, { limit, offset });
    res.json({ ok: true, data: ads });
  })
);

// =========================================================================
// PAYMENTS
// =========================================================================

router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const filters = {
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
      status: req.query.status || undefined,
      context: req.query.context || undefined,
    };
    const result = await paymentsService.listPayments(filters);
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/payments/summary",
  asyncHandler(async (req, res) => {
    const periodDays = parseIntParam(req.query.period_days, 30);
    const summary = await paymentsService.getPaymentsSummary({ periodDays });
    res.json({ ok: true, data: summary });
  })
);

// =========================================================================
// METRICS
// =========================================================================

router.get(
  "/metrics/ads/top",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 20);
    const data = await metricsService.getTopAds({ limit });
    res.json({ ok: true, data });
  })
);

router.get(
  "/metrics/cities",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 30);
    const data = await metricsService.getCityMetrics({ limit });
    res.json({ ok: true, data });
  })
);

router.get(
  "/metrics/events/recent",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 50);
    const data = await metricsService.getRecentEvents({ limit });
    res.json({ ok: true, data });
  })
);

router.get(
  "/metrics/seo/cities",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 30);
    const data = await metricsService.getSeoCityMetrics({ limit });
    res.json({ ok: true, data });
  })
);

// =========================================================================
// MODERATION (fila de pending_review — Tarefa 7 da rodada antifraude)
// =========================================================================

router.get(
  "/moderation/ads",
  asyncHandler(async (req, res) => {
    const result = await moderationService.listPending({
      limit: req.query.limit,
      offset: req.query.offset,
      city_id: req.query.city_id,
      severity: req.query.severity,
      below_fipe_only: req.query.below_fipe_only,
    });
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/moderation/ads/:id",
  asyncHandler(async (req, res) => {
    const detail = await moderationService.getDetail(req.params.id);
    res.json({ ok: true, data: detail });
  })
);

router.post(
  "/moderation/ads/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await moderationService.approve(req.user.id, req.params.id);
    res.json({ ok: true, data: result });
  })
);

router.post(
  "/moderation/ads/:id/reject",
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) throw new AppError("Motivo da rejeição é obrigatório.", 400);
    const result = await moderationService.reject(req.user.id, req.params.id, reason);
    res.json({ ok: true, data: result });
  })
);

router.post(
  "/moderation/ads/:id/request-correction",
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) throw new AppError("Motivo da solicitação é obrigatório.", 400);
    const result = await moderationService.requestCorrection(
      req.user.id,
      req.params.id,
      reason
    );
    res.json({ ok: true, data: result });
  })
);

// =========================================================================
// REGIONAL SETTINGS — radius_km da Página Regional (default 80, range 10–150)
// =========================================================================

router.get(
  "/regional-settings",
  asyncHandler(async (_req, res) => {
    const data = await getRegionalSettings();
    res.json({ ok: true, data });
  })
);

router.patch(
  "/regional-settings",
  asyncHandler(async (req, res) => {
    const data = await updateRegionalSettings({
      adminUserId: req.user.id,
      payload: req.body || {},
    });
    res.json({ ok: true, data });
  })
);

export default router;
