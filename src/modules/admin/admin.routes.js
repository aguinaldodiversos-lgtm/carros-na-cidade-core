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
import * as reportsService from "./reports/admin-reports.service.js";
import * as plansService from "./plans/admin-plans.service.js";
import * as highlightsService from "./highlights/admin-highlights.service.js";
import * as commercialSettingsService from "./commercial-settings/admin-commercial-settings.service.js";
import * as seoService from "./seo/admin-seo.service.js";
import * as homeService from "./home/admin-home.service.js";
import {
  getRegionalSettings,
  updateRegionalSettings,
} from "./regional-settings/admin-regional-settings.service.js";
import multer from "multer";
import { ACCEPTED_INPUT_MIMES } from "../../infrastructure/storage/image-normalizer.js";

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
    const body = req.body || {};
    const { days, reason } = body;
    const hasHighlightField = Object.prototype.hasOwnProperty.call(body, "highlight_until");
    const highlightUntil = body.highlight_until;

    if (days != null && days !== "") {
      const result = await adsService.grantManualBoost(
        req.user.id,
        req.params.id,
        days,
        reason
      );
      return res.json({ ok: true, data: result });
    }

    // highlight_until: null (ou string vazia) => remove o destaque explicitamente.
    if (hasHighlightField && (highlightUntil === null || highlightUntil === "")) {
      const updated = await adsService.setAdHighlight(
        req.user.id,
        req.params.id,
        null,
        reason
      );
      return res.json({ ok: true, data: updated });
    }

    if (!highlightUntil) {
      throw new AppError(
        "Informe highlight_until, days, ou highlight_until: null para remover",
        400
      );
    }

    const updated = await adsService.setAdHighlight(
      req.user.id,
      req.params.id,
      highlightUntil,
      reason
    );
    res.json({ ok: true, data: updated });
  })
);

router.patch(
  "/ads/:id/priority",
  asyncHandler(async (req, res) => {
    const { priority, reason } = req.body || {};
    if (priority === undefined || priority === null) {
      throw new AppError("Campo priority é obrigatório", 400);
    }
    const updated = await adsService.setAdPriority(
      req.user.id,
      req.params.id,
      priority,
      reason
    );
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

// Fase 3.5 — Arquivar / restaurar anúncio
router.patch(
  "/ads/:id/archive",
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const updated = await adsService.archiveAd(req.user.id, req.params.id, reason);
    res.json({ ok: true, data: updated });
  })
);

router.patch(
  "/ads/:id/restore",
  asyncHandler(async (req, res) => {
    const { reason, status } = req.body || {};
    const updated = await adsService.restoreAd(req.user.id, req.params.id, reason, status);
    res.json({ ok: true, data: updated });
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
    const result = await moderationService.requestCorrection(req.user.id, req.params.id, reason);
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

// =========================================================================
// REPORTS — fila de denuncias de anuncios (ad_reports / migration 026)
// Triagem admin: lista + detalhe + mudanca de status. Audita em
// admin_actions com target_type='ad_report'. Acoes sobre o anuncio
// relacionado reutilizam os endpoints existentes /ads/:id/*.
// =========================================================================

router.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status || undefined,
      reason: req.query.reason || undefined,
      ad_id: req.query.ad_id ? Number(req.query.ad_id) : undefined,
      q: typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
    };
    const result = await reportsService.listReports(filters);
    res.json({ ok: true, ...result });
  })
);

// IMPORTANTE: declarar /reports/summary ANTES de /reports/:id para o
// roteador casar o path correto (senao :id captura 'summary' como id).
router.get(
  "/reports/summary",
  asyncHandler(async (_req, res) => {
    const summary = await reportsService.getReportsSummary();
    res.json({ ok: true, data: summary });
  })
);

router.get(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const report = await reportsService.getReportById(req.params.id);
    res.json({ ok: true, data: report });
  })
);

router.patch(
  "/reports/:id/status",
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body || {};
    if (!status) throw new AppError("Campo status é obrigatório", 400);
    const updated = await reportsService.changeReportStatus(
      req.user.id,
      req.params.id,
      status,
      reason
    );
    res.json({ ok: true, data: updated });
  })
);

// =========================================================================
// COMMERCIAL — Fase 2: planos, destaques, regras comerciais.
// Protecao herdada de router.use(authMiddleware) + requireAdmin(). Reuso de
// endpoints existentes: PATCH /ads/:id/highlight (grantManualBoost / clear)
// continua sendo o ponto unico de MUTATION para destaque — esta seccao so
// EXPOE listagem/summary novos. Audit em admin_actions:
// target_type='subscription_plan' | 'commercial_settings' | 'ad'.
// =========================================================================

// ───── Plans ─────────────────────────────────────────────────────────────

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const includeInactive = String(req.query.include_inactive ?? "true").toLowerCase() !== "false";
    const result = await plansService.listPlans({ includeInactive });
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    const plan = await plansService.getPlanById(req.params.id);
    res.json({ ok: true, data: plan });
  })
);

router.get(
  "/plans/:id/subscriptions",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 100);
    const offset = parseIntParam(req.query.offset, 0);
    const result = await plansService.listPlanSubscriptions(req.params.id, { limit, offset });
    res.json({ ok: true, ...result });
  })
);

