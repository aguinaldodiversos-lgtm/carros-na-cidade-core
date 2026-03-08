import express from "express";
import { getMetricsSnapshot } from "../shared/observability/metrics.registry.js";

const router = express.Router();

router.get("/metrics", (_req, res) => {
  res.status(200).json({
    success: true,
    data: getMetricsSnapshot(),
  });
});

export default router;
