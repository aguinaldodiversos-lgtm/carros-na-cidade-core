import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  deleteOwnedAd,
  getDashboardPayload,
  getOwnedAd,
  listBoostOptionsAsync,
  listOwnedHistoryAds,
  listPlans,
  resolvePublishEligibility,
  updateOwnedAdStatus,
} from "./account.service.js";
import {
  createStoreProfile,
  getStoreProfile,
  updateStoreProfile,
} from "./store-profile.service.js";
import { getPersonalProfile, updatePersonalProfile } from "./personal-profile.service.js";
import multer from "multer";
import {
  MAX_STORE_MEDIA_BYTES,
  STORE_MEDIA_MIMES,
  uploadStoreMedia,
} from "./store-media.service.js";

const storeMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STORE_MEDIA_BYTES, files: 1, fields: 1 },
  fileFilter: (_req, file, callback) => {
    if (!STORE_MEDIA_MIMES.has(file.mimetype)) {
      callback(new AppError("Envie JPG, PNG ou WebP de até 6 MB.", 400));
      return;
    }
    callback(null, true);
  },
}).single("photo");

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const active = req.query.active !== "false";
    const plans = await listPlans({ type, onlyActive: active, publicOnly: true });

    res.json({
      success: true,
      plans,
    });
  })
);

router.use(authMiddleware);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const at = req.user?.account_type;
    const accountType = at === "CNPJ" ? "CNPJ" : at === "pending" ? "pending" : "CPF";
    const payload = await getDashboardPayload(req.user.id, { accountType });
    res.json(payload);
  })
);

// Consulta PURA de elegibilidade: documento + plano + limite. Não escreve nada.
//
// Até a Fase 0.1 esta rota chamava `ensureAdvertiserForUser` antes de responder,
// sem `cityId`. Era o ÚNICO caminho de produção que alcançava o fallback
// territorial do resolver — e criava o anunciante numa cidade adivinhada (ou na
// primeira da tabela) só para responder "você pode publicar?".
//
// A criação nunca foi necessária para a resposta: `resolvePublishEligibility`
// lê `users` (documento/plano) e conta anúncios por `adv.user_id`; sem linha em
// `advertisers` o JOIN devolve 0, que é a resposta correta para quem ainda não
// publicou. `docs/api/publish-eligibility.md` já dizia, desde antes, que
// advertiser "não faz parte da elegibilidade de documento/plano".
//
// O anunciante continua sendo criado no momento certo — a publicação, via
// `ensureAdvertiserForPublishing`, com a `city_id` real do anúncio.
router.post(
  "/plans/eligibility",
  asyncHandler(async (req, res) => {
    const validation = await resolvePublishEligibility(req.user.id);
    const suggestedPlans = validation.suggested_plan_type
      ? await listPlans({
          type: validation.suggested_plan_type,
          onlyActive: true,
        })
      : [];

    res.json({
      ...validation,
      suggested_plans: suggestedPlans,
    });
  })
);

router.get(
  "/boost-options",
  asyncHandler(async (_req, res) => {
    res.json({
      boost_options: await listBoostOptionsAsync(),
    });
  })
);

// Fase 3.5 — Histórico do anunciante (archived/sold/expired)
// Não inclui ativos nem em moderação (esses ficam em /dashboard.ads).
router.get(
  "/ads/history",
  asyncHandler(async (req, res) => {
    const ads = await listOwnedHistoryAds(req.user.id);
    res.json({ ads });
  })
);

router.get(
  "/ads/:id",
  asyncHandler(async (req, res) => {
    const [ad, boostOptions] = await Promise.all([
      getOwnedAd(req.user.id, req.params.id),
      listBoostOptionsAsync(),
    ]);
    res.json({
      ad,
      boost_options: boostOptions,
    });
  })
);

router.patch(
  "/ads/:id/status",
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action || "").trim();
    if (action !== "pause" && action !== "activate") {
      throw new AppError("Acao invalida", 400);
    }

    const ad = await updateOwnedAdStatus(req.user.id, req.params.id, action);
    res.json({ ad });
  })
);

router.delete(
  "/ads/:id",
  asyncHandler(async (req, res) => {
    const result = await deleteOwnedAd(req.user.id, req.params.id);
    res.json(result);
  })
);

// Conta PF — dados privados do próprio usuário, nunca de um id fornecido pelo cliente.
router.get(
  "/personal",
  asyncHandler(async (req, res) => {
    const profile = await getPersonalProfile(req.user.id);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, profile });
  })
);

router.put(
  "/personal",
  asyncHandler(async (req, res) => {
    const profile = await updatePersonalProfile(req.user.id, req.body);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, profile });
  })
);

// Envio de imagens da identidade pública (backend com R2 configurado).
// Multipart restrito, autenticado e vinculado ao CNPJ; não edita anúncios.
router.post(
  "/store/media",
  storeMediaUpload,
  asyncHandler(async (req, res) => {
    const uploaded = await uploadStoreMedia({
      userId: req.user.id,
      accountType: req.user.account_type,
      kind: req.body?.kind,
      file: req.file,
    });
    res.set("Cache-Control", "private, no-store");
    res.status(201).json({ success: true, ...uploaded });
  })
);

// --- Dados da loja (cadastro do lojista) — sempre escopado a req.user.id ---
router.get(
  "/store",
  asyncHandler(async (req, res) => {
    const store = await getStoreProfile(req.user.id);
    res.json({ success: true, store });
  })
);

router.post(
  "/store",
  asyncHandler(async (req, res) => {
    const store = await createStoreProfile(req.user.id, req.body || {});
    res.set("Cache-Control", "private, no-store");
    res.status(201).json({ success: true, store });
  })
);

router.put(
  "/store",
  asyncHandler(async (req, res) => {
    const store = await updateStoreProfile(req.user.id, req.body || {});
    res.json({ success: true, store });
  })
);

export default router;
