import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  deleteOwnedAd,
  getDashboardPayload,
  getOwnedAd,
  listBoostOptions,
  listPlans,
  resolvePublishEligibility,
  updateOwnedAdStatus,
} from "./account.service.js";
import { ensureAdvertiserForUser } from "../advertisers/advertiser.ensure.service.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get(
  "/plans",
  asyncHandler(async (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const active = req.query.active !== "false";
    const plans = await listPlans({ type, onlyActive: active });

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
    const payload = await getDashboardPayload(req.user.id);
    res.json(payload);
  })
);

router.post(
  "/plans/eligibility",
  asyncHandler(async (req, res) => {
    await ensureAdvertiserForUser(String(req.user.id), {
      source: "plans_eligibility",
    });
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
      boost_options: listBoostOptions(),
    });
  })
);

router.get(
  "/ads/:id",
  asyncHandler(async (req, res) => {
    const ad = await getOwnedAd(req.user.id, req.params.id);
    res.json({
      ad,
      boost_options: listBoostOptions(),
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

export default router;
