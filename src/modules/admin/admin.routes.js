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
import { getAiHealth } from "./seo/admin-seo-ai.service.js";
import * as homeService from "./home/admin-home.service.js";
import * as blogService from "./blog/admin-blog.service.js";
import * as analyticsService from "../analytics/analytics.service.js";
import * as supportAdminService from "../support/support.admin.service.js";
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
      const result = await adsService.grantManualBoost(req.user.id, req.params.id, days, reason);
      return res.json({ ok: true, data: result });
    }

    // highlight_until: null (ou string vazia) => remove o destaque explicitamente.
    if (hasHighlightField && (highlightUntil === null || highlightUntil === "")) {
      const updated = await adsService.setAdHighlight(req.user.id, req.params.id, null, reason);
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
    const updated = await adsService.setAdPriority(req.user.id, req.params.id, priority, reason);
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

/**
 * Concessão MANUAL de plano (cortesia / teste / brinde / negociação).
 * NÃO gera cobrança, NÃO chama Mercado Pago, NÃO depende de PAYMENTS_LIVE.
 * Herda authMiddleware + requireAdmin (apenas admin concede).
 */
router.post(
  "/advertisers/:id/plan-grant",
  asyncHandler(async (req, res) => {
    const {
      plan_id: planId,
      duration_days: durationDays,
      duration_months: durationMonths,
      reason_type: reasonType,
      reason_note: reasonNote,
    } = req.body || {};
    const granted = await advertisersService.grantAdvertiserPlan(req.user.id, req.params.id, {
      planId,
      durationDays,
      durationMonths,
      reasonType,
      reasonNote,
    });
    res.status(201).json({ ok: true, data: granted });
  })
);

router.post(
  "/advertisers/:id/plan-grant/cancel",
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const revoked = await advertisersService.revokeAdvertiserPlan(
      req.user.id,
      req.params.id,
      reason
    );
    res.json({ ok: true, data: revoked });
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

/**
 * Fase 5.0 — saúde/diagnóstico do gate de pagamentos. Read-only, admin-only
 * (herda authMiddleware + requireAdmin). Mostra o modo efetivo (mock|sandbox
 * |live), se token/segredo estão presentes (sem expor valores) e warnings de
 * misconfiguração. Use para confirmar, sem deploy, que produção está em mock.
 */
router.get(
  "/payments/health",
  asyncHandler(async (_req, res) => {
    const data = paymentsService.getPaymentsHealth();
    res.json({ ok: true, data });
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
      is_indexable: indexableRaw === "true" ? true : indexableRaw === "false" ? false : undefined,
      has_error: req.query.has_error === "true" ? true : undefined,
      uf: req.query.uf || undefined,
      city: req.query.city || undefined,
      q: typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined,
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
    const updated = await seoService.updatePublication(req.user.id, req.params.id, payload, reason);
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

/**
 * Saúde SEO/IA (Fase 4.3, §15): qualidade dos anúncios ativos (score, sem
 * preço/cidade/imagem/descrição), posts do CMS (publicados sem meta, curtos,
 * slug duplicado) e páginas territoriais indexáveis/noindex por tipo.
 */
router.get(
  "/seo/ai-health",
  asyncHandler(async (req, res) => {
    const limit = parseIntParam(req.query.limit, 1000);
    const data = await getAiHealth({ limit });
    res.json({ ok: true, data });
  })
);

// =========================================================================
// HOME / CONTEÚDO — Fase 4.1.1: carrossel de até 3 banners do hero.
// Cada banner é uma row em home_sections (section_type='home_hero',
// position=1..3). PATCH em :position altera APENAS aquele banner; os
// demais nunca são tocados (repository.updateByPosition filtra no WHERE).
// Audit em admin_actions: action='update_home_hero_banner',
// target_type='home_content', target_id='home_hero_<position>'.
// Upload R2: site/home-hero/<position>/<variant>/<yyyy>/<mm>/<uuid>.webp.
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

/**
 * Lista os 3 banners (Banner 1/2/3) — ordenados por position. Inclui
 * inativos (admin precisa enxergar para editar/ativar).
 *
 * Contrato: { ok: true, data: { banners: HomeHeroBanner[] } }. Embrulhar
 * em objeto (em vez de array no topo) facilita extensão (ex.: adicionar
 * `max_banners` ou `section_meta` no futuro).
 */
router.get(
  "/home/hero",
  asyncHandler(async (_req, res) => {
    const banners = await homeService.listHeroBanners();
    res.json({ ok: true, data: { banners } });
  })
);

/**
 * Detalhe de um banner único — útil para tela de edição focada. Mesma
 * autorização que /home/hero (requireAdmin global). Validação de
 * position vive no service.
 */
router.get(
  "/home/hero/:position",
  asyncHandler(async (req, res) => {
    const data = await homeService.getHeroBanner(req.params.position);
    if (!data) throw new AppError("Banner não encontrado.", 404);
    res.json({ ok: true, data });
  })
);

/**
 * PATCH em um banner específico. Body: { ...campos, reason }. Reason
 * obrigatório. Audit registra com target_id = home_hero_<position>.
 */
router.patch(
  "/home/hero/:position",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const data = await homeService.updateHeroBanner({
      adminUserId: req.user.id,
      position: req.params.position,
      payload,
      reason,
    });
    res.json({ ok: true, data });
  })
);

/**
 * Upload de imagem para um banner específico. variant=desktop|mobile via
 * querystring OU body. Retorna URL pública R2 — gravação no banco só
 * ocorre quando admin clica "Publicar" e dispara PATCH.
 */
router.post(
  "/home/hero/:position/image",
  homeImageUpload.single("image"),
  asyncHandler(async (req, res) => {
    const variant = String(req.query.variant || req.body?.variant || "desktop").toLowerCase();
    const data = await homeService.uploadHeroImage({
      adminUserId: req.user.id,
      position: req.params.position,
      file: req.file,
      variant,
    });
    res.json({ ok: true, data });
  })
);

// =========================================================================
// BLOG — Fase 4.2: CMS editorial do Blog.
// Posts vivem em blog_posts. Workflow: draft → published → unpublished →
// archived (restore volta para draft/unpublished). Público vê APENAS
// published (rotas em public.routes.js). Transições têm endpoints
// dedicados com reason obrigatório; PATCH genérico não altera status.
// Audit em admin_actions: create/update/publish/unpublish/archive/
// restore_blog_post, target_type='blog_post', target_id=<id>.
// Upload R2: site/blog/cover/<yyyy>/<mm>/<uuid>.webp.
// =========================================================================

const blogCoverUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB — capa editorial; mesmo teto dos banners da Home
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

/**
 * Lista posts com filtros: status, search (título/slug), limit, offset.
 * Contrato: { ok: true, data: [...], total, limit, offset }.
 */
router.get(
  "/blog/posts",
  asyncHandler(async (req, res) => {
    const result = await blogService.listAdminPosts({
      status: req.query.status || undefined,
      search: req.query.search || undefined,
      limit: parseIntParam(req.query.limit, 50),
      offset: parseIntParam(req.query.offset, 0),
    });
    res.json({ ok: true, ...result });
  })
);

router.get(
  "/blog/posts/:id",
  asyncHandler(async (req, res) => {
    const data = await blogService.getAdminPostById(req.params.id);
    res.json({ ok: true, data });
  })
);

/**
 * Cria post como DRAFT. Exige título; slug é derivado quando ausente.
 * reason opcional (criar rascunho não exige motivo).
 */
router.post(
  "/blog/posts",
  asyncHandler(async (req, res) => {
    const data = await blogService.createPost({
      adminUserId: req.user.id,
      payload: req.body || {},
    });
    res.status(201).json({ ok: true, data });
  })
);

/**
 * PATCH de campos do post. Status NÃO é editável aqui (use as transições
 * abaixo). reason opcional — auditoria update_blog_post sempre registrada.
 */
router.patch(
  "/blog/posts/:id",
  asyncHandler(async (req, res) => {
    const { reason, ...payload } = req.body || {};
    const data = await blogService.updatePost({
      adminUserId: req.user.id,
      id: req.params.id,
      payload,
      reason,
    });
    res.json({ ok: true, data });
  })
);

/** Publica (draft|unpublished → published). reason OBRIGATÓRIO. */
router.patch(
  "/blog/posts/:id/publish",
  asyncHandler(async (req, res) => {
    const data = await blogService.publishPost({
      adminUserId: req.user.id,
      id: req.params.id,
      reason: req.body?.reason,
    });
    res.json({ ok: true, data });
  })
);

/** Despublica (published → unpublished). reason OBRIGATÓRIO. */
router.patch(
  "/blog/posts/:id/unpublish",
  asyncHandler(async (req, res) => {
    const data = await blogService.unpublishPost({
      adminUserId: req.user.id,
      id: req.params.id,
      reason: req.body?.reason,
    });
    res.json({ ok: true, data });
  })
);

/** Arquiva (draft|published|unpublished → archived). reason OBRIGATÓRIO. */
router.patch(
  "/blog/posts/:id/archive",
  asyncHandler(async (req, res) => {
    const data = await blogService.archivePost({
      adminUserId: req.user.id,
      id: req.params.id,
      reason: req.body?.reason,
    });
    res.json({ ok: true, data });
  })
);

/**
 * Restaura post arquivado → draft (default) ou unpublished
 * (body.to_status). reason OBRIGATÓRIO.
 */
router.patch(
  "/blog/posts/:id/restore",
  asyncHandler(async (req, res) => {
    const data = await blogService.restorePost({
      adminUserId: req.user.id,
      id: req.params.id,
      reason: req.body?.reason,
      toStatus: req.body?.to_status,
    });
    res.json({ ok: true, data });
  })
);

/**
 * Upload da imagem de capa. Retorna URL pública R2 — gravação no banco só
 * ocorre quando o admin salva o post (PATCH com cover_image_url + alt).
 */
router.post(
  "/blog/posts/:id/cover-image",
  blogCoverUpload.single("image"),
  asyncHandler(async (req, res) => {
    const data = await blogService.uploadCoverImage({
      adminUserId: req.user.id,
      id: req.params.id,
      file: req.file,
    });
    res.json({ ok: true, data });
  })
);

/**
 * Upload de imagem para o MEIO do conteúdo (Fase 4.2.2). Mesmo limite/filtro
 * da capa (8MB, JPEG/PNG/WebP/HEIC). Retorna URL pública R2 — gravação no
 * post só ocorre quando o admin salva (PATCH content com ![alt](url)).
 */
router.post(
  "/blog/posts/:id/content-image",
  blogCoverUpload.single("image"),
  asyncHandler(async (req, res) => {
    const data = await blogService.uploadContentImage({
      adminUserId: req.user.id,
      id: req.params.id,
      file: req.file,
    });
    res.json({ ok: true, data });
  })
);

// ───────────────────────────────────────────────────────────────────────────
// Analytics interno (Fase 4.4) — leituras agregadas (admin-only).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Overview do dashboard. Filtros: period=7d|30d|90d, state, city_slug.
 * Retorna totals + timeseries + rankings (cidades/regiões/páginas/anúncios/
 * posts/origens) + eventos comerciais + anúncios com poucos contatos.
 */
router.get(
  "/analytics/overview",
  asyncHandler(async (req, res) => {
    const data = await analyticsService.getOverview({
      period: req.query.period,
      state: req.query.state,
      citySlug: req.query.city_slug,
    });
    res.json({ ok: true, data });
  })
);

/** Métricas de um anúncio (views 7/30d + cliques + taxa de contato). */
router.get(
  "/analytics/ads/:id",
  asyncHandler(async (req, res) => {
    const data = await analyticsService.getAdMetrics(req.params.id);
    res.json({ ok: true, data });
  })
);

/** Métricas de um post do blog (views + origens de tráfego). */
router.get(
  "/analytics/posts/:id",
  asyncHandler(async (req, res) => {
    const data = await analyticsService.getPostMetrics(req.params.id);
    res.json({ ok: true, data });
  })
);

// =========================================================================
// SUPPORT (chamados de suporte usuário↔admin)
// =========================================================================

/** Resumo por status (KPIs da fila). */
router.get(
  "/support/summary",
  asyncHandler(async (_req, res) => {
    const data = await supportAdminService.getSummary();
    res.json({ ok: true, data });
  })
);

/** Lista TODOS os chamados. Filtros: status, q (assunto/nome/e-mail), paginação. */
router.get(
  "/support/tickets",
  asyncHandler(async (req, res) => {
    const { data, total, limit, offset } = await supportAdminService.listTickets({
      status: req.query.status,
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ ok: true, data, total, limit, offset });
  })
);

/** Chamado + thread completa + dados do autor. */
router.get(
  "/support/tickets/:id",
  asyncHandler(async (req, res) => {
    const data = await supportAdminService.getTicket(req.params.id);
    res.json({ ok: true, data });
  })
);

/** Resposta do admin (author_role=admin). Move para 'em_andamento' + e-mail ao usuário. */
router.post(
  "/support/tickets/:id/messages",
  asyncHandler(async (req, res) => {
    const data = await supportAdminService.replyToTicket(req.user.id, req.params.id, req.body || {});
    res.status(201).json({ ok: true, data });
  })
);

/** Mudança manual de status (aberto | em_andamento | resolvido). */
router.patch(
  "/support/tickets/:id",
  asyncHandler(async (req, res) => {
    const data = await supportAdminService.changeStatus(req.params.id, req.body || {});
    res.json({ ok: true, data });
  })
);

export default router;