router.post(
  "/plans",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const created = await plansService.createPlan(req.user.id, payload, reason);
    res.status(201).json({ ok: true, data: created });
  })
);

router.patch(
  "/plans/:id",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const updated = await plansService.updatePlan(req.user.id, req.params.id, payload, reason);
    res.json({ ok: true, data: updated });
  })
);

router.patch(
  "/plans/:id/status",
  asyncHandler(async (req, res) => {
    const { is_active, reason } = req.body || {};
    if (typeof is_active !== "boolean") {
      throw new AppError("Campo is_active (boolean) é obrigatório", 400);
    }
    const updated = await plansService.setPlanActive(req.user.id, req.params.id, is_active, reason);
    res.json({ ok: true, data: updated });
  })
);

// ───── Highlights ────────────────────────────────────────────────────────

router.get(
  "/highlights/summary",
  asyncHandler(async (req, res) => {
    const summary = await highlightsService.getHighlightsSummary({
      expiring_days: req.query.expiring_days,
    });
    res.json({ ok: true, data: summary });
  })
);

router.get(
  "/highlights",
  asyncHandler(async (req, res) => {
    const result = await highlightsService.listHighlights({
      mode: req.query.mode,
      city: req.query.city,
      advertiser_id: req.query.advertiser_id,
      ad_id: req.query.ad_id,
      expiring_days: req.query.expiring_days,
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
    });
    res.json({ ok: true, ...result });
  })
);

// ───── Commercial settings (platform_settings#commercial.*) ──────────────

router.get(
  "/commercial-settings",
  asyncHandler(async (_req, res) => {
    const data = await commercialSettingsService.getCommercialSettings();
    res.json({ ok: true, data });
  })
);

router.patch(
  "/commercial-settings",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const data = await commercialSettingsService.updateCommercialSettings({
      adminUserId: req.user.id,
      payload,
      reason,
    });
    res.json({ ok: true, data });
  })
);

// =========================================================================
// SEO — Fase 3: visibilidade e controle sobre seo_publications +
// seo_cluster_plans + sitemaps. Audita em admin_actions com
// target_type='seo_publication'. Sem mutation em massa: edicao 1-a-1.
// =========================================================================

router.get(
  "/seo/overview",
  asyncHandler(async (_req, res) => {
    const data = await seoService.getOverview();
    res.json({ ok: true, data });
  })
);

router.get(
  "/seo/publications",
  asyncHandler(async (req, res) => {
    const indexableRaw = req.query.is_indexable;
    const filters = {
      status: req.query.status || undefined,
      publication_type: req.query.publication_type || undefined,
      is_indexable:
        indexableRaw === "true" ? true : indexableRaw === "false" ? false : undefined,
      has_error: req.query.has_error === "true" ? true : undefined,
      uf: req.query.uf || undefined,
      city: req.query.city || undefined,
      q:
        typeof req.query.q === "string" && req.query.q.trim()
          ? req.query.q.trim()
          : undefined,
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
    };
    const result = await seoService.listPublications(filters);
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/seo/publications/:id",
  asyncHandler(async (req, res) => {
    const data = await seoService.getPublicationById(req.params.id);
    res.json({ ok: true, data });
  })
);

router.patch(
  "/seo/publications/:id",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const updated = await seoService.updatePublication(
      req.user.id,
      req.params.id,
      payload,
      reason
    );
    res.json({ ok: true, data: updated });
  })
);

router.get(
  "/seo/sitemaps",
  asyncHandler(async (_req, res) => {
    const result = await seoService.listSitemaps();
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/seo/issues",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 100);
    const data = await seoService.listIssues({ limit });
    res.json({ ok: true, data });
  })
);

// =========================================================================
// HOME / CONTEÚDO — Fase 4.1: gestão do hero da Home.
// Audita em admin_actions com target_type='home_content' (target_id =
// 'home_hero'). Upload de imagem reusa pipeline R2 (uploadSiteImage) —
// converte para WebP, EXIF strip, key estável em site/home-hero/...
// =========================================================================

const homeImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB — banner de campanha; menor que veículo (10MB)
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "")
      .trim()
      .toLowerCase()
      .replace(/^image\/(jpg|x-jpg|pjpeg)$/, "image/jpeg");
    if (ACCEPTED_INPUT_MIMES.has(mime)) {
      cb(null, true);
      return;
    }
    cb(
      new AppError(
        `Formato não suportado: "${file.mimetype || "desconhecido"}". Aceitos: JPEG, PNG, WebP, HEIC/HEIF.`,
        400
      )
    );
  },
});

router.get(
  "/home/hero",
  asyncHandler(async (_req, res) => {
    const data = await homeService.getHero();
    res.json({ ok: true, data });
  })
);

router.patch(
  "/home/hero",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const data = await homeService.updateHero({
      adminUserId: req.user.id,
      payload,
      reason,
    });
    res.json({ ok: true, data });
  })
);

router.post(
  "/home/hero/image",
  homeImageUpload.single("image"),
  asyncHandler(async (req, res) => {
    const variant = String(req.query.variant || req.body?.variant || "desktop").toLowerCase();
    const data = await homeService.uploadHeroImage({
      adminUserId: req.user.id,
      file: req.file,
      variant,
    });
    res.json({ ok: true, data });
  })
);

export default router;
